import styles from "./zenfix.module.css";

export function ZenfixEmptyState() {
  return (
    <main className={styles.emptyPage}>
      <section className={styles.emptyState}>
        <span className={styles.brandMark}>Z</span>
        <h1>No pilot session prepared.</h1>
        <p>Prepare one frozen canonical sandbox session locally, then reload this page.</p>
        <code>npm run pilot:prepare</code>
      </section>
    </main>
  );
}
