import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

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
    'sniptale-dependency-source-0.4.0.zip': 'source',
  };
  const provenance = `${JSON.stringify({
    schemaVersion: 3,
    dependencySource: { file: 'sniptale-dependency-source-0.4.0.zip', sha256: digest('source') },
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
  const verifyProof = vi.fn(() => ({ manifest: {}, zipFile: 'build/sniptale_0.4.0.zip' }));
  const verifySourceArchive = vi.fn(async () => ({
    file: 'sniptale-dependency-source-0.4.0.zip',
    sha256: digest('source'),
  }));
  return { assetRoot, commit, root, verifyProof, verifySourceArchive };
}

it('accepts only the exact proof-bound release asset and checksum inventory', async () => {
  const value = fixture();
  await expect(
    verifyPreparedReleaseAssets({ releaseRoot: value.root, ...value })
  ).resolves.toMatchObject({
    subjectNames: [
      'SHA256SUMS',
      'provenance.json',
      'sbom.cdx.json',
      'sniptale-dependency-source-0.4.0.zip',
      'sniptale_0.4.0-qa-evidence.zip',
      'sniptale_0.4.0.zip',
    ],
  });
  expect(value.verifyProof).toHaveBeenCalledWith(value.root, value.commit, {
    allowPreparedReleaseAssets: true,
  });
});

it('rejects extra, tampered, and proof-detached assets', async () => {
  const extra = fixture();
  writeFile(extra.assetRoot, 'extra.txt', 'unexpected');
  await expect(verifyPreparedReleaseAssets({ releaseRoot: extra.root, ...extra })).rejects.toThrow(
    'inventory'
  );

  const tampered = fixture();
  writeFile(tampered.assetRoot, 'sbom.cdx.json', 'changed');
  await expect(
    verifyPreparedReleaseAssets({ releaseRoot: tampered.root, ...tampered })
  ).rejects.toThrow('digest mismatch');

  const detached = fixture();
  writeFile(detached.root, 'proof-manifest.json', '{"changed":true}\n');
  await expect(
    verifyPreparedReleaseAssets({ releaseRoot: detached.root, ...detached })
  ).rejects.toThrow('does not bind');
});

it('rejects a source archive detached from the checked source inputs', async () => {
  const value = fixture();
  value.verifySourceArchive.mockResolvedValueOnce({
    file: 'sniptale-dependency-source-0.4.0.zip',
    sha256: digest('other-source'),
  });
  await expect(verifyPreparedReleaseAssets({ releaseRoot: value.root, ...value })).rejects.toThrow(
    'does not bind'
  );
});
