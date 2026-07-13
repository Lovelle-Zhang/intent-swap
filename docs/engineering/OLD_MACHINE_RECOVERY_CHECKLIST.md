# ZenFix Old Machine Recovery Checklist

This checklist covers assets that a Git clone cannot restore. It must be executed without copying any secret into Git, issue comments, pull requests, chat, screenshots, or audit output.

## 1. Recovery rules

- Record only asset name, owner, location class, last rotation/backup date, and recovery result.
- Move secrets only through an approved password manager, hardware wallet, platform secret store, encrypted backup, or direct platform rotation.
- Prefer rotation over copying when continuity does not depend on the old value.
- Preserve existing VAPID keys only when existing Web Push subscriptions must continue.
- Never export a seed phrase or private key into a shell history, plaintext note, repository file, or cloud-synced unencrypted folder.
- Do not run contract writes, fund transfers, deploys, or keeper rotations as part of this checklist.
- If an authority cannot be recovered, mark it `OLD_MACHINE_RECOVERY_REQUIRED`; do not claim control from a public address alone.

## 2. Git and source state

- [ ] `CONFIRMED_PRESENT` — Compare old-machine remotes and `git branch -a -vv` with GitHub.
- [ ] `CONFIRMED_PRESENT` — Run `git status --short` in every old checkout and record untracked filenames only.
- [ ] `CONFIRMED_PRESENT` — Run `git stash list`; export a patch only after reviewing it for secrets.
- [ ] `CONFIRMED_PRESENT` — Identify commits reachable from local branches but not remotes.
- [ ] `UNKNOWN` — Inspect unreachable/reflog-only objects only if they can be reviewed without exposing credentials.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Recover any critical source, deployment note, or script that exists only locally; sanitize it before deciding whether it belongs in Git.
- [ ] `CONFIRMED_PRESENT` — Verify no alternate repository or temporary source mirror contains a newer authoritative implementation.

Current computer evidence shows no untracked file, stash, or unpushed commit in the formal workspace. This does not prove the old computer has none.

## 3. Environment files and platform mappings

For each file, record presence and variable names only. Do not print values.

- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Root `.env`, `.env.local`, `.env.production`, `.env.development`, and any shell profile exports.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — `monitor/.env` and PM2 process environment.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Any `.vercel/project.json` link metadata; project IDs are metadata, but access tokens remain secret.
- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — Map Vercel Development/Preview/Production variable names and scopes.
- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — Map GitHub Actions secret names and confirm `CRON_SECRET` exists where the workflow reads it.
- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — Confirm the same `INTERNAL_API_KEY` identity is configured on Vercel and the monitor host, or schedule a coordinated rotation.
- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — Confirm `MONITOR_URL` points to the current monitor/tunnel and is not a stale quick-tunnel URL.
- [ ] `UNKNOWN` — Record any Railway, Aliyun, PM2, Nginx, Cloudflare, DNS, or Vercel account/project ownership needed for recovery.

## 4. Monitor data and operations

- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Locate `orders.json` and `subscriptions.json` on the active host and old machine.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Record `DATA_DIR`, volume mount, owner, permissions, and backup location without copying data into Git.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Preserve current Web Push subscription records with their matching VAPID identity.
- [ ] `UNKNOWN` — Locate server-side `.bak.<timestamp>` files described by operations docs.
- [ ] `UNKNOWN` — Determine whether any daily snapshot/backup exists; tracked docs say automatic backup is not configured.
- [ ] `UNKNOWN` — Capture PM2 process name, startup registration, runtime Node version, and restart procedure.
- [ ] `UNKNOWN` — Recover `ecosystem.config.js` only if the live host actually uses it; it is not tracked.
- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — Verify Nginx/reverse-proxy and tunnel configuration against the current `monitor/server.js` entrypoint and port.
- [ ] `MISSING_BLOCKER` — Restore the GitHub Monitor health workflow by configuring a matching `CRON_SECRET` and observing a successful scheduled/manual run.

Monitor JSON files may contain user/order data. Handle them under an explicit data-access and privacy process, not as ordinary source files.

## 5. Notification and third-party services

- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — OpenAI project ownership and ability to issue a replacement `OPENAI_API_KEY`.
- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — WalletConnect/Reown project ownership and allowed origins.
- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — Resend project, verified sending domain, sender identity, alert recipient configuration, and key rotation ability.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Existing `VAPID_PUBLIC`/`VAPID_PRIVATE` pair if push subscription continuity matters.
- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — Server Chan account/key if WeChat owner alerts remain required.
- [ ] `UNKNOWN` — Subscription-check service ownership, endpoint contract, data source, and operational status.
- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — RPC provider accounts, quotas, allowlists, billing, and replacement procedure if non-public endpoints were used.
- [ ] `UNKNOWN` — Any analytics, logging, error tracking, or uptime service configured externally but not represented in package dependencies.

