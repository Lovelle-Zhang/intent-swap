import { redirect } from "next/navigation";

// /history merged into /activity in commit b…; legacy URL kept as a redirect.
export default function HistoryRedirect() {
  redirect("/activity?filter=swaps");
}
