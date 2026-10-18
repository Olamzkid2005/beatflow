import assert from "node:assert/strict";
import { test } from "node:test";
import { videoMetadataSchema, buildVideoResource } from "../lib/youtube/metadata.ts";
const base = { title: "Track", privacyStatus: "private" };

test("counts comma and quoted multiword-tag overhead toward 500 characters", () => {
  assert.equal(videoMetadataSchema.safeParse({ ...base, tags: Array(100).fill("a b c") }).success, false);
  assert.equal(videoMetadataSchema.safeParse({ ...base, tags: ["x".repeat(499)] }).success, true);
  assert.equal(videoMetadataSchema.safeParse({ ...base, tags: ["x".repeat(499), "y"] }).success, false);
});

test("immediate public and unlisted choices reach the video resource unchanged", () => {
  for (const privacyStatus of ["public", "unlisted"]) {
    const metadata = videoMetadataSchema.parse({ title: "Track", privacyStatus });
    const resource = buildVideoResource(metadata);
    assert.equal(resource.status.privacyStatus, privacyStatus);
    assert.equal("publishAt" in resource.status, false);
  }
});

test("rejects angle brackets in descriptions and enforces UTF-8 bytes", () => {
  assert.equal(videoMetadataSchema.safeParse({ ...base, description: "<invalid>" }).success, false);
  assert.equal(videoMetadataSchema.safeParse({ ...base, description: "é".repeat(2501) }).success, false);
  assert.equal(videoMetadataSchema.safeParse({ ...base, description: "é".repeat(2500) }).success, true);
});

test("rejects impossible dates, past dates, empty schedules, and public scheduled uploads", () => {
  for (const publishAt of ["2028-02-31T10:00:00Z", "2020-01-01T00:00:00Z", "", "2028-01-01T10:00:00.000Z"]) {
    assert.equal(videoMetadataSchema.safeParse({ ...base, publishAt }).success, false, publishAt);
  }
  assert.equal(videoMetadataSchema.safeParse({ ...base, privacyStatus: "public", publishAt: "2028-01-01T10:00:00Z" }).success, false);
  const metadata = videoMetadataSchema.parse({ ...base, publishAt: "2028-02-29T10:00:00Z" });
  const resource = buildVideoResource(metadata);
  assert.equal(resource.status.publishAt, metadata.publishAt);
  assert.equal(resource.status.privacyStatus, "private");
  assert.equal(resource.snippet.categoryId, "10");
});
