import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import {
  REQUIRED_RELEASE_LEGAL_PATHS,
  sha256,
} from '../../../../release/policy/oss-release-policy.mjs';
import { validateLegalFiles } from './policy.mjs';

it('includes exactly the declared modified-source closure in both canonical legal inventories', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'modified-legal-inventory-'));
  const manifestPath = 'THIRD_PARTY_DEPENDENCIES.json';
  const license = 'LICENSES/dependencies/example.txt';
  const source = 'LICENSES/dependencies/example-modified/source.patch';
  const manifest = JSON.stringify({
    schemaVersion: 1,
    entries: [
      {
        archivePath: license,
        modifiedSource: { files: [{ archivePath: source, sha256: sha256('source') }] },
      },
    ],
  });
  const files = [...REQUIRED_RELEASE_LEGAL_PATHS, manifestPath, license, source].map((file) => {
    const bytes = file === manifestPath ? manifest : file === source ? 'source' : 'fixture';
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), bytes);
    return { source: file, archivePath: file, sha256: sha256(bytes) };
  });
  const policy = { dependencyLegal: { manifestPath }, legalFiles: files };
  // Canonical license-byte checks are separate; this proof isolates exact inventory membership.
  const inventory = (value: typeof policy) =>
    validateLegalFiles(root, value).filter((error: string) =>
      error.includes('complete canonical file set')
    );
  try {
    expect(inventory(policy)).toEqual([]);
    expect(
      inventory({ ...policy, legalFiles: files.filter((file) => file.archivePath !== source) })
    ).toHaveLength(2);
    expect(
      inventory({
        ...policy,
        legalFiles: [
          ...files,
          { source: 'unexpected', archivePath: 'unexpected', sha256: sha256('') },
        ],
      })
    ).toHaveLength(2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
