# ZenFix Slice 1 Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, non-interactive safety net that records the current Intent Swap behavior before PayRun migration begins.

**Architecture:** Test legacy behavior only through existing public seams: exported Next route handlers, token configuration exports, the WalletButton render-prop boundary, and an isolated monitor child process. The smoke runner starts a production Next server and an empty local monitor on dynamic loopback ports, so CI exercises integration without touching real RPCs, wallets, orders, notifications, or funds.

**Tech Stack:** Next.js 14.2.3, React 18.3.1, TypeScript 5.9.3, ESLint 8.57.1, Vitest 3.2.7, Vite 6.4.3, jsdom 24.1.3, React Testing Library 14.3.1.

## Global Constraints

- Keep `intent-swap` as the only primary repository and use Incremental Strangler Migration.
- Do not modify production files under `src/`, `monitor/`, or `contracts/` in this slice.
- Do not upgrade Next.js, React, TypeScript, ESLint, wagmi, viem, or RainbowKit.
- Characterization tests record legacy behavior; they do not correct it.
- All network/RPC behavior is mocked in unit tests.
- Monitor tests and smoke use a new empty temporary `DATA_DIR`, loopback-only URLs, dynamic ports, and empty real-execution credentials.
- The slice produces one commit, one PR, and one Gate; do not enter Slice 2.

---

### Task 1: Non-interactive lint and Vitest harness

**Files:**
- Create: `.eslintrc.cjs`
- Create: `.eslintignore`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json`
- Modify mechanically: `package-lock.json`

**Interfaces:**
- Consumes: current Next.js and TypeScript configuration.
- Produces: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:watch`, and `npm run smoke`.

- [ ] **Step 1: Record the missing-harness RED baseline**

Run:

```bash
CI=1 npm run lint
npm test
npm run typecheck
npm run smoke
```

Expected: lint requests interactive configuration; the other three commands report missing scripts.

- [ ] **Step 2: Add the exact lint baseline**

Create an ESLint 8 CommonJS config extending `next/core-web-vitals`. Keep `--max-warnings=0`, but baseline only the two known legacy debts without changing product files:

```js
module.exports = {
  root: true,
  extends: ["next/core-web-vitals"],
  overrides: [
    {
      files: ["src/app/docs/page.tsx", "src/app/preview/page.tsx"],
      rules: { "react/no-unescaped-entities": "off" },
    },
    {
      files: ["src/app/execute/page.tsx"],
      rules: { "react-hooks/exhaustive-deps": "off" },
    },
  ],
};
```

The lint script is:

```text
eslint . --ext .js,.mjs,.cjs,.ts,.tsx --max-warnings=0
```

- [ ] **Step 3: Add the Vitest harness and scripts**

Use a Node default environment and opt the wallet test into jsdom. Configure the alias explicitly:

```ts
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/test/**/*.test.{ts,tsx}"],
    clearMocks: true,
    restoreMocks: true,
    hookTimeout: 20_000,
    testTimeout: 15_000,
  },
});
```

Install exact dev dependencies without changing framework packages:

```bash
npm install --save-dev --save-exact \
  vitest@3.2.7 vite@6.4.3 jsdom@24.1.3 \
  @testing-library/react@14.3.1 \
  @testing-library/jest-dom@6.6.3
```

- [ ] **Step 4: Verify the harness GREEN state**

Run:

```bash
npm run lint
npm run typecheck
```

Expected: both exit zero without prompts, errors, or warnings.

### Task 2: Token and swap quote characterization

**Files:**
- Create: `src/test/characterization/tokens.test.ts`
- Create: `src/test/characterization/swap-quote-route.test.ts`

**Interfaces:**
- Consumes: `getChainTokens`, `resolveTokenAddress`, `getTokenDecimals`, and the existing swap quote `POST` handler.
- Produces: locked legacy fallback, quote, no-liquidity, and transaction response contracts.

- [ ] **Step 1: Characterize token registry behavior**

Tests assert the current contract without mutating exported records:

```ts
expect(getChainTokens()).toBe(CHAIN_TOKENS[1]);
expect(getChainTokens(8453)).toBe(CHAIN_TOKENS[1]);
expect(resolveTokenAddress("ETH", 42161)).toBe(CHAIN_TOKENS[42161].tokens.WETH);
expect(resolveTokenAddress("usdc", 1)).toBeUndefined();
expect(getTokenDecimals("UNKNOWN")).toBe(18);
```

- [ ] **Step 2: Characterize swap quote behavior with all egress mocked**

Partially mock `viem.createPublicClient` while retaining real amount formatting and calldata encoding. Tests cover:

```ts
expect(unsupported.status).toBe(400);
expect(priceQuote).toMatchObject({ source: "price", amountOut: "4000.000000" });
expect(noLiquidity).toEqual({ error: "No liquidity found for this pair" });
expect(executable).toMatchObject({
  amountOut: "1.9",
  chainId: 1,
  tx: { value: "1000000000000000000" },
});
```

Unmocked fetch is a failure. Tests never call a real RPC or price service.

- [ ] **Step 3: Run the focused tests**

Run:

