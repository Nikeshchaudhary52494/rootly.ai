# Architecture

## The pieces, and why they're separated the way they are

```
apps/dashboard  →  apps/api  →  Postgres
                      │
                      ├─→ packages/agent          (LangGraph investigation)
                      ├─→ packages/reproduction    (Docker sandbox, prove the bug)
                      ├─→ packages/fix-engine      (Docker sandbox, prove the fix)
                      ├─→ packages/github          (Octokit + git, promote to a PR)
                      └─→ Docker daemon, OpenAI API, GitHub API
```

**`apps/api` is the only thing that talks to Postgres, Docker, OpenAI, or
GitHub.** The dashboard never does — it's a thin client of the API. Each
`packages/*` unit is a plain library: it takes typed input, does one job
(investigate, reproduce, fix, promote), and returns a typed result. None of
them know about Prisma, Express, or HTTP. That split exists so each package
can be tested in isolation with a fake LLM and a real Docker daemon (see
[decisions.md](decisions.md#testing-strategy)), and so the pipeline could
move behind a real job queue later without any package needing to change —
only the thin `apps/api/src/*/*.service.ts` wiring layer that calls them
would.

## The wiring layer

Every pipeline stage has the same three-file shape inside `apps/api/src/`:

```
investigations/     wires @rootly.ai/agent to Prisma
reproductions/       wires @rootly.ai/reproduction to Prisma
fix-attempts/         wires @rootly.ai/fix-engine to Prisma
pull-requests/         wires @rootly.ai/github to Prisma
```

Each `*.service.ts` does the same thing: load the incident's current state
from Postgres, shape it into the package's input type, call the package,
and persist whatever comes back. This is deliberately dumb — almost no
logic lives here, because the point is to keep the actual pipeline logic
(what makes a fix "verified," what counts as a valid patch) inside the
package, not smeared across the API layer.

## The async pattern: create a row, return, do the work in the background

Every pipeline stage is triggered by a `POST` that can take anywhere from a
few seconds to a couple of minutes (an LLM call plus a Docker container
run). None of them make the HTTP request wait for that. The pattern, used
identically by `investigate`, `reproduce`, `fix`, and `create-pr`:

```ts
// 1. Create the row synchronously, return {id, status} immediately
const row = await prisma.fixAttempt.create({ data: { status: 'PENDING', ... } });
res.status(201).json({ id: row.id, status: row.status });

// 2. Kick off the real work — fire-and-forget, not awaited
void executeFixGeneration(row.id, ...).catch((err) => {
  // persist FAILED + errorMessage so polling GET reflects it
});
```

The client polls `GET /fix-attempts/:id` (or the dashboard does, on a
timer) and watches `status` move through the stage's state machine
(`GENERATING_FIX → VALIDATING_PATCH → CHECKING_OUT → ... → COMPLETED`),
persisted to the DB after every step — so if the API process restarted
mid-run, the row would just look stuck rather than lying about its state.

This is not a job queue. There's no retry, no persistence of in-flight work
across a process restart, no worker pool. See
[decisions.md](decisions.md#no-queueworker) for why that's a deliberate
scope decision and what it would take to change.

## Precondition gates

Each long-running `POST` checks that the previous stage actually succeeded
before starting the next one — e.g. `create-pr` requires
`FixAttempt.result === 'FIX_VERIFIED'`, `fix` requires a `ReproductionRun`
with `result === 'REPRODUCED'`. These return a `400` with a machine-readable
`error` code synchronously, before any row is created — so a doomed request
fails fast instead of spinning up a sandbox for nothing.

## Auth

Two separate auth mechanisms, for two separate audiences:

- **API keys** (`Authorization: Bearer <key>`) — for the SDK, hitting
  `POST /events`. Stored as `keyPrefix` + `keyHash` only; the raw key is
  shown once at creation and never persisted.
- **Nothing** — the dashboard-facing management routes (projects,
  incidents, investigations, etc.) have no auth at all. See
  [decisions.md](decisions.md#no-auth-yet).

## Request flow for a single incident, end to end

```
demo-app crashes
  → SDK POSTs to /events (Bearer api-key)
  → incidents.service groups it into an Incident by deterministic fingerprint
  → dashboard shows the incident
  → POST /projects/:id/repository/sync           pulls the repo's file tree
  → POST /incidents/:id/context/collect            matches stack trace → source
  → POST /incidents/:id/investigate                 packages/agent, LangGraph
  → POST /incidents/:id/reproduce                    packages/reproduction, Docker
  → POST /incidents/:id/fix                            packages/fix-engine, Docker
  → POST /incidents/:id/create-pr                       packages/github, real PR
  → human reviews and merges on GitHub
```

Every arrow after the first is a stage described in more detail in
[pipeline.md](pipeline.md), backed by the tables walked through in
[data-model.md](data-model.md).
