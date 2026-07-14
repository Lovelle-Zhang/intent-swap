import "server-only";

import { createServerPilotSessionReader } from "../pilot/session-reader.server";

export async function loadCurrentPilotSession() {
  return createServerPilotSessionReader().loadCurrentSession();
}
