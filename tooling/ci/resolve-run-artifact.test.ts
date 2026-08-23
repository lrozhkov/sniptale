import { expect, it } from 'vitest';

import { selectLatestRunArtifact } from './resolve-run-artifact.mjs';

it('reuses the latest successful producer artifact across downstream run attempts', () => {
  const artifacts = [
    { name: 'release-provenance-abc-42-1', expired: false },
    { name: 'unrelated-42-9', expired: false },
    { name: 'release-provenance-abc-42-2', expired: true },
  ];
  expect(selectLatestRunArtifact(artifacts, 'release-provenance-abc-42-')).toBe(
    'release-provenance-abc-42-1'
  );
});

it('fails closed for missing and ambiguous producer attempts', () => {
  expect(() => selectLatestRunArtifact([], 'fast-proof-abc-42-')).toThrow('No live run artifact');
  const duplicate = [
    { name: 'fast-proof-abc-42-1', expired: false },
    { name: 'fast-proof-abc-42-1', expired: false },
  ];
  expect(() => selectLatestRunArtifact(duplicate, 'fast-proof-abc-42-')).toThrow('ambiguous');
});
