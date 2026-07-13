# ZenFix Source & Environment Completeness Audit

**Audit date:** 2026-07-13 (Asia/Shanghai)  
**Repository:** `Lovelle-Zhang/intent-swap`  
**Audited base:** `39e22dd9741164160056abf8b0ca77936716812f`  
**Audit branch:** `codex/zenfix-source-completeness-audit`  
**Scope:** read-only source, local-machine presence, GitHub metadata, publicly readable deployment and chain metadata  
**Secret handling:** this report records names and presence only. It contains no secret, token, private key, seed phrase, or credential value.

## 1. Classification and evidence rules

Every asset uses one of these classifications:

| Classification | Meaning |
| --- | --- |
| `CONFIRMED_PRESENT` | The asset or configuration name was directly observed in Git, the formal workspace, GitHub metadata, a public deployment, or a read-only chain query. |
| `REGENERABLE` | The asset is absent or disposable but can be recreated from tracked source or an owned service without preserving its old value. |
| `EXTERNAL_RECONFIGURATION_REQUIRED` | Source exists, but a platform or host must be configured outside Git. |
| `OLD_MACHINE_RECOVERY_REQUIRED` | Continuity depends on a machine-local or separately backed-up value that cannot be reconstructed from Git without changing identity or history. |
| `UNKNOWN` | Current permissions or tooling could not establish presence or correctness. No inference is made. |
| `MISSING_BLOCKER` | A required capability or decision is absent and blocks the named readiness target. |

Evidence was collected with `git`, `gh`, filesystem metadata, environment-name-only checks, dependency inspection, an in-memory Solidity compile, public HTTP status checks, and read-only JSON-RPC calls. No platform setting was changed and no chain transaction was signed or broadcast.

## 2. Executive conclusion

The Git repository is sufficient to clone, install, build, test, and continue local ZenFix engineering. Canonical PayRun Domain and Local Development Sandbox Persistence are present on `main`. The repository also contains the complete legacy Intent Swap application, monitor source, contract source, ABI, bytecode artifact, deployment scripts, and CI workflows.

The repository is not a complete backup of the running legacy system or any future live-money system. Local and hosted environment values, monitor databases, notification identities, deployment credentials, wallet configuration, and signer custody are not in Git. This is correct for secrets, but those assets must be recovered from an old machine or reconfigured on their owning platforms before legacy operations or live-money authority can be claimed.

Slice 4 is not blocked by missing secrets or missing source. It is blocked by Architecture prerequisites: ADR-0005 and ADR-0006 are listed as required decisions but do not exist as accepted ADR files. Hosted Sandbox and Live Money remain independently not ready.

## 3. Git repository completeness

### 3.1 Repository state

| Asset | Classification | Evidence | Recovery / action | Blocking |
| --- | --- | --- | --- | --- |
| `origin/main` at audit start | `CONFIRMED_PRESENT` | Commit `39e22dd9741164160056abf8b0ca77936716812f` | Clone/fetch from GitHub | No |
| Tracked files | `CONFIRMED_PRESENT` | 128 tracked files; `git fsck` found no missing reachable object | Clone from GitHub | No |
| Formal worktree | `CONFIRMED_PRESENT` | Clean before audit; no untracked files | Recreate with Git clone/worktree | No |
| Remote branches | `CONFIRMED_PRESENT` | `main` plus six `codex/**` remote branches were visible | Fetch from `origin` | No |
| Tags | `CONFIRMED_PRESENT` | No tags exist | Create future release tags under release policy | Warning for release provenance, not Slice 4 |
| Stash | `CONFIRMED_PRESENT` | Empty on this computer | Not applicable | No |
| Unpushed commits | `CONFIRMED_PRESENT` | No commit reachable only from local branches | Not applicable | No |
| Local `main` worktree | `CONFIRMED_PRESENT` | Separate host-managed worktree is behind `origin/main`; it has no unique commit | Fetch/update in its own task; do not use it as audit source | No |
| Unreachable Git objects | `UNKNOWN` | Local object database contains unreachable blobs/trees with no reachable references | Preserve repository backup until old-machine review; do not treat them as authoritative source | No proven blocker |

