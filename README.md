<p align="center">
  <img src="rootlyai.png" alt="rootly.ai" width="88" />
</p>

# rootly.ai

**rootly.ai turns a production error into a reviewed, ready-to-merge pull
request — automatically, with a human as the only thing that can actually
ship the fix.**

Most "AI incident response" tools stop at a Slack message summarizing what
might be wrong. rootly.ai doesn't stop there: it writes a test that
**actually reproduces the bug inside an isolated Docker sandbox**, writes a
candidate fix, **actually validates that fix** by applying it to a fresh
checkout and re-running the test suite in another sandbox, and — only once a
fix is genuinely proven to work — opens a real GitHub pull request. It never
merges, deploys, or bypasses code review on its own; every claim it makes
about your code is checked against the real file content before it's
trusted, and every "the fix works" is a real exit code, not an LLM's
opinion.

```
Application
  → Node.js SDK
  → Error Event
  → Incident Grouping
  → GitHub Code Context
  → LangGraph Investigation
  → Root Cause Analysis
  → AI Reproduction Test
  → Docker Sandbox
  → REPRODUCED
  → AI Fix Generation
  → Fresh Docker Sandbox
  → Patch Application
  → Post-Fix Validation
  → Regression Tests
  → FIX VERIFIED
  → GitHub Branch
  → Commit
  → Pull Request
  → Human Review
```

## Why

When a production error fires, the expensive part isn't writing the fix —
it's everything before it: finding the incident among the noise, tracing it
to the right line of source, forming a root-cause theory, and proving a fix
actually works before anyone trusts it enough to ship. That work is
repetitive, evidence-based, and mechanically checkable — which makes it a
good fit for automation, as long as the automation is held to the same bar a
careful engineer would be: don't claim something works without running it,
and don't touch production without a human saying yes.

rootly.ai automates that loop end to end and stops exactly at the line where
human judgment is supposed to take over: reviewing and merging a pull
request.

## What it does

- **Captures errors** from your app via a lightweight Node.js SDK — no
  infrastructure to stand up, just `init()` and uncaught
  exceptions/rejections are reported automatically.
- **Groups errors into incidents** using a deterministic fingerprint (error
  name + normalized message + top stack frames), so the same bug doesn't
  spam you as N separate alerts.
- **Pulls in real code context** from your connected GitHub repository —
  matches the stack trace to actual source, related tests, and recent commit
  history.
- **Investigates the root cause** with a LangGraph AI agent that reads that
  real context and produces ranked hypotheses — every claim has to cite
  evidence actually supplied to it, never invented.
- **Proves the bug is real** by having an LLM write a test and then
  *actually executing it* in a network-disabled, no-host-mount, ephemeral
  Docker container against your repository at the incident's exact commit.
  A real exit code — never the LLM — decides REPRODUCED or NOT_REPRODUCED.
- **Proves the fix works** the same way: applies the AI-proposed patch in a
  *fresh* sandbox, confirms the original test still fails before the patch
  and passes after it, and runs your regression suite — before ever trusting
  the word FIX_VERIFIED.
- **Opens a real pull request** for a verified fix — the exact patch a
  sandbox already proved works, byte-for-byte, never regenerated or
  "improved" on the way out. Stops there. No merge, no deploy, ever.

## How it works

```
apps/dashboard   Next.js UI — browse projects and incidents, trigger each
                 pipeline stage, review results

apps/api         Express API — owns the Postgres data model, orchestrates
                 the pipeline, exposes routes per resource

packages/sdk-node    @rootly.ai/node — the SDK an app installs to report
                     errors in
packages/agent       @rootly.ai/agent — the LangGraph investigation agent
packages/reproduction  @rootly.ai/reproduction — sandboxed bug reproduction
packages/fix-engine    @rootly.ai/fix-engine — AI fix generation + sandboxed
                       validation
packages/github        @rootly.ai/github — GitHub repo reads + PR automation
packages/shared        shared TypeScript types used by the dashboard

demo-app         a small Express app pre-wired with a real, reproducible
                 bug, for trying the whole pipeline end to end
```

Each AI/sandbox package has its own README with deeper architecture and
security notes:
[`packages/reproduction`](packages/reproduction/README.md),
[`packages/fix-engine`](packages/fix-engine/README.md),
[`packages/github`](packages/github/README.md).

For the system-wide architecture, data model, pipeline design rationale,
and threat model — the "how and why," for anyone ramping up on this
codebase — see [`docs/`](docs/README.md).

## Stack

