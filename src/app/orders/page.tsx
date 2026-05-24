import { redirect } from "next/navigation";

// /orders merged into /activity; legacy URL kept as a redirect.
export default function OrdersRedirect() {
  redirect("/activity?filter=orders");
}