### 3.2 Portability mechanisms

| Mechanism | Classification | Evidence | Recovery / action | Blocking |
| --- | --- | --- | --- | --- |
| Git submodules | `CONFIRMED_PRESENT` | No `.gitmodules` and no submodule entries | Not used | No |
| Git LFS declarations | `CONFIRMED_PRESENT` | No `.gitattributes` and no tracked LFS pointer signature | Not used by current repository | No |
| Git LFS client | `REGENERABLE` | `git lfs` is not installed locally | Install only if a future commit introduces LFS | No |
| Broken symlinks | `CONFIRMED_PRESENT` | None found outside `.git` and dependencies | Not applicable | No |
| Root lockfile | `CONFIRMED_PRESENT` | `package-lock.json` tracked; CI uses `npm ci` | Regenerate only through an intentional dependency task | No |
| Monitor lockfile | `CONFIRMED_PRESENT` | `monitor/package-lock.json` tracked; CI uses `npm ci --prefix monitor` | Same as above | No |
| Installed dependencies | `CONFIRMED_PRESENT` | Root and monitor dependency trees resolve locally | Recreate with lockfiles | No |
| Node version contract | `UNKNOWN` | CI pins Node 20; local Node is 24; package manifests do not declare `engines` or `packageManager` | Add a version-management policy in a future scoped task | Warning for reproducibility |

### 3.3 Source and runtime assets

| Asset | Classification | Evidence | Recovery / action | Blocking |
| --- | --- | --- | --- | --- |
| Next.js legacy application | `CONFIRMED_PRESENT` | `src/app/**`, components, hooks, configuration, API routes | Git clone | No for legacy source |
| Canonical PayRun Domain | `CONFIRMED_PRESENT` | `src/features/payrun/domain/**` and domain tests | Git clone | No |
| Local JSON persistence | `CONFIRMED_PRESENT` | `src/features/payrun/adapters/storage/**` and storage tests | Git clone | No |
| Application ports | `CONFIRMED_PRESENT` | `src/features/payrun/application/ports.ts` | Git clone | No |
| Slice 4 Control Loop | `MISSING_BLOCKER` | No application Control Loop implementation exists; this is the intended next slice | Implement only after ADR prerequisites are accepted | Blocks Slice 4 completion, as expected |
| Monitor source | `CONFIRMED_PRESENT` | `monitor/server.js`, `manual-exec.js`, package/lockfile, ABI, operations guide, Railway manifest | Git clone plus external env/data recovery | Source present; runtime not reproducible yet |
| Workflow source | `CONFIRMED_PRESENT` | Safety Net and Monitor health workflows are tracked and active | Git clone/GitHub Actions | Monitor workflow currently blocked by configuration |
| Scripts and tools | `CONFIRMED_PRESENT` | smoke, Solidity compile/deploy/rotation, monitor tunnel refresh | Git clone; external tools/credentials still required | No source blocker |
| Database migrations | `CONFIRMED_PRESENT` | None exist because current persistence is Local JSON and legacy lowdb | Future hosted storage requires its own migration design and ADR-0010 | Blocks hosted database, not Slice 4 |
| Deployment manifests | `CONFIRMED_PRESENT` | `vercel.json`, `monitor/railway.toml`, GitHub workflows | Git clone | Hosted Sandbox needs a separate allowlisted artifact manifest |
| License file | `UNKNOWN` | README states MIT but no tracked `LICENSE` file exists | Add through a separate legal/repository hygiene task | Production/legal warning |

### 3.4 Referenced-file consistency

Confirmed present references include the root smoke script, monitor entrypoint, Solidity compile/deploy/rotation scripts, contract artifact, and monitor ABI copy.

The following tracked documentation is stale relative to tracked source:

