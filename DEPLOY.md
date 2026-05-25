# Deploying to Railway

This project is preconfigured for **Railway** with [Nixpacks](https://nixpacks.com).
The first deploy takes ~3 minutes. Subsequent deploys ~1 minute.

## What gets deployed

- The Next.js app (`next start`) on the port Railway assigns (`$PORT`)
- Drizzle migrations run automatically before each boot (`scripts/migrate.mjs`)
- A `/api/health` endpoint Railway pings to verify the deploy is up

---

## 1. Prerequisites

```bash
# install the CLI (once)
npm i -g @railway/cli

# log in (opens a browser)
railway login
```

You'll also need to push this repo somewhere Railway can reach — either:

- **GitHub** (recommended; gives you auto-deploys on `git push`), or
- **CLI-only** (uses `railway up` to upload the working tree each deploy).

---

## 2. Create the project

From the repo root:

```bash
# Create a new empty Railway project and link this directory to it.
railway init
# → pick a project name (e.g. "darts-tournament")
```

If you already have a project in the dashboard, link to it instead:

```bash
railway link
```

---

## 3. Add Postgres

```bash
railway add --database postgres
```

Railway provisions a Postgres 16 instance and exposes `DATABASE_URL` as a
shared variable. **Do not copy the URL manually** — reference it in the app
service instead (next step).

---

## 4. Configure environment variables

Set the required vars on the **app service**:

```bash
# Generate a session secret
railway variables --set "AUTH_SECRET=$(openssl rand -base64 32)"

# Reference the Postgres URL (uses Railway's variable templating).
# Replace `Postgres` with the actual name of your DB service if you renamed it.
railway variables --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'

# Optional: UploadThing for avatar / logo uploads
railway variables --set "UPLOADTHING_TOKEN=<token-from-uploadthing.com>"

# Optional but recommended once you know your public URL (see step 6)
# railway variables --set "AUTH_URL=https://your-app.up.railway.app"
```

> `NODE_ENV=production` is set automatically by Railway.
> SSL on Postgres is auto-handled by `src/db/client.ts`:
> - Internal `*.railway.internal` host → SSL off (faster, no need)
> - Anything else in production → SSL required
> Override with `PGSSLMODE=disable` if needed.

---

## 5. First deploy

If you linked via GitHub, just push to your default branch. Otherwise:

```bash
railway up
```

Watch the logs:

```bash
railway logs
```

You should see:

```
✓ Migrations applied
▲ Next.js 16.x.x
- Local:        http://0.0.0.0:8080
```

---

## 6. Generate a public domain

```bash
railway domain
# → prints something like darts-tournament-production.up.railway.app
```

Then set `AUTH_URL` to that domain (recommended for NextAuth redirects):

```bash
railway variables --set "AUTH_URL=https://darts-tournament-production.up.railway.app"
```

Re-deploy so the change picks up:

```bash
railway up
# or `railway redeploy` if you're on GitHub auto-deploy
```

---

## 7. Bootstrap your first admin

The first user to register automatically becomes the admin (see
`src/app/register/actions.ts`). After deploy:

1. Open the public URL
2. Enter the invite code `darts` (default — change it under `/admin/settings`)
3. Register your account — it gets the `admin` role
4. Set a new invite code, upload a logo, configure the tournament name

---

## 8. Day-to-day operations

```bash
# tail prod logs
railway logs --follow

# open a psql shell against the prod DB
railway connect postgres

# run a one-off command against prod env (e.g. inspect schema)
railway run npm run db:studio

# redeploy without code changes
railway redeploy

# rollback
railway rollback
```

---

## Troubleshooting

**"DATABASE_URL must be set" on boot**
The variable reference `${{Postgres.DATABASE_URL}}` only works if the DB
service is named exactly `Postgres`. Check `railway variables` and adjust.

**Migrations hang or fail with SSL error**
Force SSL off only for internal hosts: confirm `DATABASE_URL` ends in
`.railway.internal`. If you're using the external host, leave SSL on (the
client enables it automatically in production).

**NextAuth redirects to localhost after login**
Set `AUTH_URL` to your Railway domain (step 6).

**Build fails with "module not found"**
Make sure `nixpacks.toml` runs `npm ci --include=dev` — Nixpacks otherwise
prunes devDependencies before build (e.g. `tailwindcss`, `typescript`).

**Argon2 native binding error**
`@node-rs/argon2` ships prebuilt binaries for Linux x64. If you ever switch
Railway region/arch, just re-deploy — the install step grabs the right
binary. No config change needed.

---

## File reference

| File | Purpose |
|---|---|
| `railway.json` | Build/deploy settings, health check |
| `nixpacks.toml` | Pins Node 20, install/build phases |
| `scripts/migrate.mjs` | Runs Drizzle migrations before `next start` |
| `src/app/api/health/route.ts` | Health-check endpoint (`/api/health`) |
| `src/db/client.ts` | Auto-detects SSL based on hostname / env |
| `src/lib/auth.ts` | `trustHost: true` for proxy-aware redirects |