- **Dashboard**: Next.js (App Router) + TypeScript + Tailwind
- **API**: Express + TypeScript (routers per resource, Prisma via a driver adapter, no framework layer beyond Express itself)
- **Database**: PostgreSQL + Prisma 7 (`@prisma/adapter-pg`, `prisma.config.ts`)
- **AI**: OpenAI (structured output via Zod schemas) orchestrated with LangGraph (`@langchain/langgraph`) for the multi-stage investigation and fix-generation graphs
- **Sandboxing**: Docker — network-disabled, no host mounts, resource-capped, ephemeral containers for reproducing bugs and validating fixes
- **GitHub**: Octokit (`@octokit/rest`) for repository reads and PR automation; `git` subprocesses (never a shell string) for clone/checkout/commit/push
- **Infra**: Docker Compose (Postgres) + a purpose-built sandbox image (`packages/reproduction/docker/sandbox.Dockerfile`)

## Repository structure

```
rootly.ai/
├── apps/
│   ├── dashboard/        Next.js dashboard
│   │   └── src/app/
│   │       ├── projects/[projectId]/...          Project/env/API key/repository/incidents/events
│   │       ├── incidents/[incidentId]/            Overview+timeline, Events, Code Context,
│   │       │                                      AI Investigation, Reproduction, Fix, Pull Request tabs
│   │       └── events/[eventId]/                  Error event detail
│   └── api/               Express API
│       ├── test/               Integration tests (node:test, real Postgres, real Docker for
│       │                       reproduction/fix/PR-promotion tests, GitHub REST mocked via nock)
│       └── src/
│           ├── routes/                health, projects, environments, api-keys, events,
│           │                          incidents, repository, incident-context, investigations,
│           │                          reproductions, fix-attempts, pull-requests
│           ├── github/                 GitHub read service (repo/tree/content/commits),
│           │                           token encryption, stack-trace parsing, source matching
│           ├── incidents/              fingerprinting, grouping, status lifecycle
│           ├── incident-context/       code context collection orchestration
│           ├── investigations/         wires @rootly.ai/agent to Prisma
│           ├── reproductions/          wires @rootly.ai/reproduction to Prisma
│           ├── fix-attempts/           wires @rootly.ai/fix-engine to Prisma
│           ├── pull-requests/          wires @rootly.ai/github to Prisma
│           ├── middleware/             api-key-auth.ts
│           ├── prisma.ts, errors.ts, validate.ts, app.ts, main.ts
├── packages/
│   ├── shared/            Shared TypeScript types used by the dashboard
│   ├── sdk-node/           @rootly.ai/node — the Node.js error-reporting SDK
│   ├── agent/              @rootly.ai/agent — LangGraph investigation agent
│   │   └── src/
│   │       ├── graph/          UNDERSTAND_ERROR -> ANALYZE_CODE -> ANALYZE_HISTORY ->
│   │       │                   GENERATE_HYPOTHESES -> EVALUATE_EVIDENCE -> GENERATE_REPORT
│   │       ├── llm/            structured-output validation + one-retry-then-fail, OpenAI client
│   │       ├── tools/          read-only context/file/repo-search/git-history tools
│   │       └── schemas/        Zod schemas for every LLM-generated document
│   ├── reproduction/       @rootly.ai/reproduction — sandboxed reproduction (see its README)
│   ├── fix-engine/         @rootly.ai/fix-engine — fix generation + validation (see its README)
│   └── github/             @rootly.ai/github — GitHub PR automation (see its README)
├── demo-app/               Express app wired to the SDK, with a real reproducible bug
│   ├── index.js                 /health, /manual-error, /test-error, /test-dynamic-error, /test-different-error
│   └── src/services/            payment.service.js — the bug the demo flow revolves around
├── docker-compose.yml      Local Postgres
└── .env.example
```

## Getting started

```bash
# 1. Start Postgres
docker compose up -d

# 2. Configure environment variables
cp .env.example .env
cp .env.example apps/api/.env
# fill in GITHUB_TOKEN_ENCRYPTION_KEY (any random secret) and OPENAI_API_KEY
# (Postgres is mapped to host port 5433, not 5432, to avoid clashing with a
# locally installed Postgres — see DATABASE_URL in .env.example.)

# 3. Install dependencies (npm workspaces, from the repo root)
npm install

# 4. Run migrations (first time only)
npm run prisma:migrate --workspace=api

# 5. Build the workspace packages (the API consumes their compiled dist/, not source)
npm run build:sdk
npm run build:agent
npm run build:reproduction
npm run build:fix-engine
npm run build:github

# 6. Build the reproduction/fix sandbox image (needed for reproducing bugs and validating fixes)
docker build -t rootly.ai-reproduction-sandbox \
  -f packages/reproduction/docker/sandbox.Dockerfile \
  packages/reproduction/docker

# 7. Start the API
npm run dev:api        # http://localhost:3001

# 8. Start the dashboard (separate terminal)
npm run dev:dashboard  # http://localhost:3000
```

