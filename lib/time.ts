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
    hourCycle: "h23",
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
 * Rejects nonexistent or ambiguous wall times instead of silently choosing a DST offset.
 */
export function toUtcIso8601(localValue: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) {
    throw new Error("Expected a datetime-local value, for example 2026-10-20T18:00.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  // ISO parsing avoids Date.UTC's special handling of years 00–99. The round
  // trip rejects invalid month/day/clock components rather than normalizing.
  const asUtc = Date.parse(`${localValue}:00Z`);
  if (!Number.isFinite(asUtc) || new Date(asUtc).toISOString().slice(0, 16) !== localValue || year < 1 || month < 1 || day < 1 || hour > 23 || minute > 59) {
    throw new Error("The schedule is not a valid calendar date and time.");
  }

  // Offsets on either side of the local date cover DST changes, including
  // fractional-hour transitions and date-line changes. Round-trip candidates
  // through the zone to distinguish valid, skipped and repeated wall times.
  const dayMs = 86_400_000;
  const offsets = new Set([-2, -1, 0, 1, 2].map((days) => timeZoneOffsetMinutes(asUtc + days * dayMs, timeZone)));
  const candidates = [...offsets]
    .map((offset) => asUtc - offset * 60_000)
    .filter((instant) => instant + timeZoneOffsetMinutes(instant, timeZone) * 60_000 === asUtc);
  if (candidates.length === 0) throw new Error("This local time does not exist because the clocks change. Choose another time.");
  if (candidates.length > 1) throw new Error("This local time is ambiguous because the clocks change. Choose another time.");
  return new Date(candidates[0]).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Formats a `Date` as a `datetime-local` input value. Pass `timeZone` whenever
 * the value will be submitted for that zone; the browser's own getters would
 * print a different wall time and shift the intended instant.
 */
export function toDateTimeLocalValue(date: Date, timeZone?: string): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  if (!timeZone) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours(),
    )}:${pad(date.getMinutes())}`;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** Default publish slot, expressed as wall time in the working zone. */
export function nextScheduleValue(now: Date, timeZone: string, leadMs = 10 * 60_000): string {
  return toDateTimeLocalValue(new Date(now.getTime() + leadMs), timeZone);
}
