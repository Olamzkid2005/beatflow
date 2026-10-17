/**
 * A very small ISO base media file format (MP4) reader.
 *
 * The probe uses it to check the rendered file's structure on its own terms, without ffprobe or
 * MediaInfo being installed. It answers the spec section 5 step 8 questions that do not need a full
 * decoder: where `moov` sits relative to `mdat`, whether any edit list (`elst`) was written, and
 * which sample entries and dimensions each track carries.
 */

import assert from "node:assert/strict";

/** Required M0 media checks; exploratory unsupported codec variants are allowed. */
export function assertProbeResults(probe, mp4) {
  const required = ["environment", "webcodecsVideo", "webcodecsAudio", "mediabunnyCapabilities", "renderMp4", "readBack", "chromePlayback"];
  for (const name of required) assert.equal(probe?.steps?.[name]?.ok, true, `${name}: ${probe?.steps?.[name]?.error ?? "missing or failed"}`);
  const { environment, webcodecsVideo, webcodecsAudio, mediabunnyCapabilities, renderMp4, readBack, chromePlayback } = probe.steps;
  assert.equal(environment.secureContext, true, "Secure context required");
  for (const encoded of [webcodecsVideo, webcodecsAudio]) {
    assert.equal(encoded.isConfigSupported, true, "Codec support check failed");
    assert(encoded.chunks > 0, "Real encode produced no chunks");
    assert.equal(encoded.encoderError, null, "Encoder callback reported failure");
  }
  assert.equal(mediabunnyCapabilities.videoVariants?.["pinned avc1.640028"]?.supported, true);
  assert.equal(mediabunnyCapabilities.canEncodeAudio, true);
  assert.equal(renderMp4.saved, true, "MP4 was not saved");
  assert.equal(renderMp4.outputState, "finalized");
  assert(mp4, "MP4 inspection missing");
  assert.equal(mp4.fileSize, renderMp4.bytes);
  assert.equal(mp4.moovBeforeMdat, true, "MP4 is not fast start");
  assert.equal(mp4.hasElst, false, "MP4 contains an edit list");
  assert(!mp4.topLevel.some((box) => box.type === "moof"), "Fragmented MP4 is not supported");
  const video = mp4.tracks.find((track) => track.handler === "vide");
  const audio = mp4.tracks.find((track) => track.handler === "soun");
  assert.equal(video?.codec, "avc1");
  assert.equal(video?.codedWidth, 1920);
  assert.equal(video?.codedHeight, 1080);
  assert.equal(video?.sampleCount, 5);
  assert.equal(audio?.codec, "mp4a");
  assert.equal(audio?.sampleRate, 48000);
  assert.equal(audio?.channels, 2);
  assert(Math.abs(video.mediaSeconds - 5) <= 0.1, "Video duration mismatch");
  assert(Math.abs(audio.mediaSeconds - 5) <= 0.1, "Audio duration mismatch");
  assert.equal(readBack.decodedFrames, 5);
  assert(readBack.decodedAudioBuffers > 0, "No audio decoded");
  assert(Math.abs(readBack.duration - 5) <= 0.1, "Decoded duration mismatch");
  assert.equal(chromePlayback.error, null);
  assert(chromePlayback.playedTo > 0, "Chrome playback did not advance");
  assert(Math.abs(chromePlayback.seekedTo - 4) < 0.25, "Chrome seeking failed");
  assert.equal(chromePlayback.videoWidth, 1920);
  assert.equal(chromePlayback.videoHeight, 1080);
}

const CONTAINER_BOXES = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "edts",
  "dinf",
  "udta",
  "mvex",
  "moof",
  "traf",
  "mfra",
]);

/** Walks every box in [start, end), recursing into known containers. */
export function readBoxes(buffer, start = 0, end = buffer.length, path = [], out = []) {
  let offset = start;

  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > end) break;
      size = Number(buffer.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) break;

    const node = { type, start: offset, size, headerSize, path: [...path, type] };
    out.push(node);

    if (CONTAINER_BOXES.has(type)) {
      readBoxes(buffer, offset + headerSize, offset + size, node.path, out);
    }

    offset += size;
  }

  return out;
}

const payload = (box) => box.start + box.headerSize;

function find(boxes, path) {
  const wanted = path.join("/");
  return boxes.find((box) => box.path.join("/") === wanted) ?? null;
}

/** Version and flags, used to pick between the 32-bit and 64-bit field layouts. */
function versionOf(buffer, box) {
  return buffer.readUInt8(payload(box));
}

function readMvhd(buffer, box) {
  const at = payload(box);
  const version = versionOf(buffer, box);
  const timescale = buffer.readUInt32BE(at + (version === 1 ? 20 : 12));
  const duration = version === 1 ? Number(buffer.readBigUInt64BE(at + 24)) : buffer.readUInt32BE(at + 16);
  return { timescale, duration, seconds: timescale ? duration / timescale : null };
}