From the dashboard, create a project, environment, and API key, then connect
a GitHub repository (a PAT with `repo` scope, on a repository you're allowed
to push branches to) — code context, reproduction, fix generation, and PR
creation all depend on this.

### Try the full pipeline with the demo app

```bash
cp demo-app/.env.example demo-app/.env
# set ROOTLY_AI_API_KEY to a raw key generated from the dashboard above

npm run dev:demo       # http://localhost:4000
```

- `GET /test-error` — triggers a real bug in `demo-app/src/services/payment.service.js`
  (`confirmPayment` crashing on a payment with no `customer`) as a genuine
  `unhandledRejection`, captured automatically by the SDK. This is the error
  the walkthrough below investigates, reproduces, fixes, and opens a PR for.
- `GET /manual-error`, `/test-dynamic-error/:userId`, `/test-different-error` —
  additional capture paths that exercise manual capture and incident
  grouping/separation.

**Then, in the dashboard:**

1. `GET /test-error` fires; a new incident appears in the dashboard.
2. Connect the GitHub repository once, then collect code context.
3. Click **Investigate** — the AI identifies that `customer` can be `null`
   before `.id` is accessed.
4. Click **Reproduce Bug** — a generated Jest test actually throws the same
   `TypeError` inside a Docker sandbox: **✓ REPRODUCED**.
5. Click **Generate Fix** — the AI proposes optional-chaining null handling,
   applied and validated in a *fresh* sandbox: before-fix reproduction still
   fails, post-fix validation passes, regression tests pass: **✓ FIX VERIFIED**.
6. Click **Create GitHub PR** — a real branch, commit, and pull request are
   created from the exact verified patch. The dashboard shows the PR number,
   branch, and a link to the real GitHub PR — where a human reviews the
   incident, root cause, reproduction, fix, and diff, and decides whether to
   merge it.

## Database models

- **Project / Environment / ApiKey** — org structure; API keys store only `keyPrefix`+`keyHash`, never the raw key
- **ErrorEvent** — one row per captured error; `eventId` unique for idempotent ingestion
- **Incident** — deduplicated group of ErrorEvents sharing a deterministic fingerprint (error name + normalized message + top stack frames, SHA-256); `status` (`OPEN`/`RESOLVED`/`IGNORED`) with reopen semantics
- **Repository / RepositoryFile** — one connected GitHub repo per project; encrypted PAT; synced file tree
- **IncidentCodeContext / IncidentCodeFile / IncidentCodeCommit** — stack-trace-matched source windows, related tests, recent commit history for an incident
- **Investigation / InvestigationHypothesis / InvestigationEvidence** — the AI investigation's state machine, ranked root-cause hypotheses, and grounded supporting/contradicting evidence
- **ReproductionRun / ReproductionTest** — the AI-generated reproduction test and its real, deterministic classification (`REPRODUCED`/`NOT_REPRODUCED`/`INCONCLUSIVE`)
- **FixAttempt / FixPatch** — the AI-proposed patch, its per-file before/after content and diff, `validatedPatchHash` (the integrity boundary before promotion), and the deterministic classification (`FIX_VERIFIED`/`FIX_REJECTED`/`INCONCLUSIVE`)
- **PullRequest** — the promoted branch/commit/PR for a `FIX_VERIFIED` attempt; `status` (`CREATING`/`OPEN`/`CLOSED`/`MERGED`/`FAILED`) reflects real GitHub state, never a merge this system performed

## API endpoints

