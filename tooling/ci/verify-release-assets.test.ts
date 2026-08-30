import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/test-support/test-helpers';
import { verifyPreparedReleaseAssets } from './verify-release-assets.mjs';

function digest(bytes: string) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fixture() {
  const root = createTempRoot('release-assets-');
  const commit = 'a'.repeat(40);
  const assetRoot = path.join(root, 'release-assets');
  fs.mkdirSync(assetRoot);
  writeFile(root, 'proof-manifest.json', '{"proof":true}\n');
  const subjects: Record<string, string> = {
    'sniptale_0.4.0.zip': 'extension',
    'sniptale_0.4.0-qa-evidence.zip': 'evidence',
    'sbom.cdx.json': 'sbom',
  };
  const provenance = `${JSON.stringify({
    schemaVersion: 2,
    artifactKind: 'sniptale-release-provenance',
    commit,
    releaseProofSha256: digest('{"proof":true}\n'),
    qaEvidence: {
      file: 'sniptale_0.4.0-qa-evidence.zip',
      sha256: digest('evidence'),
    },
  })}\n`;
  subjects['provenance.json'] = provenance;
  for (const [name, bytes] of Object.entries(subjects)) writeFile(assetRoot, name, bytes);
  writeFile(
    assetRoot,
    'SHA256SUMS',
    `${Object.entries(subjects)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, bytes]) => `${digest(bytes)}  ${name}`)
      .join('\n')}\n`
  );
  const verifyProof = () => ({ manifest: {}, zipFile: 'build/sniptale_0.4.0.zip' });
  return { assetRoot, commit, root, verifyProof };
}

it('accepts only the exact proof-bound release asset and checksum inventory', () => {
  const value = fixture();
  expect(verifyPreparedReleaseAssets({ releaseRoot: value.root, ...value })).toMatchObject({
    subjectNames: [
      'SHA256SUMS',
      'provenance.json',
      'sbom.cdx.json',
      'sniptale_0.4.0-qa-evidence.zip',
      'sniptale_0.4.0.zip',
    ],
  });
});

it('rejects extra, tampered, and proof-detached assets', () => {
  const extra = fixture();
  writeFile(extra.assetRoot, 'extra.txt', 'unexpected');
  expect(() => verifyPreparedReleaseAssets({ releaseRoot: extra.root, ...extra })).toThrow(
    'inventory'
  );

  const tampered = fixture();
  writeFile(tampered.assetRoot, 'sbom.cdx.json', 'changed');
  expect(() => verifyPreparedReleaseAssets({ releaseRoot: tampered.root, ...tampered })).toThrow(
    'digest mismatch'
  );

  const detached = fixture();
  writeFile(detached.root, 'proof-manifest.json', '{"changed":true}\n');
  expect(() => verifyPreparedReleaseAssets({ releaseRoot: detached.root, ...detached })).toThrow(
    'does not bind'
  );
});
