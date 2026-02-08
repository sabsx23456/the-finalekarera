# Deploying To Vercel (From GitHub)

This repo is a Vite + React SPA with Vercel Serverless Functions under `api/`.

## 1) Push To GitHub

- Do not commit `.env` (it is ignored by `.gitignore`).
- Use `.env.example` as a template for local/dev values.

## 2) Connect GitHub To Vercel

1. In Vercel: `Add New...` -> `Project` -> import your GitHub repository.
2. Framework preset: `Vite` (or keep default if Vercel detects it).
3. Build settings:
   - Install Command: `npm ci` (or `npm install`)
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Deploy.

Notes:
- `vercel.json` contains SPA rewrites and excludes `/api/*` so functions keep working.

## 3) Environment Variables

Client-side (public, `VITE_*`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Optional: `VITE_OPENROUTER_MODEL`
- Optional: `VITE_OPENROUTER_VISION_MODEL`

Server-only (secret, no `VITE_*` prefix preferred):
- `OPENROUTER_API_KEY` (used by `/api/openrouter/*`)
- `SUPABASE_SERVICE_ROLE_KEY` (used by `/api/admin/*`)

Backward-compatible (works, but rename to the preferred vars when possible):
- `/api/openrouter/*` will also accept `VITE_OPENROUTER_API_KEY`
- `/api/admin/*` will also accept `VITE_SUPABASE_SERVICE_ROLE_KEY`

After changing env vars in Vercel, trigger a redeploy.

## 4) Local Development Notes

This repo includes a Vite dev middleware that mounts Vercel-style handlers under `/api/*`
when running `npm run dev` (see `vite.config.ts`).

Notes:
- Ensure your `.env` contains any server-only secrets needed by `/api/*` handlers (like `OPENROUTER_API_KEY`).
- You can still use `vercel dev` if you want to replicate Vercel's runtime more closely.