```
GET    /health

# Projects, environments, API keys
POST   /projects
GET    /projects
GET    /projects/:projectId
PATCH  /projects/:projectId
DELETE /projects/:projectId
POST   /projects/:projectId/environments
GET    /projects/:projectId/environments
GET    /projects/:projectId/environments/:environmentId
PATCH  /projects/:projectId/environments/:environmentId
DELETE /projects/:projectId/environments/:environmentId
POST   /projects/:projectId/environments/:environmentId/api-keys
GET    /projects/:projectId/environments/:environmentId/api-keys
GET    /api-keys/:apiKeyId
POST   /api-keys/:apiKeyId/revoke
POST   /api-keys/validate

# Event ingestion
POST   /events                                    (Bearer <api-key>; SDK ingestion)
GET    /projects/:projectId/events                 ?environmentId=&limit=&offset=
GET    /events/:eventId

# Incidents
GET    /projects/:projectId/incidents               ?environmentId=&status=&limit=&offset=
GET    /incidents/:incidentId
GET    /incidents/:incidentId/events
PATCH  /incidents/:incidentId/status

# GitHub repository + code context
POST   /projects/:projectId/repository
GET    /projects/:projectId/repository
DELETE /projects/:projectId/repository
POST   /projects/:projectId/repository/sync
POST   /incidents/:incidentId/context/collect
GET    /incidents/:incidentId/context

# AI investigation
POST   /incidents/:incidentId/investigate
GET    /investigations/:investigationId
GET    /incidents/:incidentId/investigations

# Reproduction sandbox
POST   /incidents/:incidentId/reproduce
GET    /reproduction-runs/:id
GET    /incidents/:incidentId/reproduction-runs

# AI fix generation + validation
POST   /incidents/:incidentId/fix
GET    /fix-attempts/:id
GET    /incidents/:incidentId/fix-attempts

# GitHub PR automation
POST   /incidents/:incidentId/create-pr
GET    /pull-requests/:id
GET    /incidents/:incidentId/pull-requests
GET    /pull-requests/:id/refresh                  (queries GitHub, updates local status — never merges)
```

Every long-running `POST` above (`investigate`, `reproduce`, `fix`,
`create-pr`) follows the same pattern: it creates a DB row synchronously and
returns `{id, status}` immediately, then runs the actual pipeline (seconds to
low minutes) in the background, persisting status after every stage — poll
the corresponding `GET` to watch it progress. Each has its own precondition
gate (e.g. `create-pr` requires `FixAttempt.result === 'FIX_VERIFIED'`) that
returns a `400` with a machine-readable `error` code before a doomed run
would ever start.

## SDK (`@rootly.ai/node`)

```ts
import { RootlyAI } from "@rootly.ai/node";

const rootlyAI = new RootlyAI({
  apiKey: process.env.ROOTLY_AI_API_KEY!,
  serverUrl: "http://localhost:3001",  // default
  serviceName: "payment-service",
  environment: "production",
  release: "1.0.0",
  debug: true,
});

rootlyAI.init();                          // wires uncaughtException / unhandledRejection
rootlyAI.captureException(error);          // manual capture
rootlyAI.captureMessage("Something odd");  // manual, non-exception message
```

- Never throws into the host app; a failed send is swallowed (debug-logged only if `debug: true`).
- `enabled: false` makes every capture call a no-op — no event is ever sent.
- Delivery is fire-and-forget over `fetch`, 5s timeout, no queue/retry/batching.
- Debug logs never include the API key or `Authorization` header (verified by a test).
- Not published to npm — consumed via the npm workspace; `npm run build:sdk` before running
  the demo app or anything else that imports it.

## The AI pipeline, briefly

- **Investigation (`@rootly.ai/agent`)** — a LangGraph state machine
  (`UNDERSTAND_ERROR → ANALYZE_CODE → ANALYZE_HISTORY → GENERATE_HYPOTHESES →
  EVALUATE_EVIDENCE → GENERATE_REPORT`) that produces ranked root-cause
  hypotheses. Every LLM call uses Zod-validated structured output with one
  retry on schema failure; every evidence claim must cite context actually
  supplied to the model — grounded, not invented.
- **Reproduction (`@rootly.ai/reproduction`)** — an LLM writes a
  Jest test that should fail the way production did; the test is statically
  validated (no `fs`, `child_process`, `eval`, network APIs), then **actually
  executed** against the real repository, checked out at the incident's exact
  commit, inside a network-disabled, no-host-mount, resource-capped, ephemeral
  Docker container. A deterministic classifier (real exit code + output
  pattern, never the LLM) decides `REPRODUCED` / `NOT_REPRODUCED` /
  `INCONCLUSIVE`.
- **Fix generation + validation (`@rootly.ai/fix-engine`)** — given
  a `REPRODUCED` incident, an LLM proposes a minimal patch; the system
  independently verifies the AI's claimed "original code" against the real
  file (rejecting hallucinations before applying anything), applies the
  patch in a **fresh** sandbox, re-runs the reproduction test (must still
  fail pre-patch), runs a post-fix validation test (must now pass), and runs
  regression tests — all before ever trusting the word `FIX_VERIFIED`.
