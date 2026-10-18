import assert from "node:assert/strict";
import { test } from "node:test";
import { nextScheduleValue, toDateTimeLocalValue, toUtcIso8601 } from "../lib/time.ts";

test("converts Lagos, fractional offsets, and valid times after DST transitions", () => {
  assert.equal(toUtcIso8601("2026-10-20T18:00", "Africa/Lagos"), "2026-10-20T17:00:00Z");
  assert.equal(toUtcIso8601("2026-10-20T18:00", "Asia/Kathmandu"), "2026-10-20T12:15:00Z");
  assert.equal(toUtcIso8601("2026-03-08T03:30", "America/New_York"), "2026-03-08T07:30:00Z");
});

test("rejects nonexistent and ambiguous DST times rather than guessing", () => {
  assert.throws(() => toUtcIso8601("2026-03-08T02:30", "America/New_York"), /does not exist/);
  assert.throws(() => toUtcIso8601("2026-11-01T01:30", "America/New_York"), /ambiguous/);
});

test("the default schedule is wall time in the saved zone, then round-trips", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  assert.equal(toDateTimeLocalValue(now, "Asia/Tokyo"), "2026-10-18T21:00");
  assert.equal(toDateTimeLocalValue(now, "America/New_York"), "2026-10-18T08:00");

  const tokyo = nextScheduleValue(now, "Asia/Tokyo");
  assert.equal(tokyo, "2026-10-18T21:10");
  assert.equal(toUtcIso8601(tokyo, "Asia/Tokyo"), "2026-10-18T12:10:00Z");
  assert.equal(nextScheduleValue(now, "America/New_York"), "2026-10-18T08:10");
});

test("zone formatting crosses date and DST boundaries", () => {
  assert.equal(
    toDateTimeLocalValue(new Date("2026-10-18T23:30:00Z"), "Asia/Tokyo"),
    "2026-10-19T08:30",
  );
  assert.equal(
    toDateTimeLocalValue(new Date("2026-10-18T23:30:00Z"), "America/New_York"),
    "2026-10-18T19:30",
  );
  // 01:50 EST + 10 minutes lands on the first valid minute after the spring jump.
  assert.equal(nextScheduleValue(new Date("2026-03-08T06:50:00Z"), "America/New_York"), "2026-03-08T03:00");
  assert.equal(toUtcIso8601("2026-03-08T03:00", "America/New_York"), "2026-03-08T07:00:00Z");
});

test("rejects normalized calendar dates, invalid clocks, and trailing characters", () => {
  for (const value of ["2028-02-31T10:00", "2026-13-01T10:00", "2026-10-20T24:00", "2026-10-20T18:61", "2026-10-20T18:00junk"]) {
    assert.throws(() => toUtcIso8601(value, "UTC"), undefined, value);
  }
  assert.equal(toUtcIso8601("2028-02-29T10:00", "UTC"), "2028-02-29T10:00:00Z");
});
