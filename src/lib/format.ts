// Dates render on the server (UTC on Vercel), so format explicitly in your zone.
const TZ = process.env.APP_TIMEZONE || "UTC";

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "2-digit" });
const full = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatWhen(d: Date) {
  const now = new Date();
  if (dayKey.format(d) === dayKey.format(now)) return time.format(d);
  if (dayKey.format(d).slice(0, 4) === dayKey.format(now).slice(0, 4)) return dayMonth.format(d);
  return dayMonthYear.format(d);
}

export function formatFull(d: Date) {
  return full.format(d);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const DISPLAY_TZ = TZ;

export function rate(n: number, d: number) {
  return d ? `${Math.round((n / d) * 1000) / 10}%` : "—";
}
