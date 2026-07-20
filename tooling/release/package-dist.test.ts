import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import JSZip from 'jszip';
import { expect, it } from 'vitest';

import { EXPECTED_SANDBOX_CSP } from './artifact-security.mjs';
import { createReleaseArchive } from './package-dist.mjs';
import { seedTestOssReleasePolicy } from './oss-release-policy.test-support';

async function createReleaseRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-package-dist-'));
  await fs.mkdir(path.join(root, 'dist', 'assets'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'Sniptale Test', version: '0.1.0' })
  );
  await seedTestOssReleasePolicy(root);
  await fs.mkdir(path.join(root, 'tooling/configs/qa'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'tooling/configs/qa/manifest-permissions.data.json'),
    JSON.stringify({
      hostPermissions: [],
      optionalHostPermissions: [],
      permissions: [],
      webAccessibleResources: [],
    })
  );
  await fs.writeFile(
    path.join(root, 'dist', 'manifest.json'),
    JSON.stringify({
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self';",
        sandbox: EXPECTED_SANDBOX_CSP,
      },
      manifest_version: 3,
      sandbox: { pages: ['apps/extension/src/effect-runtime-sandbox/index.html'] },
    })
  );
  await fs.mkdir(path.join(root, 'dist', 'apps/extension/src/effect-runtime-sandbox'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, 'dist', 'apps/extension/src/effect-runtime-sandbox', 'index.html'),
    '<!doctype html>'
  );
  await fs.writeFile(path.join(root, 'dist', 'assets', 'popup.js'), 'console.log("popup");');
  return root;
}

it('writes the release archive into build while reading extension files from dist', async () => {
  const root = await createReleaseRoot();

  const archivePath = await createReleaseArchive({
    date: new Date('2026-06-01T12:00:00.000Z'),
    repoRoot: root,
  });

  expect(archivePath).toBe(path.join(root, 'build', 'sniptale-test_0.1.0_2026-06-01.zip'));
  await expect(fs.stat(archivePath)).resolves.toEqual(
    expect.objectContaining({ size: expect.any(Number) })
  );
  await expect(
    fs.stat(path.join(root, 'dist', 'sniptale-test_0.1.0_2026-06-01.zip'))
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

it('does not include existing build archives inside the extension package', async () => {
  const root = await createReleaseRoot();
  const archiveName = 'sniptale-test_0.1.0_2026-06-01.zip';
  await fs.mkdir(path.join(root, 'build'), { recursive: true });
  await fs.writeFile(path.join(root, 'build', archiveName), 'previous archive');

  const archivePath = await createReleaseArchive({
    date: new Date('2026-06-01T12:00:00.000Z'),
    repoRoot: root,
  });
  const zip = await JSZip.loadAsync(await fs.readFile(archivePath));

  expect(zip.file('manifest.json')).not.toBeNull();
  expect(zip.file('assets/popup.js')).not.toBeNull();
  expect(zip.file('LICENSE')).not.toBeNull();
  expect(zip.file('NOTICE')).not.toBeNull();
  expect(zip.file('THIRD_PARTY_NOTICES.md')).not.toBeNull();
  expect(zip.file('LICENSES/OFL-1.1.txt')).not.toBeNull();
  expect(zip.file('THIRD_PARTY_DEPENDENCIES.json')).not.toBeNull();
  expect(zip.file('LICENSES/dependencies/example-1.0.0.txt')).not.toBeNull();
  expect(zip.file(archiveName)).toBeNull();
});

it('rejects archives whose manifest references a missing extension entrypoint', async () => {
  const root = await createReleaseRoot();
  await fs.writeFile(
    path.join(root, 'dist', 'manifest.json'),
    JSON.stringify({
      action: { default_popup: 'popup.html' },
      manifest_version: 3,
    })
  );

  await expect(
    createReleaseArchive({
      date: new Date('2026-06-01T12:00:00.000Z'),
      repoRoot: root,
    })
  ).rejects.toThrow('Release archive manifest references missing file: popup.html');
});

it('rejects archives whose manifest references a missing sandbox page', async () => {
  const root = await createReleaseRoot();
  await fs.rm(path.join(root, 'dist', 'apps/extension/src/effect-runtime-sandbox', 'index.html'));

  await expect(
    createReleaseArchive({
      date: new Date('2026-06-01T12:00:00.000Z'),
      repoRoot: root,
    })
  ).rejects.toThrow(
    'Release archive manifest references missing file: apps/extension/src/effect-runtime-sandbox/index.html'
  );
});

it('rejects source maps in the release archive', async () => {
  const root = await createReleaseRoot();
  await fs.writeFile(path.join(root, 'dist', 'assets', 'popup.js.map'), '{}');

  await expect(
    createReleaseArchive({
      date: new Date('2026-06-01T12:00:00.000Z'),
      repoRoot: root,
    })
  ).rejects.toThrow('Release archive contains forbidden file: assets/popup.js.map');
});

it('rejects a dist file that collides with a required legal payload path', async () => {
  const root = await createReleaseRoot();
  await fs.writeFile(path.join(root, 'dist', 'NOTICE'), 'spoofed notice');

  await expect(createReleaseArchive({ repoRoot: root })).rejects.toThrow(
    'Release archive path collision: NOTICE'
  );
});