| Reference | Classification | Evidence | Required action | Blocking |
| --- | --- | --- | --- | --- |
| `monitor/index.js` in `DEPLOYMENT.md` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Actual package entrypoint is `monitor/server.js`; `monitor/index.js` is absent | Correct deployment instructions in a separate docs task | Can misdirect monitor recovery |
| SMTP configuration in `DEPLOYMENT.md` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Current monitor uses Resend variables, not `SMTP_HOST`, `SMTP_USER`, or `SMTP_PASS` | Mark SMTP guidance retired and align with `monitor/OPERATIONS.md` | Can misconfigure notifications |
| Arbitrum/Linea “not deployed” note | `EXTERNAL_RECONFIGURATION_REQUIRED` | Tracked addresses and read-only chain code confirm deployments on both chains | Correct the stale deployment guide | Can mislead contract operations |
| `ecosystem.config.js` | `UNKNOWN` | Operations guide describes it only “if present”; it is not tracked | Recover from current monitor host if PM2 relies on it, or document direct PM2 config | Potential monitor restart warning |

No tracked package script points to a missing executable.

## 4. GitHub configuration audit

| Configuration | Classification | Observed state | Recovery / action | Blocking |
| --- | --- | --- | --- | --- |
| Repository identity | `CONFIRMED_PRESENT` | Public, non-fork repository `Lovelle-Zhang/intent-swap`; default branch `main` | GitHub account administration | No |
| Safety Net workflow | `CONFIRMED_PRESENT` | Active; latest `main` run at the audited base succeeded | GitHub Actions | No |
| Monitor health workflow | `MISSING_BLOCKER` | Active, but the latest ten observed scheduled runs failed | Restore matching `CRON_SECRET` and verify endpoint behavior | Blocks reliable Monitor alerting |
| Repository Actions secrets | `CONFIRMED_PRESENT` | Zero visible names | Add required secret names through GitHub UI/API without committing values | `CRON_SECRET` absence blocks health workflow |
| Repository Actions variables | `CONFIRMED_PRESENT` | Zero visible names | Add only when a workflow requires non-secret configuration | No current Slice 4 blocker |
| GitHub environments | `CONFIRMED_PRESENT` | `Preview` and `Production` exist | Maintain through deployment integration | No |
| Environment secrets/variables | `CONFIRMED_PRESENT` | Zero visible names in both environments | Configure only if GitHub Actions consumes them | No current Slice 4 blocker |
| Branch protection | `EXTERNAL_RECONFIGURATION_REQUIRED` | `main` is not protected | Add required PR/check protections before production release | Blocks production governance readiness |
| Repository rulesets | `EXTERNAL_RECONFIGURATION_REQUIRED` | None | Add a ruleset or equivalent branch policy | Blocks production governance readiness |
| Actions policy | `EXTERNAL_RECONFIGURATION_REQUIRED` | Actions enabled; all actions allowed; SHA pinning not required | Restrict and pin third-party actions before hardened production release | Production warning |
| Repository webhooks | `CONFIRMED_PRESENT` | No classic webhook entries | GitHub App integrations do not require classic hooks | No |
| Vercel GitHub integration | `CONFIRMED_PRESENT` | `vercel[bot]` creates Preview/Production deployments and PR checks | Reinstall/reconnect through Vercel if lost | Required for current hosted legacy deployment |
| GitHub App installation detail | `UNKNOWN` | Installation endpoint was not accessible with current token | Verify in GitHub App settings if ownership/audit detail is required | No current development blocker |

## 5. Vercel configuration audit

