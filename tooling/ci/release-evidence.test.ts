import path from 'node:path';
import { expect, it } from 'vitest';

import { collectProofEvidenceSources } from './release-evidence.mjs';

it('projects the exact admitted proof inventory except independently published assets', () => {
  const root = '/proof';
  const files = [
    { file: 'build/sniptale.zip', sha256: 'a'.repeat(64) },
    { file: '.tmp/licenses/sbom.cdx.json', sha256: 'b'.repeat(64) },
    { file: '.tmp/qa/build-proof.json', sha256: 'c'.repeat(64) },
    { file: '.tmp/qa-observability/runs/run.json', sha256: 'd'.repeat(64) },
    { file: '.tmp/qa-logs/run.log', sha256: 'e'.repeat(64) },
    { file: '.tmp/osv/results.json', sha256: 'f'.repeat(64) },
  ];
  const sources = collectProofEvidenceSources(
    root,
    { files },
    {
      excludedFiles: ['build/sniptale.zip', '.tmp/licenses/sbom.cdx.json'],
    }
  );
  expect(sources.map(([name]) => name)).toEqual([
    'proof/release-proof-manifest.json',
    'proof/SHA256SUMS',
    'proof-files/.tmp/qa/build-proof.json',
    'proof-files/.tmp/qa-observability/runs/run.json',
    'proof-files/.tmp/qa-logs/run.log',
    'proof-files/.tmp/osv/results.json',
  ]);
  expect(sources.at(-1)?.[1]).toBe(path.join(root, '.tmp/osv/results.json'));
});
