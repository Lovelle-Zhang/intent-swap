// Client-side "archive" of orders. The order still lives on the monitor
// server until the 7-day auto-cleanup; this is purely a visual dismissal
// stored per-browser in localStorage. Pending orders go through real
// server-side cancel (DELETE /api/orders/:id); only triggered orders
// should use archive.

const KEY = "intent-swap-archived-orders";

export function getArchivedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function archive(id: string) {
  const set = getArchivedIds();
  set.add(id);
  localStorage.setItem(KEY, JSON.stringify([...set]));
}

export function unarchive(id: string) {
  const set = getArchivedIds();
  set.delete(id);
  localStorage.setItem(KEY, JSON.stringify([...set]));
}

export function clearArchived() {
  localStorage.removeItem(KEY);
}
