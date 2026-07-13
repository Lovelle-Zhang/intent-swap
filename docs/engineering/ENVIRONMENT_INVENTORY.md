# ZenFix Environment Inventory

**Audit base:** `39e22dd9741164160056abf8b0ca77936716812f`  
**Presence rule:** “Local” means the formal workspace and current process environment. “Hosted” remains `UNKNOWN` unless a platform API exposed the variable name. Values were never read or recorded.

## 1. Inventory summary

- Tracked templates: `.env.local.example`, `monitor/.env.example` — `CONFIRMED_PRESENT`.
- Local runtime env files: `.env`, `.env.local`, `.env.production`, `.env.development`, `monitor/.env` — absent.
- Current process: none of the project-specific variables below is present.
- Vercel variable names/scopes: `UNKNOWN`; Vercel CLI and local link metadata are unavailable.
- GitHub Actions repository/environment secrets and variables: zero visible names.
- Build and Safety Net do not require project secrets; the latest Safety Net passed.
- Monitor health workflow requires `CRON_SECRET`; the name is absent from visible GitHub secrets and recent scheduled runs fail.

## 2. Next.js application and build variables

| Name | Category | Code/template source | Local presence | Hosted presence | Classification | Purpose / recovery | Blocking |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `OPENAI_API_KEY` | Local development, Vercel Preview/Production | Code + root template | Absent | `UNKNOWN` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Server-side legacy intent parsing; issue/rotate in OpenAI project | Blocks legacy LLM parsing, not Slice 4 fixtures |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Local development, build-time browser config, Vercel | Code + root template | Absent | `UNKNOWN` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Public WalletConnect/Reown project ID; recover project access or create a new project | Blocks reproducible wallet connection |
| `MONITOR_URL` | Local development, Vercel server runtime | Code + root template | Absent | `UNKNOWN` | `OLD_MACHINE_RECOVERY_REQUIRED` | Current monitor base URL; recover hosted value or reconfigure monitor and Vercel together | Blocks legacy orders/health proxy |
| `NEXT_PUBLIC_MONITOR_URL` | Deprecated compatibility fallback | Code only | Absent | `UNKNOWN` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Public fallback conflicts with current server-only guidance; remove through a scoped legacy hardening task rather than configure it | Security/configuration warning |
| `INTERNAL_API_KEY` | Local development, Vercel, monitor | Code + both templates | Absent | `UNKNOWN` | `OLD_MACHINE_RECOVERY_REQUIRED` | Shared bearer secret; recover matching value or rotate both application and monitor | Blocks monitor API continuity |
| `SUBSCRIPTION_CHECK_URL` | Local development, Vercel | Code + root template | Absent | `UNKNOWN` | `UNKNOWN` | Legacy subscription authority endpoint; verify service ownership and contract | Blocks enforced legacy subscription mode |
| `FREE_TIER` | Local development, Vercel | Code + root template | Absent | `UNKNOWN` | `REGENERABLE` | Server-side legacy beta gate; explicitly configure with matching client policy | Warning if server/client differ |
| `NEXT_PUBLIC_FREE_TIER` | Build-time browser config, Vercel | Code + root template | Absent | `UNKNOWN` | `REGENERABLE` | Client-side legacy beta gate | Warning if server/client differ |
| `CRON_SECRET` | GitHub Actions, Vercel server runtime | Workflow + health route; absent from root template | Absent | `UNKNOWN`; absent from GitHub secrets | `MISSING_BLOCKER` | Shared health endpoint credential; generate/rotate and set in both GitHub and Vercel | Blocks Monitor health workflow |
| `RESEND_API_KEY` | Vercel server runtime, monitor | Code; monitor template only | Absent | `UNKNOWN` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Email alerts; issue/rotate in Resend | Blocks email alert delivery |
| `RESEND_FROM` | Vercel server runtime, monitor | Code + monitor template | Absent | `UNKNOWN` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Sender identity; verify domain and configure consistently | Email warning |
| `OWNER_EMAIL` | Vercel server runtime | Health route only | Absent | `UNKNOWN` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Alert destination; add to template and platform settings without embedding a personal address in source | Health-alert warning |
| `NEXT_PUBLIC_DEBUG` | Build-time browser config | Code only | Absent | `UNKNOWN` | `REGENERABLE` | Enables browser-visible debug logging | No |
| `DEBUG` | Server/local runtime | Code only | Absent | `UNKNOWN` | `REGENERABLE` | Enables debug logging | No |
| `NODE_ENV` | Build/runtime platform | Framework/code | Tool-managed | Platform-managed | `CONFIRMED_PRESENT` | Standard Node/Next environment | No |
| `NEXT_TELEMETRY_DISABLED` | CI build | Safety Net workflow | Not required locally | GitHub workflow sets it | `CONFIRMED_PRESENT` | Disables Next telemetry in CI | No |

