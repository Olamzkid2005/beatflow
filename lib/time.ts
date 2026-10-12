/**
 * Timezone helpers. Deliberately dependency-free so both the browser form and
 * the server can use them.
 */

/** The browser's IANA timezone, e.g. `Africa/Lagos`. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Offset of `timeZone` from UTC, in minutes, at the given instant. */
function timeZoneOffsetMinutes(instantMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(new Date(instantMs));
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asIfUtc = Date.UTC(
    lookup("year"),
    lookup("month") - 1,
    lookup("day"),
    lookup("hour") % 24,
    lookup("minute"),
    lookup("second"),
  );

  return (asIfUtc - instantMs) / 60_000;
}

/**
 * Converts a `datetime-local` value ("2026-10-20T18:00") interpreted as
 * wall-clock time in `timeZone` into strict UTC ISO 8601 ("2026-10-20T17:00:00Z").
 */
export function toUtcIso8601(localValue: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localValue);
  if (!match) {
    throw new Error("Expected a datetime-local value, for example 2026-10-20T18:00.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = timeZoneOffsetMinutes(asUtc, timeZone);
  const instant = asUtc - offsetMinutes * 60_000;

  return new Date(instant).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Formats a `Date` as a `datetime-local` input value. */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
