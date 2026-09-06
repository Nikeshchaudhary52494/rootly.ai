# Security model

The threat this whole system is built around: **an LLM's output is
untrusted input, not a trusted decision.** It can suggest a test to run, a
patch to apply, a claim about what a file contains — and every one of those
suggestions is checked against something real (a container's real exit
code, a file's real content, a hash computed before the LLM was ever
involved) before it's acted on. This doc is the mechanics of how that holds,
end to end.

## Sandbox isolation

Every reproduction and fix-validation run happens in a container built by
`DockerSandbox` (`packages/reproduction/src/sandbox/docker-sandbox.ts`):

```
docker create
  --network none              no network access, at all
  --memory <limit>             hard memory cap
  --cpus <limit>                hard CPU cap
  --pids-limit <limit>           caps forkbomb-style abuse
  --security-opt no-new-privileges
  --cap-drop ALL                every Linux capability dropped
  --workdir /workspace
```

Beyond those flags:

- **No bind mounts, ever.** Code enters the container only via `docker cp`
  — a one-way copy into an already-created, not-yet-started container.
  There is no live shared filesystem between host and sandbox in either
  direction.
- **The Docker socket is never mounted or referenced** inside the
  container — a compromised sandbox process has no path to controlling
  Docker itself.
- **Timeout is enforced twice.** A `docker kill` fires at the configured
  timeout (killing every process in the container, not just detaching the
  CLI), and a second, longer safety-net timeout wraps the whole `docker
  exec` call in case `kill` itself hangs.
- **The container is always removed**, success or failure — `destroy()` is
  called in a `finally` and is safe to call more than once.
- **The `docker` subprocess itself gets a minimal environment** (`{ PATH }`
  only, never the parent process's full env) — the same instinct as the
  secrets handling below: don't let a value leak through a channel that
  didn't need it.

This is exercised with real containers, not mocks, in
`docker-sandbox.security.test.ts` (see
[packages/reproduction/README.md](../packages/reproduction/README.md)).

## Commands are never assembled from AI output

Nowhere in this codebase does an LLM's output get concatenated into a shell
string. Every process this system runs — inside a sandbox or on the host,
`git`, `npm`, or `jest` — is invoked as a fixed argv array
(`spawn('docker', [...])`, `runGit([...])`) that this code constructs. The
model produces file *content* (a test, a patch); it never produces a
command. This is what makes the static content-scanning gates in
[pipeline.md](pipeline.md#reproduction) (no `child_process`, `eval`,
`exec`, in generated tests) meaningful rather than trivially bypassable —
there's no path from "AI-generated string" to "thing that gets executed as
a shell command" at all.

## Anti-hallucination grounding

The single check that matters most in the fix stage:
`verifyOriginalContent()` re-reads the real file at the AI's claimed line
range and compares it byte-for-byte against what the model said was there.
See [pipeline.md](pipeline.md#fix-generation-and-validation) for the full
mechanics and a real case where this caught a genuine prompt bug (missing
context, not a malicious model) during this project's own development —
the check did exactly its job either way: a claim about the codebase that
doesn't match the codebase is rejected, full stop, regardless of *why* it
was wrong.

The same principle extends to promotion: `PrPromotionInput.patches` carries
`originalContent` per file, and the promotion step (`pr-promotion.ts`)
re-checks that the checked-out file still matches it before writing the
patched content — the "current content no longer matches the content
validated" case returns `PATCH_APPLICATION_FAILED` rather than silently
patching against whatever the file happens to contain now.

## Patch integrity

`FixAttempt.validatedPatchHash` is a SHA-256 of the exact patch content at
the moment it was verified `FIX_VERIFIED`. Promotion recomputes that hash
from the `FixPatch` rows it's about to push and refuses to proceed if it
doesn't match. This closes a specific gap: without it, nothing would stop a
patch from being edited (in the DB, or by a future code change to the
promotion path) between validation and push — "verified" and "pushed" could
silently drift apart. With it, "pushed" is contractually the same bytes as
"proven to work in a sandbox."

## Human-in-the-loop by construction

Nothing in this codebase calls a merge, approval, or deployment API —
not "nothing does by default," nothing *can*, because no such call exists
anywhere in the dependency graph. `FixAttempt.result === 'FIX_VERIFIED'`
requires a real sandbox run to have actually passed; opening a GitHub PR is
the last automated step in every path through the system.
`PullRequest.status` can become `MERGED`, but only by `GET
/pull-requests/:id/refresh` observing that GitHub already reports it
merged — because a human merged it there.

## Secrets

GitHub PATs (`Repository.encryptedAccessToken`) are AES-256-GCM encrypted
at rest and decrypted only in-process, for the duration of one operation.
From there:

- Used as a **one-off git credential override** — passed via `-c
  http.extraHeader=...` on the specific `clone`/`push` subprocess call that
  needs it, never written to `.git/config` long-term (see
  [decisions.md](decisions.md#a-real-gotcha-githubs-git-protocol-doesnt-speak-bearer)
  for a real bug that happened *because* `git clone -c` briefly persists
  that header into the clone's local config — and the fix, which strips it
  immediately after clone).
- Never set as a persistent environment variable, and never forwarded into
  a sandbox — the sandbox has no network access in the first place, so
  there's nothing for a credential to reach even if it were somehow
  present.
- Never logged and never returned in an API response — `sanitize()` helpers
  strip the raw token out of any error message before it's persisted to a
  `errorMessage` column or returned to a client, and this is verified by a
  test everywhere a token is touched.
- API keys (`ApiKey.keyHash`) are hashed, not encrypted — the raw key is
  shown exactly once, at creation, and is never stored or recoverable
  after that.

## What's explicitly out of scope (for now)

- **No auth on management routes.** See
  [decisions.md](decisions.md#no-auth-yet) — the API key model only covers
  the SDK's ingestion path.
- **No rate limiting or abuse protection** beyond GitHub's own API rate
  limits (surfaced as a classified `GITHUB_RATE_LIMITED` failure, not
  retried automatically).
- **Single language/framework**: the validators and sandbox image assume
  JavaScript/TypeScript + Jest. A malicious or malformed test in another
  language wouldn't be caught by the JS-specific pattern checks — this
  isn't a gap so much as a boundary of what's supported at all right now.