## 3. Monitor variables

| Name | Requirement | Template | Local presence | External presence | Classification | Purpose / recovery | Blocking |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `INTERNAL_API_KEY` | Required for protected order endpoints | Yes | Absent | `UNKNOWN` | `OLD_MACHINE_RECOVERY_REQUIRED` | Must match Next.js server | Blocks Monitor API |
| `KEEPER_PRIVATE_KEY` | Required only for legacy auto-execution | Yes | Absent | `UNKNOWN` | `OLD_MACHINE_RECOVERY_REQUIRED` | Recover approved keeper custody or rotate on-chain using owner authority | Blocks legacy auto-execution; prohibited in ZenFix Sandbox |
| `ARBITRUM_RPC_URL` | Optional override | Yes | Absent | `UNKNOWN` | `REGENERABLE` | Read/write RPC for legacy monitor; public fallback exists | Production reliability warning |
| `LINEA_RPC_URL` | Optional override | No | Absent | `UNKNOWN` | `REGENERABLE` | Linea RPC; code has public fallback | Template completeness warning |
| `RESEND_API_KEY` | Required for email | Yes | Absent | `UNKNOWN` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Resend credential | Blocks email |
| `RESEND_FROM` | Optional sender override | Yes | Absent | `UNKNOWN` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Verified sender identity | Warning |
| `SCT_KEY` | Optional WeChat owner notification | Yes | Absent | `UNKNOWN` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Reissue through Server Chan | Optional |
| `VAPID_PUBLIC` | Required for Web Push | Yes | Absent | `UNKNOWN` | `OLD_MACHINE_RECOVERY_REQUIRED` | Recover pair to preserve subscriptions | Blocks existing push continuity |
| `VAPID_PRIVATE` | Required for Web Push | Yes | Absent | `UNKNOWN` | `OLD_MACHINE_RECOVERY_REQUIRED` | Same pair as public key; never commit | Blocks existing push continuity |
| `VAPID_SUBJECT` | Optional VAPID claim | Yes | Absent | `UNKNOWN` | `REGENERABLE` | Configure a valid operator contact | Warning |
| `PORT` | Optional runtime port | Yes | Absent | Host-managed/`UNKNOWN` | `REGENERABLE` | Defaults to 3002; platforms may inject | No |
| `DATA_DIR` | Required for durable hosted lowdb | Yes | Absent | `UNKNOWN` | `OLD_MACHINE_RECOVERY_REQUIRED` | Must point at persistent volume containing monitor JSON state | Blocks monitor restart durability |

## 4. Contract deployment and administration variables

| Name | Source | Local presence | Classification | Purpose / recovery | Blocking |
| --- | --- | --- | --- | --- | --- |
| `DEPLOYER_PRIVATE_KEY` | Deploy and keeper-rotation scripts; absent from templates | Absent | `OLD_MACHINE_RECOVERY_REQUIRED` | Authorized owner/deployer signer. Restore only from approved wallet backup/custody; never Git | Blocks deployment/owner rotation with the same authority |
| `KEEPER_ADDRESS` | Deploy script; absent from templates | Absent | `REGENERABLE` | Public address selected for a new deployment | Blocks deployment until deliberately chosen |
| `NEW_OWNER_ADDRESS` | Keeper-rotation script; absent from templates | Absent | `REGENERABLE` | Public destination for owner/keeper rotation | Blocks rotation until deliberately chosen |
| `KEEPER_PRIVATE_KEY` | Monitor/manual execution | Absent | `OLD_MACHINE_RECOVERY_REQUIRED` | Legacy keeper signer | Blocks legacy auto/manual execution |

These variables belong only to legacy contract operations. They must be absent from a ZenFix Hosted Sandbox profile.

## 5. Tooling and operational variables

