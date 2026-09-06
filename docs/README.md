# Developer docs

Start with the root [README](../README.md) if you haven't — it explains what
rootly.ai is and why it exists. These docs are the layer under that: how the
system is actually built, and why it's built that way.

Read in this order:

1. **[architecture.md](architecture.md)** — the system map. What each app and
   package does, how a request moves through them, and the async pattern
   ("create a row, return, do the real work in the background") used
   everywhere a pipeline stage runs.
2. **[data-model.md](data-model.md)** — the Prisma schema, walked through as
   the lifecycle of one incident rather than an alphabetical table list.
3. **[pipeline.md](pipeline.md)** — the four AI/sandbox stages
   (investigate → reproduce → fix → promote) in detail: what each one is
   trying to prove, and why it's built to *prove* it instead of trusting an
   LLM's word.
4. **[decisions.md](decisions.md)** — engineering decisions that cut across
   the whole system (monorepo layout, no queue, Express over NestJS, no auth
   yet) and the reasoning behind each, including a couple of real bugs this
   project shipped and fixed, kept here as worked examples.
5. **[security.md](security.md)** — the threat model: what an AI-generated
   test or patch is allowed to touch, what a sandbox can't do, and how
   secrets are handled.

Package-level implementation detail (exact sandbox flags, validation rules,
the classification logic) lives closer to the code and isn't duplicated
here:

- [`packages/reproduction/README.md`](../packages/reproduction/README.md)
- [`packages/fix-engine/README.md`](../packages/fix-engine/README.md)
- [`packages/github/README.md`](../packages/github/README.md)
- [`packages/sdk-node/README.md`](../packages/sdk-node/README.md)

If you're trying to answer "how do I run this locally" or "what does the
demo flow look like," that's in the root README's Getting Started section,
not here.