function readMdhd(buffer, box) {
  const at = payload(box);
  const version = versionOf(buffer, box);
  const timescale = buffer.readUInt32BE(at + (version === 1 ? 20 : 12));
  const duration = version === 1 ? Number(buffer.readBigUInt64BE(at + 24)) : buffer.readUInt32BE(at + 16);
  return { timescale, duration, seconds: timescale ? duration / timescale : null };
}

function readTkhd(buffer, box) {
  const at = payload(box);
  const version = versionOf(buffer, box);
  const widthOffset = at + (version === 1 ? 88 : 76);
  if (widthOffset + 8 > box.start + box.size) return { width: null, height: null };
  return {
    width: buffer.readUInt32BE(widthOffset) / 65536,
    height: buffer.readUInt32BE(widthOffset + 4) / 65536,
  };
}

function readHandler(buffer, box) {
  return buffer.toString("latin1", payload(box) + 8, payload(box) + 12);
}

/** Sample count from `stts`, which is what a decoder uses to walk the track. */
function readSttsSampleCount(buffer, box) {
  const at = payload(box);
  const entryCount = buffer.readUInt32BE(at + 4);
  let samples = 0;
  for (let i = 0; i < entryCount; i += 1) {
    samples += buffer.readUInt32BE(at + 8 + i * 8);
  }
  return samples;
}

/** First sample entry of an `stsd` box: its four-byte codec tag plus audio/video specifics. */
function readSampleEntry(buffer, box) {
  const at = payload(box);
  const entryStart = at + 8;
  if (entryStart + 8 > box.start + box.size) return null;

  const fourcc = buffer.toString("latin1", entryStart + 4, entryStart + 8);
  const body = entryStart + 8;
  const isVisual = /^(avc1|avc3|hvc1|hev1|vp09|av01|mp4v)$/.test(fourcc);
  const isAudio = /^(mp4a|Opus|opus|ac-3|ec-3)$/.test(fourcc);

  return {
    fourcc,
    ...(isVisual
      ? {
          width: buffer.readUInt16BE(body + 24),
          height: buffer.readUInt16BE(body + 26),
        }
      : {}),
    ...(isAudio
      ? {
          channels: buffer.readUInt16BE(body + 16),
          sampleRate: buffer.readUInt32BE(body + 24) / 65536,
        }
      : {}),
  };
}

/** Summarises one rendered MP4 well enough to validate the spec's output requirements. */
export function inspectMp4(buffer) {
  const boxes = readBoxes(buffer);
  const topLevel = boxes.filter((box) => box.path.length === 1);
  const moov = find(boxes, ["moov"]);
  const mdat = topLevel.find((box) => box.type === "mdat") ?? null;
  const mvhd = find(boxes, ["moov", "mvhd"]);
  const edts = boxes.filter((box) => box.type === "edts");
  const elst = boxes.filter((box) => box.type === "elst");

  // Match each `moov/trak` to its own children by byte range, so track order does not matter.
  const trackNodes = boxes.filter((box) => box.path.length === 2 && box.path[1] === "trak");
  const trackSummaries = trackNodes.map((trackBox) => {
    const inTrack = (path) =>
      boxes.find(
        (box) =>
          box.start >= trackBox.start &&
          box.start < trackBox.start + trackBox.size &&
          box.path.slice(2).join("/") === path,
      ) ?? null;

    const stsd = inTrack("mdia/minf/stbl/stsd");
    const entry = stsd ? readSampleEntry(buffer, stsd) : null;
    const tkhd = inTrack("tkhd");
    const mdhd = inTrack("mdia/mdhd");
    const stts = inTrack("mdia/minf/stbl/stts");
    const hdlr = inTrack("mdia/hdlr");

    return {
      handler: hdlr ? readHandler(buffer, hdlr) : null,
      codec: entry?.fourcc ?? null,
      codedWidth: entry?.width ?? null,
      codedHeight: entry?.height ?? null,
      displayWidth: tkhd ? readTkhd(buffer, tkhd).width : null,
      displayHeight: tkhd ? readTkhd(buffer, tkhd).height : null,
      sampleRate: entry?.sampleRate ?? null,
      channels: entry?.channels ?? null,
      mediaTimescale: mdhd ? readMdhd(buffer, mdhd).timescale : null,
      mediaSeconds: mdhd ? readMdhd(buffer, mdhd).seconds : null,
      sampleCount: stts ? readSttsSampleCount(buffer, stts) : null,
    };
  });

  return {
    fileSize: buffer.length,
    topLevel: topLevel.map((box) => ({ type: box.type, offset: box.start, size: box.size })),
    moovOffset: moov ? moov.start : null,
    mdatOffset: mdat ? mdat.start : null,
    moovBeforeMdat: Boolean(moov && mdat && moov.start < mdat.start),
    hasEdts: edts.length > 0,
    hasElst: elst.length > 0,
    movie: mvhd ? readMvhd(buffer, mvhd) : null,
    tracks: trackSummaries,
  };
}
