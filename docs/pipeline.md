# The pipeline

Four stages sit between "an error happened" and "a PR is open": Investigate,
Reproduce, Fix, Promote. Each one is an LLM call (or a few) wrapped in code
whose entire job is to **not trust the LLM further than it's earned** — every
stage below is described as "what it does" and, more importantly, "what
keeps it honest." For exact flags, limits, and file-by-file internals, see
each package's own README — this doc is about *why* they're built this way,
and how they hand off to each other.

## Investigation

**Package:** [`packages/agent`](../packages/agent/src) ·
**Wired at:** `apps/api/src/investigations/`

A LangGraph state machine:

```
UNDERSTAND_ERROR → ANALYZE_CODE → ANALYZE_HISTORY → GENERATE_HYPOTHESES → EVALUATE_EVIDENCE → GENERATE_REPORT
```

(`packages/agent/src/graph/investigation.graph.ts`, one node per file under
`graph/nodes/`.) It reads the `IncidentCodeContext` collected earlier
(source windows, related tests, recent commits — see
[data-model.md](data-model.md#code-context-before-any-ai-runs)) and produces
ranked `InvestigationHypothesis` rows, each backed by `InvestigationEvidence`
that names a real `sourceType` and `sourceReference`.

**What keeps it honest:** every LLM call in this graph uses Zod-validated
structured output (one retry on schema failure, then fail the stage) — the
model can't return prose where a typed hypothesis was expected. The evidence
requirement means a hypothesis can't just assert "this is probably it"; it
has to point at a specific file, line range, or commit that was actually
supplied to it. This is advisory output, though — nothing downstream
*depends* on the investigation being correct. Reproduction and fix
generation both re-derive their own understanding from the code context
directly; the investigation's job is to be useful to the human (and to the
fix-generation prompt as a starting hint), not to be a trust boundary.

## Reproduction

**Package:** [`packages/reproduction`](../packages/reproduction/README.md) ·
**Wired at:** `apps/api/src/reproductions/`

An LLM writes a Jest test meant to fail the way production failed. Before
that test ever touches a filesystem or process, it goes through two
independent gates:

1. **Static validation** (`test-validator.ts`) — the file path must live
   under `reproduction-tests/`, and the content is scanned against a
   deny-list: no `child_process`, `eval`, `new Function`, raw network
   modules, `fetch`, `fs`, `process.env`, `process.exit`. This isn't
   sandboxing — it's a cheap first gate that rejects an obviously hostile
   test before spending a container on it.
2. **Real, ephemeral Docker execution** — the validated test runs inside a
   container with no network, no host mounts, resource caps, and a timeout
   (see [security.md](security.md#sandbox-isolation)), against the
   repository checked out at the incident's exact commit.

**What keeps it honest:** the result — `REPRODUCED` / `NOT_REPRODUCED` /
`INCONCLUSIVE` — comes from `reproduction-classifier.ts`, a pure function
over `{ exitCode, stdout, stderr, timedOut }`. No LLM call is in that
decision path. It also distinguishes *the test failed to prove the bug*
(`NOT_REPRODUCED`, exit code nonzero, ran cleanly) from *the test
environment itself was broken* (`INCONCLUSIVE` — missing module, syntax
error, npm failure) — an infra failure is explicitly never treated as
evidence the bug doesn't exist.

## Fix generation and validation

**Package:** [`packages/fix-engine`](../packages/fix-engine/README.md) ·
**Wired at:** `apps/api/src/fix-attempts/`

Given a `REPRODUCED` incident, two LLM calls in sequence:

1. **Analyze** — reads the numbered source and the failing reproduction
   test, and describes (in prose) the root cause and the smallest fix —
   deliberately *not* code yet.
2. **Generate patch** — given that analysis plus the same numbered source,
   produces the actual `originalCode`/`replacementCode` per file, with
   `startLine`/`endLine`.

**What keeps it honest:** `verifyOriginalContent()`
(`packages/fix-engine/src/patch/patch-validator.ts`) re-reads the real file
at the claimed line range and does a byte-for-byte comparison against what
the model said was there. Any mismatch — wrong lines, paraphrased
whitespace, a hallucinated line number — rejects the patch before a single
byte is written anywhere. This is the single most load-bearing check in the
whole pipeline: an AI patch is a set of *claims* about the codebase, and
none of them are trusted until checked against the file itself.

> This exact check is what caught a real bug during this project's own
> development: the patch-generation prompt initially never included the
> numbered source it asked the model to copy from, so every patch
> hallucinated its line numbers and `verifyOriginalContent` correctly
> rejected all of them. See
> [decisions.md](decisions.md#llm-non-determinism-is-a-retry-not-a-bug) for
> the full story — it's a good example of the grounding check doing exactly
> what it's for.

Once a patch passes that check, it's applied in a **fresh** sandbox (not the
one reproduction ran in) and three things all have to hold:

- the *original* reproduction test still fails against the pre-patch code
  (proves the sandbox/checkout itself is sound, not just "some test
  passed")
- the same test passes after the patch is applied
- the project's own regression tests still pass

Only if all three hold does `FixAttempt.result` become `FIX_VERIFIED` — set
by the same kind of deterministic, exit-code-driven classifier as
reproduction, not by the LLM being asked "did that work?"

## Promotion

**Package:** [`packages/github`](../packages/github/README.md) ·
**Wired at:** `apps/api/src/pull-requests/`

Takes a `FIX_VERIFIED` `FixAttempt` and turns it into a real branch, commit,
and PR. Nothing here regenerates the patch — every byte written to disk in
this stage is `FixPatch.patchedContent`, exactly as Phase 7 validated it.

**What keeps it honest:**

- `validatedPatchHash` (a SHA-256 of the verified patch, stored on
  `FixAttempt`) is recomputed and compared before promotion — if the patch
  content on the row doesn't match what was hashed at verification time,
  promotion refuses to run. This is the boundary that makes "the thing we
  push is the thing that was proven to work" an actual guarantee, not just
  a comment.
- The branch name is deterministic
  (`incident/<sequenceNumber>/fix-<slug>`, never AI-chosen) and explicitly
  checked against the repository's default branch — promotion refuses to
  push to it under any circumstance.
- Promotion uses its own fresh, ephemeral checkout (kept alive only long
  enough to commit and push, `.git` included so it *can* push — unlike
  reproduction's checkout, which strips `.git` immediately since it only
  ever needs to be read).
- It stops at opening the PR. Nothing in this codebase calls a merge,
  approve, or deploy API — see
  [security.md](security.md#human-in-the-loop-by-construction).

## What each stage hands the next one

```
IncidentCodeContext ──→ Investigation ──→ ReproductionRun ──→ FixAttempt ──→ PullRequest
      (source)          (hypothesis,        (proof the        (proof a        (the exact
                          used as a           bug is real,      fix works,      verified
                          prompt hint)        pinned to a       pinned to      patch, pushed)
                                              commit sha)        that run)
```

Each arrow is a real foreign key (see [data-model.md](data-model.md)), not
just a conceptual link — a `FixAttempt` references the specific
`ReproductionRun` it was validated against, so there's always a concrete
answer to "what proved this fix works."
