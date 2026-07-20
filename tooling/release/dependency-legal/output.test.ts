import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { formatThirdPartyNotices, writeDependencyLegalClosure } from './output.mjs';
import { TEST_MANROPE } from './test-support';

const LICENSE_TEXT = 'MPL text\n';
const ENTRY = {
  archivePath: 'LICENSES/dependencies/alpha-1.0.0.txt',
  correspondingSourceUrl: 'https://registry.example.test/alpha-1.0.0.tgz',
  licenseExpression: 'MPL-2.0',
  licenseSource: 'node_modules/alpha/LICENSE',
  licenseSourceKind: 'installed-file',
  licenseStorageKind: 'generated-copy',
  packageName: 'alpha',
  packagePath: 'node_modules/alpha',
  selectedLicense: 'MPL-2.0',
  sha256: createHash('sha256').update(LICENSE_TEXT).digest('hex'),
  sourceUrl: 'https://example.test/alpha',
  version: '1.0.0',
};

it('formats stable notices with supplied Manrope metadata and artifact hashes', () => {
  const notices = formatThirdPartyNotices({ entries: [ENTRY], manrope: TEST_MANROPE });

  expect(notices).toContain('@fontsource-variable/manrope` 5.2.8');
  expect(notices).toContain(
    `node_modules/@fontsource-variable/manrope/files/manrope-cyrillic.woff2\` | \`${'b'.repeat(64)}`
  );
  expect(notices).toContain('MPL-2.0 corresponding source');
  expect(notices.indexOf('manrope-cyrillic')).toBeLessThan(notices.indexOf('manrope-latin'));
});

it('writes the manifest, notices, and exact license directory without implicit invocation', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-legal-output-'));
  const stalePath = path.join(outputRoot, 'LICENSES/dependencies/stale.txt');
  await fs.mkdir(path.dirname(stalePath), { recursive: true });
  await fs.writeFile(stalePath, 'stale');

  await writeDependencyLegalClosure({
    closure: {
      entries: [ENTRY],
      licenseFiles: [{ archivePath: ENTRY.archivePath, contents: LICENSE_TEXT }],
    },
    manrope: TEST_MANROPE,
    outputRoot,
  });

  await expect(fs.readFile(stalePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.readFile(path.join(outputRoot, ENTRY.archivePath), 'utf8')).resolves.toBe(
    LICENSE_TEXT
  );
  const manifest = JSON.parse(
    await fs.readFile(path.join(outputRoot, 'THIRD_PARTY_DEPENDENCIES.json'), 'utf8')
  );
  expect(manifest).toEqual({ entries: [ENTRY], schemaVersion: 1 });
  await expect(
    fs.readFile(path.join(outputRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8')
  ).resolves.toContain('# Third-party notices');
});

it('rejects stale license contents before writing an output set', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-legal-drift-'));

  await expect(
    writeDependencyLegalClosure({
      closure: {
        entries: [ENTRY],
        licenseFiles: [{ archivePath: ENTRY.archivePath, contents: 'changed' }],
      },
      manrope: TEST_MANROPE,
      outputRoot,
    })
  ).rejects.toThrow(`Dependency license digest drift: ${ENTRY.archivePath}`);
});

it('rejects pinned source metadata that does not match archived output bytes', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-legal-provenance-'));
  const pinnedEntry = {
    ...ENTRY,
    licenseProvenance: {
      kind: 'pinned-upstream',
      originUrl: 'https://raw.example.test/project/v1/LICENSE',
      sha256: '0'.repeat(64),
      sourcePath: 'tooling/release/dependency-legal/sources/project-v1.LICENSE',
      upstreamVersion: '1.0.0',
    },
    licenseSource: 'tooling/release/dependency-legal/sources/project-v1.LICENSE',
    licenseSourceKind: 'pinned-upstream',
  };

  await expect(
    writeDependencyLegalClosure({
      closure: {
        entries: [pinnedEntry],
        licenseFiles: [{ archivePath: ENTRY.archivePath, contents: LICENSE_TEXT }],
      },
      manrope: TEST_MANROPE,
      outputRoot,
    })
  ).rejects.toThrow(`Dependency license provenance drift: ${ENTRY.archivePath}`);
});

it('reuses an exact canonical license file without writing a dependency copy', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-legal-canonical-'));
  const canonicalPath = 'LICENSES/OFL-1.1.txt';
  const canonicalText = 'OFL fixture\n';
  const canonicalEntry = {
    ...ENTRY,
    archivePath: canonicalPath,
    licenseStorageKind: 'canonical-file',
    sha256: createHash('sha256').update(canonicalText).digest('hex'),
  };
  await fs.mkdir(path.join(outputRoot, 'LICENSES'), { recursive: true });
  await fs.writeFile(path.join(outputRoot, canonicalPath), canonicalText);

  await writeDependencyLegalClosure({
    closure: { entries: [canonicalEntry], licenseFiles: [] },
    manrope: TEST_MANROPE,
    outputRoot,
  });

  await expect(fs.readFile(path.join(outputRoot, canonicalPath), 'utf8')).resolves.toBe(
    canonicalText
  );
  await expect(fs.readdir(path.join(outputRoot, 'LICENSES/dependencies'))).resolves.toEqual([]);
});

it('rejects a missing or drifted canonical license before replacing generated files', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-legal-canonical-drift-'));
  const canonicalPath = 'LICENSES/OFL-1.1.txt';
  const canonicalEntry = {
    ...ENTRY,
    archivePath: canonicalPath,
    licenseStorageKind: 'canonical-file',
  };

  await expect(
    writeDependencyLegalClosure({
      closure: { entries: [canonicalEntry], licenseFiles: [] },
      manrope: TEST_MANROPE,
      outputRoot,
    })
  ).rejects.toThrow(`Canonical dependency license file is missing: ${canonicalPath}`);

  await fs.mkdir(path.join(outputRoot, 'LICENSES'), { recursive: true });
  await fs.writeFile(path.join(outputRoot, canonicalPath), 'changed');
  await expect(
    writeDependencyLegalClosure({
      closure: { entries: [canonicalEntry], licenseFiles: [] },
      manrope: TEST_MANROPE,
      outputRoot,
    })
  ).rejects.toThrow(`Canonical dependency license digest drift: ${canonicalPath}`);
});
