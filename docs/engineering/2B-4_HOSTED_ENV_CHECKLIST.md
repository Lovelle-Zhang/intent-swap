# 2B-4 — Hosted Sandbox Deployment Checklist

**Goal:** make the hosted `/zenfix/*` surfaces work on a deployment. The hosted
code path is complete on `main` (2B-1 write → 2B-2 read → 2B-3 surfaces); this
is the operations step that provisions its dependencies. Without them, every
`/zenfix/*` route returns **503 by design**.

This step requires your Supabase and Vercel accounts and is performed by a
human — no secrets belong in the repo.

## 1. Vercel environment variables

Exactly four, as read by the code:

| Variable | Value / source | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (`https://xxxx.supabase.co`) | public (client + server) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase **publishable / anon** key | public |
| `SUPABASE_DATABASE_URL` | Postgres connection string for the dedicated `zenfix_login` role (see §3), via the transaction pooler, ending in `?sslmode=no-verify` | **server-only secret — never prefix with `NEXT_PUBLIC`** |
| `ZENFIX_APP_ORIGIN` | The deployment's **bare origin**, e.g. `https://intent-swap.app` — no path, query, or credentials (validated in code) | server |

Sources in code: `readSupabasePublicConfig` / `readZenFixAppOrigin`
(`src/features/payrun/hosted/config.ts`) and `getHostedSqlPool`
(`src/features/payrun/hosted/runtime.ts`).

No `service_role` key is needed — per-user isolation is enforced by Postgres RLS
keyed on the request's JWT `sub` claim (`public.zenfix_current_uid()`; see §3),
not on the `auth` schema.

## 2. Supabase dashboard configuration

- **Auth → URL Configuration**
  - **Site URL** = `${ZENFIX_APP_ORIGIN}`.
  - **Redirect URLs** allowlist must include **`${ZENFIX_APP_ORIGIN}/auth/callback`**.
    The magic link's `emailRedirectTo` points there
    (`src/app/auth/callback/route.ts` runs `exchangeCodeForSession`); if it is
    not allowlisted the link cannot return to the app.
- **Email auth (magic link / OTP)** enabled. The request uses
  `shouldCreateUser: true`, so a first-time email is registered on sign-in.

## 3. Database (one-time provisioning)

1. **Apply the migration**
   **`supabase/migrations/202607150001_hosted_project_and_payrun_storage.sql`**
   (SQL Editor → paste → Run). It creates the `zenfix_app` role (NOLOGIN), the
   tables, the owner-scoped RLS (`public.zenfix_current_uid()` +
   `zenfix_owns_project`), and the grants.

2. **Create a dedicated login role.** The adapter refuses any connection role
   that is a superuser or **bypasses RLS** (a safety check), and Supabase's
   default `postgres` pooler role has `BYPASSRLS`. So connect as a role that can
   log in, does **not** bypass RLS, and is a member of `zenfix_app`:
   ```sql
   create role zenfix_login with login nosuperuser nobypassrls password '<choose-a-strong-password>';
   grant zenfix_app to zenfix_login;
   ```

3. **Build `SUPABASE_DATABASE_URL`** against the **Transaction-mode pooler (port
   6543)**, connecting as `zenfix_login`, ending in `?sslmode=no-verify`:
   ```
   postgresql://zenfix_login.<project-ref>:<password>@<region>.pooler.supabase.com:6543/postgres?sslmode=no-verify
   ```
   - `zenfix_login.<project-ref>` is the Supavisor username form for a
     non-default role (copy the pooler host/region from Dashboard → Connect).
   - **`sslmode=no-verify`, not `require`:** current `node-postgres` treats
     `require` as full certificate verification, which fails against the
     pooler's certificate (`self-signed certificate in certificate chain`);
     `no-verify` keeps TLS on without chain verification.
   - The adapter uses transaction-scoped `SET LOCAL ROLE`, so the transaction
     pooler is required for serverless; do not rely on session-level settings.

## 4. Verify

1. Open `/zenfix/sign-in`, submit your email.
2. Follow the magic link → it returns to `/auth/callback`, which establishes the
   session.
3. `/zenfix/workspace` shows your workspace and links to Pay Runs.
4. `/zenfix/payruns` renders the (empty) list plus the **Create sandbox Pay
   Run** form.
5. Submit the form → `POST /zenfix/payruns/create` runs the hosted control loop
   in your workspace → you are redirected back and the new Pay Run appears.

If any variable is missing, `/zenfix/*` returns 503 — that is the intended
fail-closed behavior, not a bug.
