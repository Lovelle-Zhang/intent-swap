import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

export interface LegacyMonitorFixture {
  baseUrl: string;
  logs: () => string;
  stop: () => Promise<void>;
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise<boolean>((resolve) => {
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

async function waitForReady(
  url: string,
  child: ChildProcess,
  logs: () => string,
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Legacy monitor exited before readiness.\n${logs()}`);
    }
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {
      // Readiness is condition-based; connection refusal is expected initially.
    }
    await delay(50);
  }
  throw new Error(`Legacy monitor readiness timed out.\n${logs()}`);
}

export async function startLegacyMonitor(
  options: { apiKey?: string } = {},
): Promise<LegacyMonitorFixture> {
  const repositoryRoot = process.cwd();
  const serverPath = path.join(repositoryRoot, "monitor", "server.js");
  const runtimeDirectory = await mkdtemp(
    path.join(tmpdir(), "zenfix-monitor-test-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });
  const port = await reserveLoopbackPort();
  const apiKey =
    options.apiKey === undefined ? "slice1-monitor-key" : options.apiKey;

  const child = spawn(process.execPath, [serverPath], {
    cwd: runtimeDirectory,
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? runtimeDirectory,
      PORT: String(port),
      DATA_DIR: dataDirectory,
      INTERNAL_API_KEY: apiKey,
      KEEPER_PRIVATE_KEY: "",
      ARBITRUM_RPC_URL: "http://127.0.0.1:9",
      LINEA_RPC_URL: "http://127.0.0.1:9",
      SCT_KEY: "",
      RESEND_API_KEY: "",
      VAPID_PUBLIC: "",
      VAPID_PRIVATE: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  const capture = (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-20_000);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      if (!(await waitForExit(child, 2_000))) {
        child.kill("SIGKILL");
        await waitForExit(child, 2_000);
      }
    }
    await rm(runtimeDirectory, { recursive: true, force: true });
  };

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForReady(`${baseUrl}/health`, child, () => output);
  } catch (error) {
    await stop();
    throw error;
  }

  return { baseUrl, logs: () => output, stop };
}
