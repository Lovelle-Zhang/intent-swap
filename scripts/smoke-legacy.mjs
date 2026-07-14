import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const monitorServer = path.join(repositoryRoot, "monitor", "server.js");
const nextCli = path.join(
  repositoryRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const viteNodeCli = path.join(repositoryRoot, "node_modules", "vite-node", "vite-node.mjs");
const pilotPreparationCommand = path.join(repositoryRoot, "scripts", "prepare-pilot-validation.ts");
const children = [];
let runtimeDirectory;
let cleanupPromise;

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function reserveLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object", "Failed to reserve a port");
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

function sanitizedEnvironment(values) {
  return {
    NODE_ENV: values.NODE_ENV,
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? tmpdir(),
    LANG: process.env.LANG ?? "C.UTF-8",
    TMPDIR: process.env.TMPDIR ?? tmpdir(),
    CI: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    NO_PROXY: "127.0.0.1,localhost,::1",
    ...values,
  };
}

function startChild(label, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const capture = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-30_000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const managed = { child, label, logs: () => output };
  children.push(managed);
  return managed;
}

async function runChild(label, command, args, options) {
  const managed = startChild(label, command, args, options);
  const completed = await waitForExit(managed.child, 30_000);
  assert(completed, `${label} timed out.\n${managed.logs()}`);
  assert(managed.child.exitCode === 0, `${label} failed.\n${managed.logs()}`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    child.once("exit", onExit);
  });
}

async function stopChildren() {
  for (const { child } of [...children].reverse()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      if (!(await waitForExit(child, 2_000))) {
        child.kill("SIGKILL");
        await waitForExit(child, 2_000);
      }
    }
  }
}

function cleanup() {
  cleanupPromise ??= (async () => {
    await stopChildren();
    if (runtimeDirectory) {
      const directory = runtimeDirectory;
      runtimeDirectory = undefined;
      await rm(directory, { recursive: true, force: true });
    }
  })();
  return cleanupPromise;
}

for (const [signal, exitCode] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(signal, () => {
    void cleanup()
      .catch((error) => {
        console.error(`Cleanup after ${signal} failed`, error);
      })
      .finally(() => process.exit(exitCode));
  });
}

async function waitForHttp(url, managed, init = {}) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (
      managed.child.exitCode !== null ||
      managed.child.signalCode !== null
    ) {
      throw new Error(
        `${managed.label} exited before readiness.\n${managed.logs()}`,
      );
    }
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
        ...init,
      });
      if (response.ok) return response;
    } catch {
      // Readiness is condition-based; connection refusal is expected initially.
    }
    await delay(75);
  }
  throw new Error(`${managed.label} readiness timed out.\n${managed.logs()}`);
}

async function requireStatus(url, expectedStatus, init) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(5_000),
    ...init,
  });
  assert(
    response.status === expectedStatus,
    `${url} returned ${response.status}, expected ${expectedStatus}`,
  );
  return response;
}

async function main() {
  await access(path.join(repositoryRoot, ".next", "BUILD_ID"));

  try {
    runtimeDirectory = await mkdtemp(
      path.join(tmpdir(), "zenfix-legacy-smoke-"),
    );
    const monitorData = path.join(runtimeDirectory, "monitor-data");
    const pilotRepoRoot = path.join(runtimeDirectory, "pilot-repository");
    await mkdir(monitorData, { recursive: true });
    await mkdir(pilotRepoRoot, { recursive: true });
    await runChild(
      "Pilot Session preparation",
      process.execPath,
      [viteNodeCli, pilotPreparationCommand],
      {
        cwd: repositoryRoot,
        env: sanitizedEnvironment({ NODE_ENV: "test", ZENFIX_PILOT_REPO_ROOT: pilotRepoRoot }),
      },
    );
    const monitorPort = await reserveLoopbackPort();
    const appPort = await reserveLoopbackPort();
    const monitorKey = "slice1-smoke-monitor-key";
    const cronSecret = "slice1-smoke-cron-secret";

    const monitor = startChild(
      "legacy monitor",
      process.execPath,
      [monitorServer],
      {
        cwd: runtimeDirectory,
        env: sanitizedEnvironment({
          NODE_ENV: "test",
          PORT: String(monitorPort),
          DATA_DIR: monitorData,
          INTERNAL_API_KEY: monitorKey,
          KEEPER_PRIVATE_KEY: "",
          ARBITRUM_RPC_URL: "http://127.0.0.1:9",
          LINEA_RPC_URL: "http://127.0.0.1:9",
          SCT_KEY: "",
          RESEND_API_KEY: "",
          VAPID_PUBLIC: "",
          VAPID_PRIVATE: "",
        }),
      },
    );
    const monitorBase = `http://127.0.0.1:${monitorPort}`;
    await waitForHttp(`${monitorBase}/health`, monitor);

    const app = startChild(
      "Next production server",
      process.execPath,
      [
        nextCli,
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(appPort),
      ],
      {
        cwd: repositoryRoot,
        env: sanitizedEnvironment({
          NODE_ENV: "production",
          PORT: String(appPort),
          MONITOR_URL: `${monitorBase}/swap-orders`,
          INTERNAL_API_KEY: monitorKey,
          CRON_SECRET: cronSecret,
          RESEND_API_KEY: "",
          ZENFIX_PILOT_REPO_ROOT: pilotRepoRoot,
        }),
      },
    );
    const appBase = `http://127.0.0.1:${appPort}`;
    await waitForHttp(`${appBase}/`, app);

    const homepage = await requireStatus(`${appBase}/`, 200);
    const homepageHtml = await homepage.text();
    assert(homepageHtml.includes("Intent Swap"), "Homepage marker is missing");
    console.log("PASS homepage / (200)");

    const swapPage = await requireStatus(`${appBase}/execute`, 200);
    const swapPageHtml = await swapPage.text();
    assert(
      swapPageHtml.includes("static/chunks/app/execute/page-"),
      "Legacy swap page bundle marker is missing",
    );
    console.log("PASS legacy swap page /execute (200)");

    const pilotPage = await requireStatus(`${appBase}/pilot-validation`, 200);
    const pilotPageHtml = await pilotPage.text();
    assert(pilotPageHtml.includes("Pilot Validation Surface"), "Pilot page marker is missing");
    assert(pilotPageHtml.includes("SANDBOX / NO REAL FUNDS"), "Pilot Sandbox warning is missing");
    assert(pilotPageHtml.includes("Funding Mismatch"), "Pilot scenarios are incomplete");
    console.log("PASS pilot validation /pilot-validation (200, read-only Sandbox session)");

    const apiHealth = await requireStatus(
      `${appBase}/api/cron/health-check`,
      200,
      { headers: { Authorization: `Bearer ${cronSecret}` } },
    );
    const apiHealthBody = await apiHealth.json();
    assert(apiHealthBody.ok === true, "Legacy API health did not report ok=true");
    console.log("PASS legacy API health (200, ok=true)");

    const monitorHealth = await requireStatus(`${monitorBase}/health`, 200);
    const monitorHealthBody = await monitorHealth.json();
    assert(
      monitorHealthBody.ok === true && monitorHealthBody.orders === 0,
      "Monitor health did not report an empty healthy database",
    );
    console.log("PASS monitor health (200, ok=true, orders=0)");
  } catch (error) {
    for (const child of children) {
      console.error(`\n[${child.label} logs]\n${child.logs()}`);
    }
    throw error;
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