| Asset | Classification | Evidence | Recovery / action | Blocking |
| --- | --- | --- | --- | --- |
| Git repository connection | `CONFIRMED_PRESENT` | Vercel bot deployments and PR checks are active | Reconnect Git integration if removed | No |
| Latest deployment | `CONFIRMED_PRESENT` | Production deployment for `39e22dd` reported success | Vercel deployment history | No for current legacy site |
| Public domain | `CONFIRMED_PRESENT` | `https://intent-swap.app/` returned HTTP 200 during audit | DNS and Vercel domain settings | No for reachability |
| Latest generated deployment URL | `CONFIRMED_PRESENT` | GitHub deployment metadata exposed a Vercel URL; it returned HTTP 302 | Vercel deployment history | No |
| `vercel.json` | `CONFIRMED_PRESENT` | Next.js framework, `next build`, `.next`, `npm install` | Git clone | No |
| Local Vercel link | `UNKNOWN` | `.vercel/project.json` absent from formal workspace | Run a future authorized `vercel link` or restore metadata; do not commit `.vercel` | No for Git-based deploy; blocks local project administration |
| Vercel CLI authentication | `UNKNOWN` | Vercel CLI not installed/available | Install and authenticate only in an explicit platform-admin task | Does not block this audit |
| Project ID/team identity | `UNKNOWN` | Not available without project link or Vercel API access | Verify in Vercel project settings | Blocks authoritative platform inventory |
| Root directory | `UNKNOWN` | Tracked config is root-compatible, but platform setting was not readable | Verify Vercel project setting | Hosted release warning |
| Production branch | `UNKNOWN` | Deployments follow `main`, but platform setting was not readable | Verify Vercel project setting | Hosted release warning |
| Custom domain inventory | `UNKNOWN` | `intent-swap.app` is reachable; complete domain list was not readable | Verify Domains page | Hosted release warning |
| Vercel environment variable names | `UNKNOWN` | No CLI/API permission or local link | Export names/scopes only from Development/Preview/Production settings | Blocks authoritative Hosted and legacy runtime recovery |
| Build/framework settings | `UNKNOWN` | Git settings are known; platform overrides were not readable | Compare Vercel settings with `vercel.json` | Hosted release warning |

The current Vercel deployment is the legacy mixed-capability application. It is not evidence that the Hosted Sandbox Physical-Isolation Gate has passed.

## 6. External service inventory

| Service | Depends on it | Configuration names | Classification | Recovery path | Readiness impact |
| --- | --- | --- | --- | --- | --- |
| OpenAI API | Legacy intent parsing | `OPENAI_API_KEY` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Create/rotate an API key and configure the server environment | Legacy intent parsing only; not required for deterministic Slice 4 fixtures |
| WalletConnect/Reown | Browser wallet connection | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Create or recover project access in WalletConnect Cloud | Blocks reproducible wallet behavior |
| Public RPC providers | Quotes, wallet reads, monitor, deployment scripts | `ARBITRUM_RPC_URL`, `LINEA_RPC_URL`; several hardcoded public endpoints | `CONFIRMED_PRESENT` | Public endpoints are replaceable; production providers require an owned SLA/config | Read-only development works; not sufficient for live-money reliability |
| Resend | Monitor and health-alert email | `RESEND_API_KEY`, `RESEND_FROM`, `OWNER_EMAIL` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Recover Resend project/domain access or issue a replacement key | Blocks reliable email alerts |
| Monitor authentication | Next.js-to-monitor bearer authentication | `INTERNAL_API_KEY` | `OLD_MACHINE_RECOVERY_REQUIRED` | Recover the matching value from current Vercel/monitor host, or rotate both sides together | Blocks Monitor API continuity |
| Monitor endpoint/tunnel | Conditional-order proxy | `MONITOR_URL`; tunnel tool also names `VERCEL_AUTH`, `VERCEL_PROJ_ID` | `UNKNOWN` | Verify current host/tunnel and Vercel setting; reconfigure both if replaced | Blocks Monitor functionality |
| Server Chan | Owner WeChat notification | `SCT_KEY` | `EXTERNAL_RECONFIGURATION_REQUIRED` | Reissue from the service account | Optional notification channel |
| Web Push | Browser notifications | `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` | `OLD_MACHINE_RECOVERY_REQUIRED` | Recover the existing key pair to preserve subscriptions; regeneration invalidates existing subscriptions | Blocks continuity of existing Web Push subscriptions |
| Subscription check service | Legacy paywall | `SUBSCRIPTION_CHECK_URL`, `FREE_TIER`, `NEXT_PUBLIC_FREE_TIER` | `UNKNOWN` | Verify ownership, availability, and matching server/client policy | Legacy product warning |
| CoinGecko/Binance/DefiLlama | Price and quote inputs | Hardcoded public HTTPS endpoints | `CONFIRMED_PRESENT` | Replace/allowlist under an explicit provider policy | Development available; production SLA/rate limits unknown |
| Logging/analytics | Application logging only | `NEXT_PUBLIC_DEBUG`, `DEBUG` | `CONFIRMED_PRESENT` | No analytics vendor SDK is tracked; configure debug flags deliberately | No Slice 4 blocker |
| Railway/Aliyun/PM2 monitor host | Legacy monitor runtime | Host env, `PORT`, `DATA_DIR`, process manager state | `UNKNOWN` | Inspect the active host and platform account | Blocks authoritative monitor recovery |

