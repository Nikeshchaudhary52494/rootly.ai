# Engineering decisions

Things that shape the whole codebase rather than one package, and the
reasoning behind them — including two real bugs this project shipped and
fixed, kept here as worked examples rather than just fixed and forgotten.

## Deterministic classification, everywhere

The one rule that shows up in every pipeline stage: **when the system needs
to know whether something is actually true — did the bug reproduce, did the
fix work — that answer comes from a real process's exit code and output,
never from asking the LLM.** `classifyReproduction()` and the fix-engine's
equivalent are pure functions over `{exitCode, stdout, stderr, timedOut}`.
The LLM's job everywhere is to *propose* (a test, a patch, a hypothesis);
proving is always done by actually running something and reading what really
happened. See [pipeline.md](pipeline.md) for where this shows up in each
stage.

## No queue/worker

Every pipeline stage runs as a fire-and-forget async function inside the API
process (see
[architecture.md](architecture.md#the-async-pattern-create-a-row-return-do-the-work-in-the-background)) —
no Redis, no BullMQ, nothing. If the API process restarts mid-run, that run
just looks stuck; nothing resumes it automatically.

This is a scope decision, not an oversight: none of the `packages/*` units
know they're being called from an in-process function rather than a worker
picking a job off a queue — each one takes typed input and returns a typed
result. Moving a stage behind a real queue later means changing the
`apps/api/src/*/*.service.ts` wiring that calls it, not the package itself.

## No auth (yet)

API keys gate `POST /events` (the SDK's ingestion path) — that's the one
endpoint an untrusted, deployed application actually calls. Every other
route (managing projects, triggering investigations, connecting a
repository) has no auth at all; anyone who can reach the API can manage
everything. Fine for a local/single-tenant setup, not fine for anything
shared — this is the first thing a real deployment needs to add.

## Monorepo, npm workspaces

`apps/*`, `packages/*`, and `demo-app` are npm workspaces in one repo. The
`packages/*` boundary isn't cosmetic — see
[architecture.md](architecture.md#the-pieces-and-why-theyre-separated-the-way-they-are)
for why each pipeline stage being its own package (rather than a folder
inside `apps/api`) is what makes it independently testable against a real
Docker daemon with a fake LLM, and independently reusable if the pipeline
ever needs to run somewhere other than inside the Express process.

`apps/api` consumes each package's compiled `dist/`, not its source — so
after editing a package, `npm run build:<package>` (see the root README's
Getting Started) has to run before the API picks up the change; the API's
own `tsx watch` doesn't watch `node_modules`.

## Testing strategy

All packages use Node's built-in test runner via `tsx` — no
Jest/Vitest dependency in this codebase's own tooling (Jest is what the
*AI-generated* reproduction/validation tests run under, inside the sandbox
— a different, deliberately isolated thing). `packages/reproduction`,
`packages/fix-engine`, and `apps/api`'s integration tests need a real
Postgres and a real Docker daemon — sandbox behavior is tested by actually
running containers, not by mocking the Docker API. No test needs live
OpenAI or GitHub credentials: LLM calls use a scripted fake implementing the
real client's interface, GitHub REST calls are mocked with `nock`, and
`packages/github`'s tests exercise real `git` against local bare
repositories rather than a live GitHub remote.

That last point directly explains the bug below — the auth path being
tested only against local bare repos meant it was never actually tested
against real GitHub, since a local bare repo doesn't check the
`Authorization` header content at all.

## Express, not NestJS

The API started on NestJS; it was rewritten to plain Express (routers per
resource, Prisma via a driver adapter, no framework layer beyond Express
itself) because the NestJS 12 upgrade needed to clear its remaining `npm
audit` findings was blocked upstream at the time. The Express rewrite
carries the same routes and behavior with 0 known vulnerabilities.

## LLM non-determinism is a retry, not a bug

Worth internalizing before you go debugging a failed pipeline run: an LLM
call that fails a grounding check (see
[pipeline.md](pipeline.md#fix-generation-and-validation)) is *usually* just
that — the model got it wrong this time — and the fix is to retry the stage,
not to assume the code is broken. During this project's own development,
`POST /incidents/:id/fix` failed twice in a row with
`originalCode does not match the source shown for lines 10-13` against a
5-line file. That pattern (consistently wrong, not randomly wrong) was the
signal that this *wasn't* ordinary LLM noise — it turned out
`generate-patch.prompt.ts` never included the numbered source it told the
model to copy from (only the prior stage's prose analysis), so the model had
nothing to ground line numbers on. The fix was adding the missing numbered
source to that prompt (reusing the `renderFile` helper the analysis prompt
already had). The lesson generalizes: one grounding failure, retry it;
the *same class* of failure twice is worth reading the prompt that produced
it.

## A real gotcha: GitHub's git protocol doesn't speak Bearer

`packages/github`'s promotion step authenticates two different ways against
two different GitHub surfaces, and they are not interchangeable:

- The **REST API** (branch creation, PR creation, via Octokit) accepts
  `Authorization: Bearer <token>`.
- The **git-over-HTTPS smart protocol** (`git clone`, `git push`) does not —
  it expects **Basic** auth, with the token as the password
  (`Authorization: Basic base64("x-access-token:<token>")`).

The original code used `Bearer` for both. Branch creation (REST) worked
fine; `git clone` got a 401, and git's response to a 401 with no cached
credential is to fall back to an interactive username/password prompt —
which then fails outright because prompts are disabled in a non-interactive
process. The resulting error (`could not read Username for
'https://github.com': terminal prompts disabled`) doesn't mention
authentication at all, which is what makes this specific failure mode worth
knowing about ahead of time rather than discovering it from the error text.

A second, subtler bug was layered on top of the first: `git clone -c
http.extraHeader=...` — unlike `-c` on most git subcommands — **persists**
that config into the newly cloned repository's local `.git/config`. Once the
Bearer/Basic fix was in, `push` set its *own* fresh `-c
http.extraHeader=...`, which stacked on top of the one clone had already
left behind — so GitHub received two `Authorization` headers on the push
request and rejected it with `remote: Duplicate header: "Authorization"`.
The fix: strip `http.extraHeader` from the clone's local config immediately
after cloning, before it's ever reused.

Both fixes live in
[`packages/github/src/promotion/promotion-checkout.ts`](../packages/github/src/promotion/promotion-checkout.ts).
Neither was caught by `test:github`, for the reason noted in
[Testing strategy](#testing-strategy) above — worth keeping in mind before
assuming a green test suite proves an auth path actually works against real
GitHub.
