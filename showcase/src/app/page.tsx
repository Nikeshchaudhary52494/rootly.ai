import Image from "next/image";
import logo from "../../public/rootlyai.png";

const REPO_URL = "https://github.com/Nikeshchaudhary52494/rootly_ai";

const PIPELINE = ["Error", "Incident", "Investigate", "Reproduce", "Fix", "Pull Request"];

const CAPABILITIES = [
  {
    n: "01",
    title: "Capture",
    body: "A lightweight Node.js SDK — one init() call reports uncaught exceptions automatically, no infra to stand up.",
  },
  {
    n: "02",
    title: "Group",
    body: "Deterministic fingerprinting (error name + normalized message + stack frames) so one bug is one incident, not a flood of alerts.",
  },
  {
    n: "03",
    title: "Contextualize",
    body: "Matches the stack trace to real source, related tests, and recent commit history in the connected GitHub repo.",
  },
  {
    n: "04",
    title: "Investigate",
    body: "A LangGraph agent reads that real context and produces ranked root-cause hypotheses, every claim tied to real evidence.",
  },
  {
    n: "05",
    title: "Reproduce & fix",
    body: "Both proven, not asserted — a generated test and a generated patch, each actually executed in an isolated Docker sandbox.",
  },
  {
    n: "06",
    title: "Promote",
    body: "The exact verified patch — byte for byte — pushed as a real branch, commit, and pull request. Never regenerated.",
  },
] as const;

const STAGES = [
  {
    idx: "01",
    title: "Investigate",
    desc: "A LangGraph state machine — Understand Error → Analyze Code → Analyze History → Generate Hypotheses → Evaluate Evidence → Generate Report — produces ranked root-cause hypotheses from the real code context.",
    honest: "Structured, Zod-validated output, and a hard rule that every piece of evidence must cite context actually supplied to the model — never invented.",
  },
  {
    idx: "02",
    title: "Reproduce",
    desc: "An LLM writes a Jest test meant to fail the way production did. It's statically screened, then actually executed — network-disabled, no host mounts, resource-capped — against the repo checked out at the incident's exact commit.",
    honest: "A deterministic classifier reading a real exit code and output, never the model's opinion, decides REPRODUCED.",
  },
  {
    idx: "03",
    title: "Fix",
    desc: "Given a reproduced bug, an LLM proposes a minimal patch. Applied in a fresh sandbox: the original test must still fail before the patch, pass after it, and the regression suite must hold.",
    honest: "Byte-for-byte verification of the model's claimed “original code” against the real file — a mismatch rejects the patch before anything is written.",
  },
  {
    idx: "04",
    title: "Promote",
    desc: "The exact verified patch is pushed as a real branch, commit, and GitHub pull request — never regenerated, never “improved” on the way out.",
    honest: "A recomputed integrity hash checked against the verified patch before every push, and a hard refusal to ever target the default branch.",
  },
] as const;

const BUGS = [
  {
    title: "Ungrounded patch generation.",
    body: "The fix prompt never showed the model its own numbered source, so it hallucinated line numbers — caught by the grounding check, fixed by passing the source through.",
  },
  {
    title: "Wrong git auth scheme.",
    body: "GitHub’s REST API takes a Bearer token; its git-over-HTTPS protocol wants Basic auth. The mismatch produced a dead interactive credential prompt instead of a clean 401.",
  },
  {
    title: "A persisted git config.",
    body: "clone -c quietly writes its auth header into the new repo’s config; push added its own on top, and GitHub rejected the duplicate header.",
  },
] as const;

const STACK = [
  "Next.js",
  "Express",
  "PostgreSQL + Prisma",
  "LangGraph",
  "OpenAI",
  "Docker",
  "Octokit",
  "TypeScript",
];