Future ZenFix Funding and Payment have no provider credential names because no real adapter or accepted live rail exists. Adding a generic secret now would not make those capabilities ready.

## 7. Contracts and chains

### 7.1 Reproducible tracked assets

| Asset | Classification | Evidence | Recovery / action | Blocking |
| --- | --- | --- | --- | --- |
| Solidity source | `CONFIRMED_PRESENT` | `contracts/ConditionalSwapVault.sol` | Git clone | No |
| Compiler input/toolchain | `CONFIRMED_PRESENT` | `solc` 0.8.35, optimizer 200 runs | `npm ci`; compile from source | No |
| ABI + bytecode artifact | `CONFIRMED_PRESENT` | Artifact contains ABI, bytecode, compiler, name; bytecode is 7,883 bytes | Regenerate from tracked source and lockfile | No |
| Artifact reproducibility | `CONFIRMED_PRESENT` | In-memory compile matched tracked ABI and bytecode exactly | Repeat read-only compile | No |
| Monitor artifact copy | `CONFIRMED_PRESENT` | Byte-for-byte SHA-256 match with canonical artifact | Copy from canonical tracked artifact | No |
| Deployment scripts | `CONFIRMED_PRESENT` | mainnet, Arbitrum, Linea deploy and owner/keeper rotation paths | Git clone plus authorized signer | Source present |
| Deployment manifests/receipts | `OLD_MACHINE_RECOVERY_REQUIRED` | No structured per-deployment receipt, constructor-argument record, or transaction manifest is tracked | Recover deploy logs/account history or rediscover from explorers | Blocks exact historical reproduction, not source compilation |
| Independent audit | `MISSING_BLOCKER` | Tracked security note explicitly says self-review, not third-party audit | Commission required review before live-money use | Blocks Live Money |

The canonical constructor is `(swapRouter, keeper, dexType)`. The repository states that Ethereum and Arbitrum deployed revisions have older constructor shapes, while Linea uses the current three-argument revision. Therefore current source can produce a new deployment but cannot be assumed byte-identical to every deployed contract.

### 7.2 Read-only chain observations

| Chain | Chain ID | Tracked address | Code present | Read-only authority observation | Classification |
| --- | ---: | --- | --- | --- | --- |
| Ethereum | 1 | `0x52a8fe40324621d310ede9bfd20396b82dfec0ee` | Yes | owner and keeper resolve to the documented legacy authority; `dexType` is unavailable on this older revision | `CONFIRMED_PRESENT` |
| Arbitrum | 42161 | `0x3e89119234c0635e861cce71efa274f1defd6818` | Yes | owner and keeper resolve to the documented consolidated authority; `dexType` is unavailable on this older revision | `CONFIRMED_PRESENT` |
| Linea | 59144 | `0x568b8946697ac7e2c6bb1f1be9e5946e9c800097` | Yes | owner/keeper resolve and `dexType=1`; configured router matches the Linea deployment path | `CONFIRMED_PRESENT` |

These observations prove code and public authority state at audit time. They do not prove possession of any private key, current balances, absence of pending orders, source verification equivalence, or Live Money readiness.

### 7.3 Signer requirements

| Requirement | Classification | Recovery / action | Blocking |
| --- | --- | --- | --- |
| User wallet for legacy swaps/deposits/orders | `OLD_MACHINE_RECOVERY_REQUIRED` | Restore browser/hardware wallet from its approved backup; never copy a seed into Git | Blocks using the same wallet identity |
| Current keeper private key | `OLD_MACHINE_RECOVERY_REQUIRED` | Recover from the active monitor host, wallet custody, or approved backup; otherwise rotate using owner authority | Blocks legacy auto-execution |
| Ethereum legacy owner/keeper authority | `OLD_MACHINE_RECOVERY_REQUIRED` | Recover the authorized signer or deploy/migrate under a separately approved plan | Blocks administrative recovery of that vault |
| Arbitrum/Linea owner authority | `OLD_MACHINE_RECOVERY_REQUIRED` | Recover consolidated signer custody or approved backup | Blocks keeper rotation and administration |
| Future ZenFix live rail credential | `MISSING_BLOCKER` | Select a rail, accept ADR-0011 and custody design, then provision least-privilege credentials | Blocks real Funding/Payment |

