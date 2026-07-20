import { expect, it } from 'vitest';
import { parseWebSnapshotManifestJson } from './manifest';

it('parses web snapshot manifest JSON as an unknown boundary value', () => {
  expect(parseWebSnapshotManifestJson('{"schemaVersion":1}')).toEqual({ schemaVersion: 1 });
});

it('throws a stable package manifest error for malformed JSON', () => {
  expect(() => parseWebSnapshotManifestJson('{')).toThrow(
    'Web snapshot package manifest is invalid.'
  );
});
