import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  adoptArtifact,
  canChangeArtifact,
  chooseFile,
  releaseArtifact,
} from "../lib/artifact-ownership.ts";
import {
  canNavigate,
  navigationBlockReason,
  registerNavigationGuard,
  resetNavigationGuards,
} from "../lib/navigation-guard.ts";

const video = () => new File([new Uint8Array([1, 2, 3])], "render.mp4", { type: "video/mp4" });

beforeEach(() => {
  resetNavigationGuards();
});

test("a manual file has no render identity", () => {
  const selection = chooseFile(video());
  assert.equal(selection.artifactId, null);
  assert.equal(chooseFile(null), null);
});

test("discarding a render clears only the matching upload selection", () => {
  const artifact = adoptArtifact(video(), "render-1");
  assert.equal(releaseArtifact(artifact, "render-1"), null, "the discarded render is released");
  assert.equal(
    releaseArtifact(artifact, "render-2"),
    artifact,
    "a different render must not clear the selection",
  );

  const manual = chooseFile(video());
  assert.equal(releaseArtifact(manual, "render-1"), manual, "manual files are never releaseable");
});

test("replacing a render replaces the selection identity", () => {
  assert.equal(releaseArtifact(adoptArtifact(video(), "render-1"), "render-1"), null);
  const second = adoptArtifact(video(), "render-2");
  assert.equal(second.artifactId, "render-2");
  assert.equal(
    releaseArtifact(second, "render-1"),
    second,
    "releasing the old render cannot clear the new one",
  );
});

test("artifact changes are blocked during an upload", () => {
  assert.equal(canChangeArtifact(false), true);
  assert.equal(canChangeArtifact(true), false);
});

test("navigation stays free without an active guard", () => {
  assert.equal(navigationBlockReason(), null);
  assert.equal(canNavigate(() => false), true, "no guard must not prompt");
});

test("an active guard blocks a declined navigation and allows a confirmed one", () => {
  let prompts = 0;
  const release = registerNavigationGuard(() => "A render is still running.");
  assert.equal(navigationBlockReason(), "A render is still running.");

  assert.equal(
    canNavigate((message) => {
      prompts += 1;
      assert.match(message, /render is still running/);
      return false;
    }),
    false,
  );
  assert.equal(prompts, 1);

  assert.equal(canNavigate(() => true), true);

  release();
  assert.equal(navigationBlockReason(), null, "unmount releases the guard");
});

test("the first active reason is reported, and releasing it reveals the next", () => {
  const releaseRender = registerNavigationGuard(() => "Render active");
  const releaseUpload = registerNavigationGuard(() => "Upload active");
  assert.equal(navigationBlockReason(), "Render active");
  releaseRender();
  assert.equal(navigationBlockReason(), "Upload active");
  releaseUpload();
  assert.equal(navigationBlockReason(), null);
});
