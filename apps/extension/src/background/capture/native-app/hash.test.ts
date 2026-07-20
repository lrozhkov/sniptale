import { expect, it } from 'vitest';

import { NativeSha256, calculateSha256Hex, decodeNativeBase64Chunk } from './hash';

async function webCryptoSha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

it('hashes native transfer bytes incrementally', async () => {
  const hash = new NativeSha256();

  hash.update(new TextEncoder().encode('ab'));
  hash.update(new TextEncoder().encode('c'));

  await expect(calculateSha256Hex(new TextEncoder().encode('abc'))).resolves.toBe(hash.digestHex());
});

it('decodes native base64 chunks through the shared codec', () => {
  expect(decodeNativeBase64Chunk('AAH+/w==')).toEqual(new Uint8Array([0, 1, 254, 255]));
});

it('matches web crypto for empty, exact-block, and multi-block payloads', async () => {
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array(64).fill(7),
    new Uint8Array(129).map((_, index) => index),
  ]) {
    const hash = new NativeSha256();
    hash.update(bytes);

    expect(hash.digestHex()).toBe(await webCryptoSha256Hex(bytes));
  }
});

it('keeps chunked updates equivalent to a single payload update', async () => {
  const bytes = new Uint8Array(130).map((_, index) => index * 3);
  const chunked = new NativeSha256();
  const single = new NativeSha256();

  chunked.update(bytes.subarray(0, 7));
  chunked.update(bytes.subarray(7, 64));
  chunked.update(bytes.subarray(64));
  single.update(bytes);

  expect(chunked.digestHex()).toBe(single.digestHex());
});
