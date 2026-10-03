export interface SavedSeat {
  code: string;
  token: string;
  name: string;
  savedAt?: number;
}
const TAB_KEY = "maple-seat";
const HISTORY_KEY = "maple-seats";
function valid(value: unknown): value is SavedSeat {
  const seat = value as SavedSeat | null;
  return (
    !!seat &&
    typeof seat.code === "string" &&
    /^[A-Z2-9]{5}$/.test(seat.code) &&
    typeof seat.token === "string" &&
    /^[a-f0-9]{64}$/.test(seat.token) &&
    typeof seat.name === "string"
  );
}
function remembered(): SavedSeat[] {
  try {
    const seats: unknown = JSON.parse(
      localStorage.getItem(HISTORY_KEY) ?? "[]",
    );
    return Array.isArray(seats)
      ? seats
          .filter(valid)
          .filter((s) => Date.now() - (s.savedAt ?? 0) < 12 * 60 * 60 * 1000)
      : [];
  } catch {
    return [];
  }
}
export function recentSeat(code?: string) {
  return (
    (code ? remembered().find((s) => s.code === code) : remembered()[0]) ?? null
  );
}
export function readSeat(): SavedSeat | null {
  try {
    const seat: unknown = JSON.parse(sessionStorage.getItem(TAB_KEY) ?? "null");
    if (valid(seat)) return seat;
  } catch {
    /* A stale stored value is not a credential. */
  }
  // A new tab may be the second player. Offer remembered credentials explicitly
  // rather than automatically taking over the first player's connected seat.
  return null;
}
export function rememberSeat(seat: SavedSeat) {
  const updated = { ...seat, savedAt: Date.now() };
  sessionStorage.setItem(TAB_KEY, JSON.stringify(updated));
  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(
      [updated, ...remembered().filter((s) => s.code !== seat.code)].slice(
        0,
        10,
      ),
    ),
  );
  localStorage.setItem("maple-last-room", seat.code);
}
export function clearTabSeat() {
  sessionStorage.removeItem(TAB_KEY);
}
export function forgetSeat(code?: string) {
  clearTabSeat();
  if (code)
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(remembered().filter((s) => s.code !== code)),
    );
  if (localStorage.getItem("maple-last-room") === code)
    localStorage.removeItem("maple-last-room");
}