## 8. Readiness decisions

| Target | Decision | Exact blockers / warnings |
| --- | --- | --- |
| 1. Slice 4 Sandbox Control Loop | **NOT_READY** | ADR-0005 must be accepted before Review/Funding implementation; ADR-0006 must be accepted before Ledger implementation. Neither ADR file exists. No secret or old-machine asset is otherwise required for Sandbox fixtures. |
| 2. Local Pilot Validation | **NOT_READY** | Slice 4 Gate has not passed; the real four-scenario Control Loop records and read-only validation surface do not exist; product study entry requirements are unmet. |
| 3. Vercel Hosted Sandbox | **NOT_READY** | Hosted Sandbox Physical-Isolation Gate is not passed; no separate sandbox allowlist artifact, denylist/import/SBOM evidence, route-manifest negatives, isolated IAM/secret namespace, startup rejection, or egress policy exists; Vercel env/settings inventory is `UNKNOWN`. |
| 4. Wallet / Monitor functionality | **NOT_READY** | WalletConnect project configuration is absent locally and hosted presence is `UNKNOWN`; monitor endpoint/auth/env/data are external or absent; GitHub Monitor health workflow is failing because no visible `CRON_SECRET` exists. |
| 5. Real Funding | **NOT_READY** | Architecture prohibits live funding; no ZenFix funding execution adapter, Base bridge capability, Asset Registry acceptance, live credential custody, kill-switch ADR, or security review exists. Legacy Vault/swap code is explicitly not a ZenFix funding proof. |
| 6. Real Payment / Live Money | **NOT_READY** | No accepted live-rail ADR-0011, rail adapter, reconciliation/finality contract, incident controls, independent security review, production credential custody, or Live Money Gate evidence. Signer custody is also not recoverable from Git. |
| 7. Production Release | **NOT_READY** | Hosted Sandbox and Live Money gates are unpassed; Slices 4-10 and product validation are incomplete; `main` lacks protection/rulesets; monitor health is failing; Vercel authoritative settings/env inventory is unavailable. |

## 9. Blocker summary

### Blocks Slice 4

- `MISSING_BLOCKER`: accepted ADR-0005.
- `MISSING_BLOCKER`: accepted ADR-0006.

No old-machine credential is required to implement deterministic Sandbox Control Loop behavior.

### Blocks Hosted Sandbox

- `MISSING_BLOCKER`: Hosted Sandbox Physical-Isolation Gate evidence and separate artifact profile.
- `UNKNOWN`: authoritative Vercel project settings and environment variable scopes.
- `EXTERNAL_RECONFIGURATION_REQUIRED`: isolated Hosted Sandbox IAM, secrets, and egress policy.

### Blocks Live Money

- `MISSING_BLOCKER`: accepted live rail and ADR-0011, rail implementation, reconciliation/finality, security review, and Live Money Gate.
- `OLD_MACHINE_RECOVERY_REQUIRED`: any existing legacy owner/keeper authority needed for migration or retirement.
- `MISSING_BLOCKER`: production-grade signer/credential custody; a recovered raw key alone is not an acceptable custody design.

## 10. Audit limitations

- Vercel project settings and env names were not accessible; they remain `UNKNOWN` rather than inferred from successful deployments.
- Current Railway/Aliyun/PM2 state, monitor env, monitor databases, backups, and tunnel process were not accessible.
- Browser wallet state, hardware-wallet backups, certificates, and signing keys were not inspected.
- Explorer pages did not provide reliable machine-readable source-verification evidence in this session; repository self-review claims were not promoted to independent verification.
- GitHub App installation detail was inaccessible, although Vercel bot deployment behavior was directly visible.
- No secret value was read or tested for correctness.

