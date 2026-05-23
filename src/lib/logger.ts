const isDev = process.env.NODE_ENV !== "production";
const isDebug = process.env.NEXT_PUBLIC_DEBUG === "1" || process.env.DEBUG === "1";
const enabled = isDev || isDebug;

export const logger = {
  debug: (...args: unknown[]) => {
    if (enabled) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (enabled) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
