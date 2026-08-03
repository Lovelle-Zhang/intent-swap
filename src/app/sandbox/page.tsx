"use client";

import { useState } from "react";

const SCENARIOS = [
  { id: "allowed", label: "Allowed" },
  { id: "needs_review", label: "Needs Review" },
  { id: "blocked", label: "Blocked" },
  { id: "funding_mismatch", label: "Funding Mismatch" },
] as const;

interface RunResult {
  readonly runId: string;
  readonly scenarioId: string;
  readonly startedAt: string;
  readonly controlLoopDurationMs: number;
  readonly storePath: string;
  readonly payRunId: string;
  readonly status: string;
  readonly policyOutcome: string | null;
  readonly reasonCodes: readonly string[];
  readonly transitions: readonly string[];
  readonly warning: string;
}

export default function SandboxPage() {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(scenarioId: string) {
    setRunning(scenarioId);
    setError(null);
    try {
      const response = await fetch("/api/sandbox-payrun", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      setResult(body as RunResult);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setRunning(null);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "6vh 24px", fontFamily: "system-ui" }}>
      <p style={{ color: "#f59e0b", fontSize: 12, letterSpacing: "0.15em", margin: 0 }}>
        SANDBOX / NO REAL FUNDS
      </p>
      <h1 style={{ fontWeight: 400, marginTop: 8 }}>ZenFix PayRun — live control loop</h1>
      <p style={{ color: "#78716c", fontSize: 14, marginTop: 0 }}>
        Pick a scenario. Each click runs the real control loop on the server, writes a fresh
        store to disk, and returns the actual PayRun state machine — no pre-baked snapshot.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            onClick={() => run(scenario.id)}
            disabled={running !== null}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #57534e",
              background: running === scenario.id ? "#292524" : "#1c1917",
              color: "#e7e5e4",
              cursor: running !== null ? "not-allowed" : "pointer",
            }}
          >
            {running === scenario.id ? "Running…" : scenario.label}
          </button>
        ))}
      </div>

      {error && (
        <p style={{ color: "#f87171", marginTop: 20 }}>Error: {error}</p>
      )}

      {result && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontWeight: 500, fontSize: 16 }}>
            {result.scenarioId} → <code>{result.status}</code>
          </h2>
          <dl style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 6, fontSize: 13 }}>
            <dt style={{ color: "#78716c" }}>Run ID</dt>
            <dd style={{ margin: 0 }}><code>{result.runId}</code></dd>
            <dt style={{ color: "#78716c" }}>Server timestamp</dt>
            <dd style={{ margin: 0 }}><code>{result.startedAt}</code></dd>
            <dt style={{ color: "#78716c" }}>Control-loop time</dt>
            <dd style={{ margin: 0 }}><code>{result.controlLoopDurationMs} ms</code></dd>
            <dt style={{ color: "#78716c" }}>Store path (on disk)</dt>
            <dd style={{ margin: 0 }}><code>{result.storePath}</code></dd>
            <dt style={{ color: "#78716c" }}>Policy outcome</dt>
            <dd style={{ margin: 0 }}>
              <code>{result.policyOutcome ?? "—"}</code>
              {result.reasonCodes.length > 0 && ` (${result.reasonCodes.join(", ")})`}
            </dd>
          </dl>

          <h3 style={{ fontWeight: 500, fontSize: 14, marginTop: 20 }}>
            State machine transitions ({result.transitions.length})
          </h3>
          <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
            {result.transitions.map((status, index) => (
              <li
                key={`${status}-${index}`}
                style={{ display: "flex", gap: 10, padding: "4px 0", fontSize: 13, alignItems: "center" }}
              >
                <span style={{ color: "#57534e", width: 24, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {index + 1}
                </span>
                <span style={{ color: "#57534e" }}>→</span>
                <code style={{ color: "#e7e5e4" }}>{status}</code>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
