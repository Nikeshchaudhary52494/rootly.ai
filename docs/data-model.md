# Data model

The schema lives at
[`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma). Rather
than list every model alphabetically, this walks through what gets written
to which table as one incident moves through the whole pipeline — that's the
order that actually makes the relationships make sense.

## Org structure (exists before any error happens)

```
Project ──< Environment ──< ApiKey
```

A `Project` is the top-level container (think: one app or service). Each
`Project` has one or more `Environment`s (`DEVELOPMENT` / `STAGING` /
`PRODUCTION`), and each `Environment` has its own `ApiKey`s — a key is
scoped to exactly one environment, so a dev key can't post events as
production. `ApiKey` stores `keyPrefix` + `keyHash` only; the raw key exists
only once, in the creation response.

A `Project` also has at most one `Repository` (`@unique` on `projectId`) —
the codebase this project's incidents get diagnosed and fixed against.

## An error arrives

```
ErrorEvent  (one row per captured error, eventId unique — idempotent ingestion)
   │
   ▼ grouped by fingerprint
Incident  (one row per distinct bug)
```

`ErrorEvent.fingerprint` is a SHA-256 of `errorName + normalizedMessage +
topStackFrames` (see `apps/api/src/incidents/utils/fingerprint.ts`) —
deterministic, not AI-generated, specifically so the same bug always lands
in the same `Incident` regardless of which request triggered it or what
dynamic values (a user ID, a timestamp) happened to be in the message.
`Incident` has a `@@unique([projectId, environmentId, fingerprint])`
constraint — that uniqueness *is* the deduplication logic; there's no
separate matching step, just an upsert against that key.

`Incident.status` (`OPEN` / `RESOLVED` / `IGNORED`) has reopen semantics: a
new `ErrorEvent` matching a `RESOLVED` incident's fingerprint reopens it.

## Code context (before any AI runs)

```
Incident ──1:1── IncidentCodeContext ──< IncidentCodeFile
                                    └──< IncidentCodeCommit
```

`IncidentCodeContext` is collected once per incident by matching the error's
stack trace against the connected `Repository`'s synced file tree
(`RepositoryFile`). `IncidentCodeFile` rows hold the actual numbered source
windows the AI will read — `contentStartLine`/`contentEndLine` matter a lot
here, since every downstream line-number claim (in the investigation, and
later the patch) is checked against exactly this content. `isPrimary` marks
the file the stack trace's top frame points at.

## Investigation

```
Incident ──< Investigation ──< InvestigationHypothesis ──< InvestigationEvidence
```

One `Investigation` per run (an incident can be re-investigated).
`InvestigationHypothesis` rows are the ranked root-cause candidates
(`rank`, `confidence`, `status`: `LIKELY`/`POSSIBLE`/`REJECTED`).
`InvestigationEvidence` is the grounding: every hypothesis's evidence rows
cite a `sourceType` (`SOURCE_CODE`, `STACK_TRACE`, `GIT_COMMIT`, ...) and a
`sourceReference` — a claim with nowhere to point never gets written. See
[pipeline.md](pipeline.md#investigation) for how the LangGraph state
machine produces these.

## Reproduction

```
Investigation ──< ReproductionRun ──< ReproductionTest
```

`ReproductionRun.result` is `REPRODUCED` / `NOT_REPRODUCED` / `INCONCLUSIVE`
— set by a deterministic classifier reading `exitCode` and `stdout`/`stderr`
from a real Docker run, never by the LLM. `ReproductionTest` holds the
actual generated Jest test content. `targetCommitSha` pins exactly which
commit was checked out, so the fix stage later can verify it's still
patching the same code.

## Fix generation + validation

```
ReproductionRun ──< FixAttempt ──< FixPatch
                                 └──< PullRequest
```

`FixAttempt.result` is `FIX_VERIFIED` / `FIX_REJECTED` / `INCONCLUSIVE` —
again, a real sandbox run's outcome, not an LLM self-report.
`validatedPatchHash` is a SHA-256 of the exact patch content that passed
validation; it exists specifically so the promotion step
(`packages/github`) can refuse to push anything that doesn't hash to the
same value — see [pipeline.md](pipeline.md#promotion) and
[security.md](security.md#patch-integrity). `FixPatch` rows carry
`originalContent`/`patchedContent`/`diff` per file — the *exact* bytes, not
a description of them.

## Promotion

```
FixAttempt ──< PullRequest ──> Repository
```

One `PullRequest` row per promotion attempt. `status`
(`CREATING`/`OPEN`/`CLOSED`/`MERGED`/`FAILED`) is refreshed by querying the
real GitHub PR (`GET /pull-requests/:id/refresh`) — this table is a mirror
of GitHub's state, never the other way around. Nothing in this codebase
writes `MERGED`; that only happens when a `refresh` observes GitHub already
reports it merged, because a human merged it there.

## Everything an incident touches, at a glance

```
Project
 ├─ Environment ─ ApiKey
 ├─ Repository ─ RepositoryFile
 └─ Incident
     ├─ ErrorEvent (N)
     ├─ IncidentCodeContext ─ IncidentCodeFile / IncidentCodeCommit
     ├─ Investigation (N) ─ InvestigationHypothesis ─ InvestigationEvidence
     ├─ ReproductionRun (N) ─ ReproductionTest
     ├─ FixAttempt (N) ─ FixPatch
     └─ PullRequest (N)
```

`(N)` marks tables where an incident can have more than one row over time —
investigations, reproductions, and fix attempts are all safe to re-run
(e.g. after a rejected fix, or flaky LLM output — see
[decisions.md](decisions.md#llm-non-determinism-is-a-retry-not-a-bug) for a
real example of this happening), and each run is its own immutable row
rather than something that gets overwritten in place.
