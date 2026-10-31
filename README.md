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
3. Apply migrations in timestamp order: `202610310001_initial_schema.sql`, then `202611010001_seed_catalog.sql`. With Supabase GitHub Integration, set working directory to `.` and production branch to `main`; otherwise paste each migration into SQL Editor and run once.
4. Create your email/password user in Supabase Authentication. Add that user's UUID to `public.admin_users` from SQL Editor with `insert into public.admin_users (user_id) values ('USER-UUID-HERE');`. Never expose a secret/service-role key in browser code.

The initial migration creates tables, row-level policies, and a public-read / admin-write `lineup-assets` bucket. The catalog seed migration inserts maps, agents, and abilities. When environment variables are present, the app reads and writes lineups through Supabase, authenticates admins through Supabase Auth, and uploads videos to Storage. Without variables, it stays in local demo mode.

## Publish with GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds the Vite app and publishes it whenever you push to `main`. In the GitHub repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The production URL appears on the Pages settings screen after the workflow succeeds. For a live Supabase build, add repository variables named `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under **Settings → Secrets and variables → Actions → Variables**. These variables configure the client only; the current UI remains in demo data mode until the cloud repository and Auth flows are implemented.

## Current limits

- Demo entries are stored in this browser's local storage. They do not sync across users or devices.
- The map background is an illustrative placeholder. Replace it with accurate map images before using coordinates as gameplay references.
- Uploaded demo videos use a browser object URL and only work for the current session. Production uploads should go to Supabase Storage.
- Supabase project credentials are not included in this repository.
