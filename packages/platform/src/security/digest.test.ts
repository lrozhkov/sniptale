import { afterEach, expect, it, vi } from 'vitest';

import { createSha256BytesDigest, createSha256Digest, isSha256Digest } from './digest';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('hashes binary bytes without a string conversion', async () => {
  await expect(createSha256BytesDigest(new Uint8Array([97, 98, 99]))).resolves.toBe(
    'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

it('creates versioned SHA-256 digests with a strict shape', async () => {
  const digest = await createSha256Digest('abc');

  expect(digest).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(isSha256Digest(digest)).toBe(true);
  expect(isSha256Digest('content-hash-1')).toBe(false);
});

it('uses UTF-8 input bytes for non-ASCII and multi-block values', async () => {
  await expect(createSha256Digest('Привет')).resolves.toBe(
    'sha256:dd679c0b9fd408a04148aa7d30c9df393f67b7227f65693fffe0ed6d0f0ade59'
  );
  await expect(createSha256Digest('a'.repeat(128))).resolves.toBe(
    'sha256:6836cf13bac400e9105071cd6af47084dfacad4e5e302c94bfed24e013afb73e'
  );
});

it('fails closed when Web Crypto SHA-256 is unavailable', async () => {
  vi.stubGlobal('crypto', {});

  await expect(createSha256Digest('abc')).rejects.toThrow(
    'Web Crypto SHA-256 digest is unavailable'
  );
});
