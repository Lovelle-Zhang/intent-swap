import Link from "next/link";

import { CommandShell } from "@/components/zenfix/command-shell";
import { Identifier } from "@/components/zenfix/identifier";
import { StatusBadge } from "@/components/zenfix/status-badge";
import type { PilotSessionView } from "@/features/payrun/pilot/session-contracts";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";
import { filterPilotScenarios, getPrimaryStatus, SCENARIO_LABELS } from "@/features/payrun/presentation/pilot-session";

import styles from "./payruns.module.css";

export function PayRunsView({ session, filters }: { readonly session: PilotSessionView; readonly filters: { readonly status?: string; readonly scenario?: string } }) {
  const scenarios = filterPilotScenarios(session.scenarios, filters);
  return (
    <CommandShell active="payruns" session={session}>
      <header className={styles.hero}><div><p>AGENT ECONOMIC ACTIONS</p><h1>Pay Run Ledger</h1><span>Every decision, execution step, and proof—kept in one explainable record.</span></div><strong>{scenarios.length} of {session.scenarios.length} records</strong></header>
      <form className={styles.filters} action="/payruns" method="get">
        <label>Status<select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option><option value="completed">Completed</option><option value="pending_review">Needs Review</option><option value="blocked">Blocked</option></select></label>
        <label>Scenario<select name="scenario" defaultValue={filters.scenario ?? ""}><option value="">All scenarios</option>{Object.entries(SCENARIO_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        <button type="submit">Apply filters</button><Link href="/payruns">Clear</Link>
      </form>
      <div className={styles.tableWrap}>
        <table><thead><tr><th>PayRun / Scenario</th><th>Agent / Purpose</th><th>Merchant</th><th>Amount</th><th>Decision</th><th>Funding</th><th>Payment</th><th>Proof</th><th>Ledger</th><th>Created</th><th /></tr></thead>
          <tbody>{scenarios.map((scenario)=><tr key={scenario.payRunId}>
            <td><strong>{SCENARIO_LABELS[scenario.name]}</strong><Identifier value={scenario.payRunId} /></td>
            <td><Identifier value={scenario.agent.id} /><small>{scenario.purpose}</small></td><td>{scenario.explanation.merchant.payee}</td><td>{formatAtomicMoney(scenario.amount)}</td>
            <td><StatusBadge status={getPrimaryStatus(scenario)} /></td><td>{scenario.funding?.status ?? "Not created"}</td><td>{scenario.payment?.status ?? "Not created"}</td><td>{scenario.proof?.status ?? "Not created"}</td><td>{scenario.ledger?.balanced ? "Balanced" : "Not created"}</td><td><time dateTime={scenario.createdAt}>{new Date(scenario.createdAt).toLocaleString("en-GB",{timeZone:"UTC",dateStyle:"medium",timeStyle:"short"})} UTC</time></td>
            <td><Link href={`/payruns/${encodeURIComponent(scenario.payRunId)}`}>View details</Link></td>
          </tr>)}</tbody>
        </table>
        {scenarios.length===0?<p className={styles.noResults}>No PayRuns match these filters.</p>:null}
      </div>
    </CommandShell>
  );
}
