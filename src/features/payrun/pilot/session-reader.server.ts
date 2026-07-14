import "server-only";

import { createPilotSessionReader } from "./session-reader";

export function createServerPilotSessionReader() {
  return createPilotSessionReader({
    repoRoot: process.env.ZENFIX_PILOT_REPO_ROOT ?? process.cwd(),
  });
}
