import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { formatThirdPartyNotices, writeDependencyLegalClosure } from './output.mjs';
import { TEST_INTERFACE_FONT } from './test-support';

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

it('formats stable notices with supplied Interface font metadata and artifact hashes', () => {
  const notices = formatThirdPartyNotices({ entries: [ENTRY], interfaceFont: TEST_INTERFACE_FONT });

  expect(notices).toContain('Source package: `@sniptale/ui`');
  expect(notices).toContain('Font version: `2.000`');
  expect(notices).toContain(
    `packages/ui/src/styles/golos-ui/golos-ui-cyrillic.woff2\` | \`${'b'.repeat(64)}`
  );
  expect(notices).toContain('MPL-2.0 corresponding source');
  expect(notices.indexOf('golos-ui-cyrillic')).toBeLessThan(notices.indexOf('golos-ui-latin'));
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
    interfaceFont: TEST_INTERFACE_FONT,
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
      interfaceFont: TEST_INTERFACE_FONT,
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
      interfaceFont: TEST_INTERFACE_FONT,
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
    interfaceFont: TEST_INTERFACE_FONT,
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
      interfaceFont: TEST_INTERFACE_FONT,
      outputRoot,
    })
  ).rejects.toThrow(`Canonical dependency license file is missing: ${canonicalPath}`);

  await fs.mkdir(path.join(outputRoot, 'LICENSES'), { recursive: true });
  await fs.writeFile(path.join(outputRoot, canonicalPath), 'changed');
  await expect(
    writeDependencyLegalClosure({
      closure: { entries: [canonicalEntry], licenseFiles: [] },
      interfaceFont: TEST_INTERFACE_FONT,
      outputRoot,
    })
  ).rejects.toThrow(`Canonical dependency license digest drift: ${canonicalPath}`);
});

it('adds Text font provenance without changing the UI section or dependency closure', () => {
  const documentFont = {
    ...TEST_INTERFACE_FONT,
    version: '2.005',
    licensePath: 'packages/ui/src/styles/golos-text/LICENSE.txt',
    artifacts: [
      {
        path: 'packages/ui/src/styles/golos-text/golos-text-vf.woff2',
        sourcePath: 'packages/ui/src/styles/golos-text/golos-text-vf.woff2',
        sha256: 'ee021f497d8f5b323b9dc5653b88380be86a176de08cbe74d6fe721cafe9c843',
      },
    ],
  };
  const original = formatThirdPartyNotices({
    entries: [ENTRY],
    interfaceFont: TEST_INTERFACE_FONT,
  });
  const notices = formatThirdPartyNotices({
    entries: [ENTRY],
    interfaceFont: TEST_INTERFACE_FONT,
    documentFont,
  });
  expect(notices).toContain('## Golos Text bundled font');
  expect(notices).toContain('Font version: `2.005`');
  expect(notices).toContain(documentFont.artifacts[0].sha256);
  expect(notices.split('## Production dependency licenses')[1]).toBe(
    original.split('## Production dependency licenses')[1]
  );
  expect(notices.split('## Golos Text')[0].trim()).toBe(
    original.split('## Production dependency licenses')[0].trim()
  );
});

it('includes the model and runtime notices without creating an npm dependency', () => {
  const asset = {
    id: 'clark-x2',
    name: 'Clark Realtime UI Video Upscaler x2',
    attribution: 'Clark Labs',
    license: 'Apache-2.0',
    sourceUrl: 'https://huggingface.co/clark-labs/clark-realtime-ui-video-upscaler-x2',
    licensePath: 'vendor/clark/LICENSE',
    licenseSha256: 'a'.repeat(64),
    noticePath: 'vendor/clark/NOTICE.txt',
    noticeSha256: 'b'.repeat(64),
    provenancePath: 'vendor/clark/identity.json',
    provenanceSha256: 'c'.repeat(64),
    modifications:
      'The runtime adds initialization cleanup. The model weights and shaders do not change.',
    artifacts: [
      {
        path: 'vendor/clark/model.bin',
        sha256: 'd'.repeat(64),
        sourceUrl:
          'https://huggingface.co/clark-labs/clark-realtime-ui-video-upscaler-x2/resolve/main/model.bin',
        sourceSha256: 'd'.repeat(64),
      },
    ],
  };
  const notices = formatThirdPartyNotices({
    entries: [ENTRY],
    interfaceFont: TEST_INTERFACE_FONT,
    bundledAssets: [asset],
  });
  expect(notices).toContain('## Clark Realtime UI Video Upscaler x2');
  expect(notices).toContain('Apache-2.0');
  expect(notices).toContain('[`vendor/clark/LICENSE`](vendor/clark/LICENSE)');
  expect(notices).toContain('[`vendor/clark/NOTICE.txt`](vendor/clark/NOTICE.txt)');
  expect(notices).toContain('[`vendor/clark/identity.json`](vendor/clark/identity.json)');
  expect(notices).toContain(asset.sourceUrl);
  expect(notices).toContain(asset.modifications);
  expect(notices).toContain(asset.artifacts[0]!.sourceSha256);
  expect(notices).not.toContain('`clark-x2` 1.0.0');
});

it('keeps existing font and npm notices byte-identical when the optional asset list is empty', () => {
  const previous = formatThirdPartyNotices({
    entries: [ENTRY],
    interfaceFont: TEST_INTERFACE_FONT,
  });
  expect(
    formatThirdPartyNotices({
      entries: [ENTRY],
      interfaceFont: TEST_INTERFACE_FONT,
      bundledAssets: [],
    })
  ).toBe(previous);
});

it('rejects invalid bundled metadata before replacing completed legal outputs', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-bundled-legal-invalid-'));
  const preserved = path.join(outputRoot, 'LICENSES/dependencies/completed.txt');
  await fs.mkdir(path.dirname(preserved), { recursive: true });
  await fs.writeFile(preserved, 'completed');
  await expect(
    writeDependencyLegalClosure({
      closure: {
        entries: [ENTRY],
        licenseFiles: [{ archivePath: ENTRY.archivePath, contents: LICENSE_TEXT }],
      },
      interfaceFont: TEST_INTERFACE_FONT,
      outputRoot,
      bundledAssets: [{ id: 'clark-x2', artifacts: [] }],
    })
  ).rejects.toThrow('Bundled asset artifacts are required.');
  expect(await fs.readFile(preserved, 'utf8')).toBe('completed');
});