```bash
npm test -- src/test/characterization/tokens.test.ts src/test/characterization/swap-quote-route.test.ts
```

Expected: all token and quote characterizations pass.

### Task 3: Wallet, monitor auth, and legacy health characterization

**Files:**
- Create: `src/test/characterization/wallet-button.test.tsx`
- Create: `src/test/helpers/legacy-monitor.ts`
- Create: `src/test/characterization/monitor-auth.test.ts`
- Create: `src/test/characterization/legacy-health-route.test.ts`

**Interfaces:**
- Consumes: WalletButton, `monitor/server.js`, and the existing cron health `GET` handler.
- Produces: isolated wallet UI, bearer-auth, public health, and upstream health contracts.

- [ ] **Step 1: Characterize WalletButton without real providers**

The jsdom test mocks RainbowKit's render prop and wagmi hooks. It verifies:

```ts
fireEvent.click(screen.getByTitle("Connect wallet"));
expect(openConnectModal).toHaveBeenCalledOnce();
expect(useBalance).toHaveBeenCalledWith(expect.objectContaining({ chainId: 1 }));
expect(screen.getByTitle(TEST_ADDRESS)).toHaveTextContent("AB");
```

- [ ] **Step 2: Build an isolated monitor fixture**

Expose:

```ts
startLegacyMonitor(options?: { apiKey?: string }): Promise<{
  baseUrl: string;
  logs: () => string;
  stop: () => Promise<void>;
}>;
```

The fixture uses an absolute server path, temporary cwd/data, dynamic port, bounded readiness, sanitized environment, and reliable process cleanup.

- [ ] **Step 3: Characterize monitor authentication**

Verify exact legacy behavior:

```ts
expect(await get("/health")).toMatchObject({ status: 200, body: { ok: true, orders: 0 } });
expect(await get("/swap-orders")).toMatchObject({ status: 401, body: { error: "Unauthorized" } });
expect(await get("/swap-orders", "Bearer slice1-test-key")).toMatchObject({
  status: 200,
  body: { orders: [] },
});
```

Start a second fixture without a key and assert `503 Server misconfigured`.

- [ ] **Step 4: Characterize the Next health route**

Reset modules between environment cases because the route captures env at import. Assert wrong cron auth is 401, missing monitor config is 500, and a mocked upstream 2xx becomes `{ok:true}`.

- [ ] **Step 5: Run all characterization tests**

Run:

```bash
npm test
```

Expected: all suites pass with zero real network access.

### Task 4: Production-build legacy smoke and CI

**Files:**
- Create: `scripts/smoke-legacy.mjs`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `.next` production build and monitor dependencies.
- Produces: `npm run smoke` and a PR/push CI Gate running all required commands.

- [ ] **Step 1: Verify smoke RED before the script exists**

Run:

```bash
npm run smoke
```

Expected: Node reports that `scripts/smoke-legacy.mjs` is missing.

- [ ] **Step 2: Implement the local-only smoke runner**

The script:

1. verifies `.next/BUILD_ID` exists;
2. creates an empty temporary monitor data directory;
3. selects two dynamic loopback ports;
4. starts monitor with test key and blank execution/notification credentials;
5. starts `next start` with local `MONITOR_URL` and test cron secret;
6. verifies HTTP 200 for `/`, `/execute`, authenticated API health, and monitor health;
7. verifies health JSON schemas and zero monitor orders;
8. terminates both children and deletes temporary data in `finally` and signal handlers.

- [ ] **Step 3: Add CI without modifying the scheduled operations workflow**

The new workflow uses `pull_request` and `push`, read-only permissions, Node 20, root and monitor `npm ci`, then runs exactly:

```yaml
- run: npm run lint
- run: npm run typecheck
- run: npm run test
- run: npm run build
- run: npm run smoke
```

- [ ] **Step 4: Verify smoke GREEN**

Run:

```bash
npm run build
npm run smoke
```

Expected: homepage, `/execute`, API health, and monitor health all report PASS; no child process remains.

### Task 5: Full Slice 1 Gate and focused commit

**Files:**
- Verify every file listed above.

**Interfaces:**
- Consumes: all Slice 1 safety-net work.
- Produces: one reviewable Slice 1 commit and no Slice 2 code.

- [ ] **Step 1: Run the required Gate in order**

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run smoke
```

Expected: every command exits zero.

- [ ] **Step 2: Verify scope**

```bash
git diff --check
git status --short
git diff --name-only 0b4039d
```

Expected: only lint/test/smoke/CI/plan/package files; no production source change.

- [ ] **Step 3: Request independent code review**

Review for real-network leakage, process cleanup, characterization accuracy, lint escapes, CI command order, and any Slice 2/domain code.

- [ ] **Step 4: Commit the single slice**

```bash
git add .eslintrc.cjs .eslintignore vitest.config.ts package.json package-lock.json \
  src/test scripts/smoke-legacy.mjs .github/workflows/ci.yml \
  docs/superpowers/plans/2026-07-12-zenfix-slice-1-safety-net.md
git commit -m "test: establish legacy safety net"
```

Expected: one focused commit on `codex/zenfix-payrun`; worktree clean; do not start Slice 2.
