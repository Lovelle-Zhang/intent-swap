import "server-only";

import { resolveCurrentPilotSession } from "../pilot/hosted-session";
import { createServerPilotSessionReader } from "../pilot/session-reader.server";

export async function loadCurrentPilotSession() {
  return resolveCurrentPilotSession({
    vercelEnvironment: process.env.VERCEL_ENV,
    localReader: createServerPilotSessionReader(),
  });
}
