import type { PilotScenarioView } from "@/features/payrun/pilot/session-contracts";
import { getLifecycleStages } from "@/features/payrun/presentation/pilot-session";

import styles from "./zenfix.module.css";

export function PayRunLifecycle({ scenario }: { readonly scenario: PilotScenarioView }) {
  return (
    <ol className={styles.lifecycle} aria-label="PayRun lifecycle">
      {getLifecycleStages(scenario).map((stage) => (
        <li data-stage-status={stage.status} key={stage.label}>
          <span className={styles.stageDot} aria-hidden="true" />
          <strong>{stage.label}</strong>
          <small>{stage.status === "not-applicable" ? "N/A" : stage.status}</small>
        </li>
      ))}
    </ol>
  );
}
