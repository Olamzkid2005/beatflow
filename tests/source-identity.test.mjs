import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertDecodedSource, resolveTrackName } from '../lib/renderer/audio.ts';
test('a cached decode cannot be reused for another source with identical metadata', () => {
  const a = new File(['aaa'], 'beat.wav', { lastModified: 1 });
  const b = new File(['bbb'], 'beat.wav', { lastModified: 1 });
  assert.doesNotThrow(() => assertDecodedSource({ source: a }, a));
  assert.throws(() => assertDecodedSource({ source: a }, b), /different source/);
  assert.throws(() => assertDecodedSource({}, a), /different source/);
});
test('preview and export resolve empty and edited track titles identically', () => {
  assert.equal(resolveTrackName('  ', 'Midnight_Thoughts.mp3'), 'Midnight Thoughts');
  assert.equal(resolveTrackName(' Custom ', 'Other.mp3'), 'Custom');
});