| Name | Source | Presence | Classification | Purpose / recovery | Blocking |
| --- | --- | --- | --- | --- | --- |
| `VERCEL_AUTH` | Monitor tunnel refresh tool | Absent | `EXTERNAL_RECONFIGURATION_REQUIRED` | Vercel API authorization for tunnel update; replace with scoped platform automation | Blocks that local tool only |
| `VERCEL_PROJ_ID` | Monitor tunnel refresh tool | Absent | `EXTERNAL_RECONFIGURATION_REQUIRED` | Vercel project identifier | Blocks that local tool only |
| `ZENFIX_LEASE_HOLDER` | Storage test helper | Test sets it in a child process | `CONFIRMED_PRESENT` | Test-only switch; not product configuration | No |
| `PATH`, `HOME`, `LANG`, `TMPDIR` | Smoke/test sanitization | OS-managed | `CONFIRMED_PRESENT` | Standard process environment | No |

## 6. Future ZenFix safety controls

Architecture names the following controls, but current source has no runtime configuration implementation for them:

| Name | Expected safe default | Classification | Required before |
| --- | --- | --- | --- |
| `ZENFIX_PRODUCT_SURFACE` | Local migration only; Hosted Sandbox hard-pins ZenFix | `MISSING_BLOCKER` | Hosted Sandbox artifact/profile |
| `ZENFIX_EXECUTION_MODE` | `sandbox` | `MISSING_BLOCKER` | Hosted Sandbox runtime |
| `ZENFIX_REAL_FUNDING_EXECUTION_ENABLED` | `0` | `MISSING_BLOCKER` | Any Funding adapter wiring |
| Persisted `live_execution_enabled` | `false` | `MISSING_BLOCKER` | Any Live Money review |

Flags alone cannot enable Live Money. They are outer safety controls in addition to accepted ADRs, Project/Policy controls, adapter isolation, and operational evidence.

## 7. Template gaps and conflicts

### Missing from `.env.local.example` despite code dependency

- `CRON_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `OWNER_EMAIL`
- `NEXT_PUBLIC_DEBUG`
- `DEBUG`
- contract-operation variables, if deployment scripts are intentionally supported from the root environment

### Missing from `monitor/.env.example`

- `LINEA_RPC_URL`

### Stale or conflicting names

- `NEXT_PUBLIC_MONITOR_URL` remains a code fallback although current security guidance says Monitor URL is server-only.
- `DEPLOYMENT.md` documents `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS`, but current monitor source uses Resend and never reads those SMTP names.
- `.env.local.example` and `DEPLOYMENT.md` imply a smaller Vercel variable set than the health route actually reads.
- `FREE_TIER` and `NEXT_PUBLIC_FREE_TIER` can disagree because they are independent server/client values.

### Preview / Production uncertainty

Vercel Development, Preview, and Production variable-name scopes could not be listed. Any equality claim for `INTERNAL_API_KEY`, `CRON_SECRET`, `MONITOR_URL`, WalletConnect, Resend, or feature gates is therefore `UNKNOWN` and requires external verification.

## 8. Minimum environment sets by target

| Target | Minimum names | Current result |
| --- | --- | --- |
| Source install, lint, typecheck, tests, build | No project secret required; CI sets `NEXT_TELEMETRY_DISABLED` | `CONFIRMED_PRESENT` via Safety Net |
| Deterministic Slice 4 Sandbox fixtures | No wallet, RPC, keeper, funding, or payment secret | Environment-ready; Architecture ADRs still block implementation |
| Legacy local UI with intent parsing and wallet | `OPENAI_API_KEY`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Not locally configured |
| Legacy orders proxy | `MONITOR_URL`, `INTERNAL_API_KEY`; optional subscription gates | Not locally configured; hosted status `UNKNOWN` |
| Legacy monitor API | `INTERNAL_API_KEY`, durable `DATA_DIR`; notification/provider options as used | External state `UNKNOWN` |
| Monitor health workflow | Matching `CRON_SECRET` in GitHub and Vercel | `MISSING_BLOCKER` |
| Hosted Sandbox | Separate sandbox profile, safe defaults, isolated namespace/IAM/egress, no real credentials | `MISSING_BLOCKER` |
| Live Money | Accepted rail/custody design plus rail-specific names not yet defined | `MISSING_BLOCKER` |

