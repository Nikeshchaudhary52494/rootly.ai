# rootly.ai showcase

A standalone project page for sharing rootly.ai (e.g. with an interviewer) —
not part of the main app, not an npm workspace member, deploys on its own.

Next.js (App Router) + Tailwind CSS v4, matching `apps/dashboard`'s setup.
White + orange theme sourced from `rootlyai.png`, zero border-radius
throughout.

## Run locally

```bash
cd showcase
npm install
npm run dev
# http://localhost:3000
```

## Add the demo video

Open `src/app/page.tsx` and find the `<section id="demo">` block — it has a
placeholder frame with the exact markup to swap in either:

- a YouTube/Loom embed (`<iframe src="..." />`), or
- a hosted file — drop the `.mp4` in `public/` and reference it with
  `<video controls><source src="/your-file.mp4" ... /></video>`

## Deploy to Vercel

**Option A — git-connected (recommended):** push this repo to GitHub, import
it in the Vercel dashboard, and set **Root Directory** to `showcase`. Vercel
auto-detects Next.js — no other config needed. Every push redeploys it.

**Option B — CLI, right now:**

```bash
cd showcase
npx vercel        # first run: link/create the project, deploys a preview
npx vercel --prod # promote to production
```

Either way, this folder is fully self-contained (its own `package.json`,
own `node_modules` once installed) — it doesn't need anything else in the
monorepo to build or deploy.