Most API keys can be regenerated. Regeneration is preferred unless it breaks identity continuity or requires coordinated downtime.

## 6. Wallet, contract, and signing authority

- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Browser wallet profiles and network configuration needed for the same user identities.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Hardware wallet devices, recovery backups, and PIN recovery procedures; do not record PINs here.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Ethereum legacy owner/keeper signer authority.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Consolidated Arbitrum/Linea owner/keeper signer authority.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Current monitor keeper credential or approved custody reference.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Deployment logs, transaction hashes, constructor arguments, verification submissions, and rotation receipts not captured in Git.
- [ ] `CONFIRMED_PRESENT` — Compare recovered public addresses with read-only on-chain `owner()` and `keeper()` results before any future administrative plan.
- [ ] `MISSING_BLOCKER` — Establish an approved production signer/rail custody design before Live Money; recovering a raw legacy key does not satisfy this requirement.

If a private key or seed phrase is found only on the old computer, first create an encrypted offline backup under an approved custody process. Do not test it by moving funds during this audit.

## 7. Certificates, domains, and deployment identity

- [ ] `UNKNOWN` — DNS registrar account for `intent-swap.app`.
- [ ] `UNKNOWN` — Vercel team/project ownership, production branch, root directory, domains, and project-level build overrides.
- [ ] `UNKNOWN` — TLS certificates or reverse-proxy certificate automation for the monitor host.
- [ ] `UNKNOWN` — SSH keys and host access for Aliyun/Railway/other monitor infrastructure.
- [ ] `UNKNOWN` — Cloudflare quick-tunnel process and any durable tunnel alternative.
- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — Replace machine-bound SSH/API credentials with named operator access and documented rotation where possible.
- [ ] `EXTERNAL_RECONFIGURATION_REQUIRED` — Record Vercel/GitHub/RPC/Resend/WalletConnect owners and at least one recovery administrator.

## 8. Local databases and generated files

- [ ] `REGENERABLE` — `node_modules`, `.next`, coverage, and build caches; recreate from lockfiles.
- [ ] `REGENERABLE` — Solidity ABI/bytecode artifact; tracked source and compiler reproduce it exactly.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Any Local JSON PayRun store that contains pilot evidence not committed to Git.
- [ ] `OLD_MACHINE_RECOVERY_REQUIRED` — Legacy monitor databases and backups.
- [ ] `UNKNOWN` — Browser local storage, wallet connection state, or downloaded research evidence needed for a study.
- [ ] `UNKNOWN` — Machine-local logs needed for incident or deployment history.

Generated state must not be committed merely to make it portable. Use an approved encrypted backup or platform storage.

## 9. Recovery priorities

### Priority A — before relying on legacy Wallet / Monitor

1. Recover or rotate `INTERNAL_API_KEY` on both application and monitor.
2. Verify/reconfigure `MONITOR_URL` and active host/tunnel.
3. Recover monitor data volume and backups.
4. Restore `CRON_SECRET` to GitHub and Vercel and obtain a passing health run.
5. Verify WalletConnect project access and hosted environment presence.
6. Recover VAPID identity if existing subscriptions matter.

### Priority B — before contract administration or legacy auto-execution

1. Establish custody for current owner/keeper authorities.
2. Recover deployment and keeper-rotation receipts.
3. Verify public owner/keeper state read-only.
4. Plan any rotation separately with review, rollback, and explicit transaction authorization.

### Priority C — before Hosted Sandbox

1. Recovering legacy credentials is not required and they must not be injected into Sandbox.
2. Create the isolated Hosted Sandbox artifact/profile, namespace, IAM, and egress controls.
3. Obtain Vercel project/environment inventory and prove no live credential is present.
4. Pass every Hosted Sandbox Physical-Isolation Gate item.

### Priority D — before Live Money

1. Complete the required Architecture decisions, including live rail and custody.
2. Implement and independently review the selected rail and reconciliation model.
3. Establish production-grade credential custody, kill switches, incident response, and two-person authorization.
4. Pass the Live Money Gate. Legacy private-key recovery alone is insufficient.

## 10. Exit record

The recovery exercise is complete only when every checked asset has:

- one classification from the audit vocabulary;
- an accountable owner;
- a source or custody location class, without a secret value;
- a tested recovery or rotation procedure appropriate to its risk;
- a statement of which readiness target it blocks;
- confirmation that no credential was committed to Git.

