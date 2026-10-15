import { expect, it } from 'vitest';
import type { AssetRef } from '../assets/contracts';
import { admitsLibrarySourceRef, sameLibrarySourceRef } from './library-source-ref';
const ref: AssetRef = {
  assetId: 'a',
  size: 4,
  mimeType: 'video/webm',
  sha256: 'hash',
  createdAt: 1,
  location: { kind: 'opfs', objectKey: 'key' },
};
it('admits only consistent immutable object and optional library metadata', () => {
  const media = { size: 4, mimeType: 'video/webm' };
  expect(admitsLibrarySourceRef(ref, 'a', media, null)).toBe(true);
  expect(admitsLibrarySourceRef(ref, 'a', media, media)).toBe(true);
  expect(admitsLibrarySourceRef(null, 'a', media, null)).toBe(false);
  expect(admitsLibrarySourceRef(ref, 'b', media, null)).toBe(false);
  expect(admitsLibrarySourceRef(ref, 'a', { ...media, size: 5 }, null)).toBe(false);
  expect(admitsLibrarySourceRef(ref, 'a', { ...media, mimeType: 'audio/webm' }, null)).toBe(false);
  expect(admitsLibrarySourceRef(ref, 'a', media, { ...media, size: 5 })).toBe(false);
  expect(admitsLibrarySourceRef(ref, 'a', media, { ...media, mimeType: 'audio/webm' })).toBe(false);
});
it('rejects changes to every supported immutable identity field', () => {
  expect(sameLibrarySourceRef(ref, { ...ref, location: { ...ref.location } })).toBe(true);
  for (const changed of [
    { ...ref, assetId: 'b' },
    { ...ref, size: 5 },
    { ...ref, mimeType: 'audio/webm' },
    { ...ref, sha256: null },
    { ...ref, createdAt: 2 },
    { ...ref, location: { ...ref.location, objectKey: 'other' } },
  ]) {
    expect(sameLibrarySourceRef(ref, changed)).toBe(false);
  }
});
