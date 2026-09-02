import { unstable_noStore } from "next/cache";

import { buildLivePilotSession } from "@/features/payrun/presentation/live-pilot-session.server";

import { CommandCenterView } from "./command-center-view";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  unstable_noStore();
  // A1: render a session executed LIVE by the control loop at request time,
  // not the committed pre-baked snapshot. Fail loud — if the kernel cannot
  // produce a session, surface the error rather than masking it.
  return <CommandCenterView session={await buildLivePilotSession()} />;
}