- **PR automation (`@rootly.ai/github`)** — promotes the *exact*
  already-verified patch (never regenerated) into a real GitHub branch,
  commit, and pull request, with its own integrity check (a hash of the
  patch, recomputed and compared before every promotion) and its own fresh,
  ephemeral checkout. Stops at a real PR — no merge, no deploy, ever.

## Testing

```bash
npm run test:sdk           # packages/sdk-node — node:test, mocked fetch
npm run test:agent         # packages/agent — node:test, scripted/fake LLM
npm run test:reproduction  # packages/reproduction — node:test, real Docker required
npm run test:fix-engine    # packages/fix-engine — node:test, real Docker required
npm run test:github        # packages/github — node:test, real git (local repos, no live GitHub needed)
npm run test:api           # apps/api — node:test, real Postgres + real Docker, GitHub REST mocked via nock
```

All packages use Node's built-in test runner (via `tsx`) — no Jest/Vitest
dependency anywhere in this codebase (Jest is what the AI-generated
reproduction/validation *tests* run under, inside the sandbox — a different
thing). `test:reproduction`, `test:fix-engine`, and `test:api` need Postgres
(`docker compose up -d`) and Docker running locally, plus the sandbox image
built (see Getting Started above). No test in the standard suite requires
live OpenAI or GitHub credentials — LLM calls use a scripted fake
implementing the same interface as the real client, and GitHub REST calls
are mocked with `nock`; where a real `git` push is exercised, it targets a
local bare repository created for that test, never a real GitHub remote.

## Security

- **Sandbox isolation**: every reproduction/validation container runs
  `--network none`, never mounts a host path (code enters only via
  `docker cp`, a one-way copy), never references the Docker socket, has
  explicit memory/CPU/PID caps, is killed on timeout, and is always removed
  in a `finally` block — proven with real containers in
  `docker-sandbox.security.test.ts`.
- **Commands are never assembled from AI output**, anywhere in this
  codebase. Every process this system runs — inside a sandbox or on the
  host, git or Jest — is a fixed argv array this code builds; the model
  only ever produces file *content*.
- **Anti-hallucination grounding**: an AI claim about existing
  code — a file path, line numbers, "the original code says X" — is checked
  against the real, current file content before it's trusted. A mismatch
  rejects the claim; it's never silently applied.
- **Patch integrity**: the patch pushed to GitHub is verified
  byte-for-byte identical (via a stored SHA-256 hash) to the one a sandbox
  already proved works. Promotion never regenerates or "improves" a patch.
- **Human-in-the-loop by construction**: nothing in this codebase calls a
  merge, approval, or deployment API. `FIX_VERIFIED` requires real sandbox
  execution, not AI self-assessment; a GitHub PR is the last automated step.
- **Secrets**: GitHub PATs are AES-256-GCM encrypted at rest, decrypted only
  in-process, used as a one-off git credential override (never written to
  `.git/config`, never a persistent env var, never forwarded into a
  sandbox), and never appear in logs or API responses — verified by tests
  wherever a token is touched.

## Known limitations

- No auth/accounts — anyone with dashboard access can manage all projects.
- One language/framework combo throughout: JavaScript/TypeScript + Jest.
  Extending to another stack means new validators and a new sandbox image,
  not a config flag (a deliberate scoping decision, not an oversight).
- Dependency installation for reproduction/validation only works when the
  sandbox image already has what's needed cached — see
  `packages/reproduction/README.md`'s tradeoff section.
- No "optional final re-test" inside PR promotion — `FIX_VERIFIED` already
  means the reproduction test, post-fix test, and regression tests ran in a
  sandbox moments earlier; see `packages/github/README.md`'s known
  limitations for the reasoning.
- No sophisticated GitHub rate-limit handling — a single classified failure
  and no automatic retry.
- No queue/worker (Redis, BullMQ, etc.) anywhere — every async pipeline runs
  as a fire-and-forget function inside the API process. Fine for this
  project's scope; none of the packages' own APIs assume where they're
  called from, so moving one behind a real queue later doesn't require
  reshaping it.
- SDK delivery is send-immediately with no local queue — an app that
  crashes before the `fetch` resolves can lose that one event.
- The API started on NestJS; it was rewritten to plain Express because the
  NestJS 12 upgrade needed to clear its remaining `npm audit` findings is
  currently blocked upstream. The Express rewrite carries **0 known
  vulnerabilities** and the same routes/behavior.