const SECURITY = [
  {
    title: "Sandbox isolation",
    body: "No network, no host mounts, no Docker socket, hard resource caps, always destroyed.",
  },
  {
    title: "No AI-assembled commands",
    body: "Every process runs as a fixed argv array; the model only ever produces file content.",
  },
  {
    title: "Anti-hallucination grounding",
    body: "A code claim is checked against the real file before it’s ever trusted.",
  },
  {
    title: "Human-in-the-loop by construction",
    body: "No merge, approve, or deploy call exists anywhere in the codebase.",
  },
] as const;

function Mark({ tone = "signal" }: { tone?: "signal" | "ink" | "paper" }) {
  const outer = tone === "signal" ? "bg-signal" : tone === "ink" ? "bg-ink" : "bg-paper border border-ink";
  const inner = tone === "signal" ? "bg-ink" : tone === "ink" ? "bg-signal" : "bg-ink";
  return (
    <span className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center ${outer}`}>
      <span className={`h-1.5 w-1.5 ${inner}`} />
    </span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-signal">
      <span className="h-px w-6 bg-signal" />
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* NAV */}
      <nav className="sticky top-0 z-20 border-b-2 border-ink bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <a href="#top" className="flex items-center gap-3">
            <Image src={logo} alt="rootly.ai" className="h-8 w-auto" priority />
            <span className="font-mono text-sm font-semibold tracking-tight">rootly.ai</span>
          </a>
          <div className="flex items-center gap-7">
            <a href="#pipeline" className="hidden font-mono text-[13px] text-ink/70 hover:text-ink sm:inline">
              Pipeline
            </a>
            <a href="#run" className="hidden font-mono text-[13px] text-ink/70 hover:text-ink sm:inline">
              Real run
            </a>
            <a href="#demo" className="hidden font-mono text-[13px] text-ink/70 hover:text-ink sm:inline">
              Demo
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="border-2 border-ink bg-ink px-4 py-2 font-mono text-[13px] font-semibold text-paper transition-colors hover:bg-signal hover:border-signal"
            >
              View code &#8599;
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header id="top" className="border-b-2 border-ink">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Eyebrow>Solo-built &middot; AI incident response</Eyebrow>
          <h1 className="mt-6 max-w-3xl text-[clamp(2.2rem,5.4vw,3.6rem)] font-semibold leading-[1.08] tracking-tight text-balance">
            A production bug walks in.
            <br />A <span className="text-signal">reviewed pull request</span> walks out.
          </h1>
          <p className="mt-7 max-w-2xl text-[17px] leading-relaxed text-ink/70">
            rootly.ai is an agent that takes a real error all the way to a verified fix. It{" "}
            <b className="font-semibold text-ink">writes a test that actually reproduces the bug</b> inside an
            isolated Docker sandbox,{" "}
            <b className="font-semibold text-ink">writes a patch and actually validates it</b> in a fresh one, and
            only then opens a real GitHub pull request. It never merges, deploys, or skips review &mdash; a human is
            still the only thing that can ship it.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <a
              href="#demo"
              className="border-2 border-signal bg-signal px-6 py-3 font-mono text-[13px] font-semibold text-paper transition-colors hover:bg-signal-dim hover:border-signal-dim"
            >
              &#9654; Watch the demo
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="border-2 border-ink px-6 py-3 font-mono text-[13px] font-semibold text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              View the code &#8599;
            </a>
          </div>

          {/* pipeline strip */}
          <div className="mt-16 flex items-stretch overflow-x-auto">
            {PIPELINE.map((step, i) => (
              <div key={step} className="flex items-stretch">
                <div
                  className="flex w-[118px] shrink-0 animate-[rise_0.5s_ease_forwards] flex-col items-center gap-3 opacity-0 motion-reduce:opacity-100 motion-reduce:animate-none"
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <span className={`flex h-4 w-4 items-center justify-center ${i === 0 ? "bg-signal" : "border-2 border-ink/25"}`}>
                    {i === 0 && <span className="h-1.5 w-1.5 bg-ink" />}
                  </span>
                  <span className="text-center font-mono text-[11px] tracking-wide text-ink/60">{step}</span>
                </div>
                {i < PIPELINE.length - 1 && <div className="mt-[7px] h-px w-8 bg-ink/20" />}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* WHY */}
      <section className="border-b-2 border-ink">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>Why it exists</Eyebrow>
            <p className="mt-6 max-w-md font-mono text-[22px] font-medium leading-snug text-balance">
              The expensive part of fixing a bug isn&rsquo;t writing the patch &mdash; it&rsquo;s{" "}
              <span className="text-signal">everything before it</span>: finding the incident, tracing it to the
              right line, proving a fix actually works.
            </p>
          </div>
          <p className="max-w-xl self-center text-[15px] leading-relaxed text-ink/70">
            That work is repetitive and mechanically checkable, which makes it a good fit for automation &mdash; as
            long as the automation is held to the standard a careful engineer would be held to: don&rsquo;t claim
            something works without running it, and don&rsquo;t touch production without a human saying yes. rootly.ai
            automates the loop end to end and stops exactly at the line where human judgment takes over: reviewing
            and merging a pull request.
          </p>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="border-b-2 border-ink">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <Eyebrow>What it does</Eyebrow>
          <h2 className="mt-5 max-w-xl text-[28px] font-semibold tracking-tight text-balance">
            Six capabilities, one continuous loop.
          </h2>
          <div className="mt-10 grid grid-cols-1 border-t-2 border-l-2 border-ink sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div key={c.n} className="border-b-2 border-r-2 border-ink p-6">
                <div className="flex items-center gap-3">
                  <Mark />
                  <span className="font-mono text-[11px] tracking-widest text-ink/40">{c.n}</span>
                </div>
                <h3 className="mt-4 text-[15.5px] font-semibold">{c.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink/65">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PIPELINE */}
      <section id="pipeline" className="border-b-2 border-ink">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <Eyebrow>The pipeline</Eyebrow>
          <h2 className="mt-5 max-w-xl text-[28px] font-semibold tracking-tight text-balance">
            What each stage is trying to prove.
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] text-ink/65">
            Four AI-driven stages sit between &ldquo;an error happened&rdquo; and &ldquo;a PR is open.&rdquo; Each one
            is an LLM call wrapped in code whose entire job is to not trust the LLM further than it&rsquo;s earned.
          </p>

          <div className="mt-10">
            {STAGES.map((s) => (
              <div key={s.idx} className="grid grid-cols-[3rem_1fr] gap-6 border-t-2 border-ink py-8 first:border-t-0 sm:grid-cols-[4rem_1fr]">
                <div className="font-mono text-sm font-semibold text-signal">{s.idx}</div>
                <div>
                  <h3 className="text-[17px] font-semibold">{s.title}</h3>
                  <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink/65">{s.desc}</p>
                  <p className="mt-3 max-w-2xl border-l-2 border-signal pl-4 text-[13px] leading-relaxed text-ink/55">
                    Kept honest by: <b className="font-semibold text-ink">{s.honest}</b>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REAL RUN */}
      <section id="run" className="border-b-2 border-ink">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <Eyebrow>A real run</Eyebrow>
          <h2 className="mt-5 max-w-xl text-[28px] font-semibold tracking-tight text-balance">
            Not a mockup &mdash; this is an actual pipeline execution.
          </h2>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="border-2 border-ink bg-ink">
                <div className="flex items-center gap-2 border-b border-paper/15 px-4 py-3">
                  <span className="h-2.5 w-2.5 bg-paper/25" />
                  <span className="h-2.5 w-2.5 bg-paper/25" />
                  <span className="h-2.5 w-2.5 bg-paper/25" />
                  <span className="ml-2 font-mono text-[11px] text-paper/50">demo-app &mdash; GET /test-error</span>
                </div>
                <pre className="overflow-x-auto px-5 py-5 font-mono text-[12.5px] leading-[1.8] text-paper/85">
{`$ curl localhost:4000/test-error

`}<span className="text-signal">{`TypeError: Cannot read properties of undefined (reading 'id')`}</span>{`
    at confirmPayment (payment.service.js:2)

// captured by the SDK, grouped into Incident #1

`}<span className="text-[#ff9b8a]">{`- return payment.customer.id;`}</span>{`
`}<span className="text-[#7fe0af]">{`+ return payment && payment.customer ? payment.customer.id : undefined;`}</span>
                </pre>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="border-2 border-ink/20 px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wide text-ink/55">
                  OPEN
                </span>
                <span className="font-mono text-ink/30">&rarr;</span>
                <span className="border-2 border-signal bg-signal px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wide text-paper">
                  REPRODUCED
                </span>
                <span className="font-mono text-ink/30">&rarr;</span>
                <span className="border-2 border-signal bg-signal px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wide text-paper">
                  FIX_VERIFIED
                </span>
                <span className="font-mono text-ink/30">&rarr;</span>
                <span className="border-2 border-ink bg-ink px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wide text-paper">
                  PR #1 OPEN
                </span>
              </div>
            </div>

            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink/45">
                Found &amp; fixed while wiring this up
              </p>
              <ul className="mt-5 flex flex-col gap-5">
                {BUGS.map((b) => (
                  <li key={b.title} className="flex gap-3">
                    <Mark tone="ink" />
                    <p className="text-[13.5px] leading-relaxed text-ink/70">
                      <b className="font-semibold text-ink">{b.title}</b> {b.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* DEMO VIDEO */}
      <section id="demo" className="border-b-2 border-ink">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <Eyebrow>See it run</Eyebrow>
          <h2 className="mt-5 max-w-xl text-[28px] font-semibold tracking-tight text-balance">
            Full pipeline, start to finish.
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] text-ink/65">
            Error capture &rarr; investigation &rarr; sandboxed reproduction &rarr; sandboxed fix validation &rarr; a
            real GitHub pull request, walked through end to end.
          </p>

          <div className="relative mt-10 aspect-video border-2 border-ink bg-ink">
            {/*
              Drop the demo video in here. Easiest options:
              1) YouTube/Loom embed:
                 <iframe src="https://www.youtube.com/embed/VIDEO_ID" className="h-full w-full" allowFullScreen />
              2) A hosted file in /public:
                 <video controls className="h-full w-full"><source src="/demo.mp4" type="video/mp4" /></video>
            */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center bg-signal text-paper">
                <span className="ml-0.5 text-lg">&#9654;</span>
              </div>
              <p className="max-w-xs text-center font-mono text-[12px] text-paper/50">
                Demo video goes here &mdash; swap in a YouTube / Loom embed or an .mp4 source
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* STACK + SECURITY */}
      <section className="border-b-2 border-ink">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-2">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink/45">Stack</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {STACK.map((s) => (
                <span key={s} className="border-2 border-ink/20 px-3 py-1.5 font-mono text-[12.5px] text-ink/70">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink/45">
              Security posture
            </p>
            <ul className="mt-6 flex flex-col gap-4">
              {SECURITY.map((s) => (
                <li key={s.title} className="flex gap-3">
                  <Mark />
                  <p className="text-[13.5px] leading-relaxed text-ink/70">
                    <b className="font-semibold text-ink">{s.title}</b> &mdash; {s.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <p className="max-w-md text-[14px] text-ink/60">
            Built solo &mdash; API, dashboard, SDK, the sandboxed AI pipeline, and the GitHub automation, end to end.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-ink px-5 py-2.5 font-mono text-[13px] font-semibold text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            View the code &#8599;
          </a>
        </div>
        <div className="mt-10 flex items-center gap-3 border-t-2 border-ink pt-6">
          <Image src={logo} alt="" className="h-5 w-auto opacity-70" />
          <span className="font-mono text-[11px] text-ink/40">rootly.ai</span>
        </div>
      </footer>
    </div>
  );
}
