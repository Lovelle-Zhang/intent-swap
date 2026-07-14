import type { PrimaryStatus } from "@/features/payrun/presentation/pilot-session";

import styles from "./zenfix.module.css";

export function StatusBadge({ status }: { readonly status: PrimaryStatus }) {
  return <span className={styles.statusBadge} data-status={status.toLowerCase().replace(" ", "-")}>{status}</span>;
}
