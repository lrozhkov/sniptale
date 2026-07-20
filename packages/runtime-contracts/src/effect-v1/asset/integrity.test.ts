import { expect, it } from 'vitest';

import {
  assertEffectV1AssetSignature,
  decodeEffectV1EmbeddedAsset,
  sha256EffectV1Bytes,
} from './integrity';

it('decodes embedded SVG and base64 assets and hashes exact bytes', async () => {
  expect(new TextDecoder().decode(decodeEffectV1EmbeddedAsset({ svgText: '<svg/>' }))).toBe(
    '<svg/>'
  );
  expect(
    decodeEffectV1EmbeddedAsset({ dataUrl: 'data:application/octet-stream;base64,AQI=' })
  ).toEqual(new Uint8Array([1, 2]));
  expect(() => decodeEffectV1EmbeddedAsset({ dataUrl: 'data:text/plain,broken' })).toThrow(
    'base64 data URL'
  );
  await expect(sha256EffectV1Bytes(new Uint8Array([1, 2]))).resolves.toHaveLength(64);
});

it.each([
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/webp', [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]],
  ['image/svg+xml', ascii('<?xml version="1.0"?><svg viewBox="0 0 1 1">')],
  ['video/mp4', [0, 0, 0, 0, ...ascii('ftyp')]],
  ['video/webm', [0x1a, 0x45, 0xdf, 0xa3]],
  ['audio/ogg', ascii('OggS')],
  ['audio/wav', [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')]],
  ['audio/mpeg', ascii('ID3')],
] as const)('accepts an exact %s signature', (mimeType, bytes) => {
  expect(() =>
    assertEffectV1AssetSignature(Uint8Array.from(bytes), mimeType, 'asset')
  ).not.toThrow();
});

it('rejects mismatched, unsupported, and truncated asset signatures', () => {
  expect(() => assertEffectV1AssetSignature(new Uint8Array([1]), 'image/png', 'bad')).toThrow(
    'does not match'
  );
  expect(() => assertEffectV1AssetSignature(new Uint8Array([1]), 'unknown', 'bad')).toThrow(
    'does not match'
  );
  expect(() =>
    assertEffectV1AssetSignature(new TextEncoder().encode('<?xml'), 'image/svg+xml', 'bad')
  ).toThrow('does not match');
});

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}
