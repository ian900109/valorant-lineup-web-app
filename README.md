# LINEUP Library

Responsive VALORANT lineup library prototype built with React, TypeScript, and Vite. The current default is a local demo repository so the map, filters, point selection, detail panel, and admin creation flow can be tried before connecting a live Supabase project.

## Run locally

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Run `npm run dev` and open the local URL Vite prints.

Demo admin login: `admin` / `lineup123`. This is intentionally a local-only demo login, not production authentication.

## Supabase setup

1. Copy `.env.example` to `.env.local`.
2. Add the project URL and **publishable** key from the Supabase dashboard.
3. Apply `supabase/migrations/202610310001_initial_schema.sql` in the Supabase SQL editor.
4. Create your user through Supabase Auth, then add that user's UUID to `public.admin_users` from the SQL editor. Do not expose a secret/service-role key in browser code.

The migration creates map, agent, ability, lineup, and admin tables, row-level policies, and a public-read / admin-write `lineup-assets` bucket. The UI currently uses the local demo repository; `src/lib/supabase.ts` is the configured client boundary to use when the cloud repository is implemented.

## Publish with GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds the Vite app and publishes it whenever you push to `main`. In the GitHub repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The production URL appears on the Pages settings screen after the workflow succeeds. For a live Supabase build, add repository variables named `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under **Settings → Secrets and variables → Actions → Variables**. These variables configure the client only; the current UI remains in demo data mode until the cloud repository and Auth flows are implemented.

## Current limits

- Demo entries are stored in this browser's local storage. They do not sync across users or devices.
- The map background is an illustrative placeholder. Replace it with accurate map images before using coordinates as gameplay references.
- Uploaded demo videos use a browser object URL and only work for the current session. Production uploads should go to Supabase Storage.
- Supabase project credentials are not included in this repository.
