import styles from "./zenfix.module.css";

export function shortenIdentifier(value: string, edge = 7): string {
  if (value.length <= edge * 2 + 3) return value;
  return `${value.slice(0, edge)}...${value.slice(-edge)}`;
}

export function Identifier({ value }: { readonly value: string }) {
  return <code className={styles.identifier} title={value}>{shortenIdentifier(value)}</code>;
}
