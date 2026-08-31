import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import JSZip from 'jszip';
import { expect, it } from 'vitest';

import { EXPECTED_SANDBOX_CSP } from '../artifact-security/artifact-security.mjs';
import { createReleaseArchive } from './package-dist.mjs';
import { seedTestOssReleasePolicy } from '../policy/oss-release-policy.test-support';

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
      optionalPermissions: [],
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

it('accepts canonical SemVer prerelease/build metadata and uses the UTC build date', async () => {
  const root = await createReleaseRoot();
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'Sniptale Test', version: '1.2.3-beta.1+build.5' })
  );

  const archivePath = await createReleaseArchive({
    date: new Date('2026-01-01T22:30:00.000Z'),
    repoRoot: root,
  });

  expect(archivePath).toBe(
    path.join(root, 'build', 'sniptale-test_1.2.3-beta.1+build.5_2026-01-01.zip')
  );
});

it.each([
  ['', 'empty'],
  [' x/../../../outside/payload ', 'traversal'],
  ['01.2.3', 'leading-zero'],
  ['1.2', 'incomplete'],
  ['1.2.3 ', 'padded'],
])('rejects non-canonical package version %s (%s)', async (version) => {
  const root = await createReleaseRoot();
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'Sniptale Test', version })
  );
  const outsidePath = path.join(os.tmpdir(), 'outside', 'payload_2026-06-01.zip');
  await fs.rm(outsidePath, { force: true });

  await expect(
    createReleaseArchive({
      date: new Date('2026-06-01T12:00:00.000Z'),
      repoRoot: root,
    })
  ).rejects.toThrow('Release package.json version must be an exact canonical SemVer string.');
  await expect(fs.access(outsidePath)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects non-string package versions and names that cannot identify an archive', async () => {
  const root = await createReleaseRoot();
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'Sniptale Test', version: 1 })
  );
  await expect(createReleaseArchive({ repoRoot: root })).rejects.toThrow(
    'Release package.json version must be an exact canonical SemVer string.'
  );

  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: '***', version: '1.0.0' })
  );
  await expect(createReleaseArchive({ repoRoot: root })).rejects.toThrow(
    'Release package.json name must produce a non-empty archive name.'
  );
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

it('rejects an empty dist, malformed manifest JSON, and Manifest V2', async () => {
  const root = await createReleaseRoot();
  await fs.rm(path.join(root, 'dist'), { recursive: true });
  await fs.mkdir(path.join(root, 'dist'));
  await expect(createReleaseArchive({ repoRoot: root })).rejects.toThrow(
    'dist/ is empty. Run the release build before packaging.'
  );

  await fs.writeFile(path.join(root, 'dist', 'manifest.json'), '{');
  await expect(createReleaseArchive({ repoRoot: root })).rejects.toThrow(
    'Release archive manifest.json is not valid JSON.'
  );

  await fs.writeFile(path.join(root, 'dist', 'manifest.json'), '{"manifest_version":2}');
  await expect(createReleaseArchive({ repoRoot: root })).rejects.toThrow(
    'Release archive manifest.json must be Manifest V3.'
  );
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

it('rejects symlinks and oversized files instead of omitting or packaging them', async () => {
  const root = await createReleaseRoot();
  await fs.symlink('popup.js', path.join(root, 'dist', 'assets', 'popup-link.js'));
  await expect(createReleaseArchive({ repoRoot: root })).rejects.toThrow(
    'Release archive contains unsupported filesystem entry: assets/popup-link.js'
  );
  await fs.rm(path.join(root, 'dist', 'assets', 'popup-link.js'));

  const oversizedPath = path.join(root, 'dist', 'assets', 'oversized.bin');
  await fs.writeFile(oversizedPath, '');
  await fs.truncate(oversizedPath, 50 * 1024 * 1024 + 1);
  await expect(createReleaseArchive({ repoRoot: root })).rejects.toThrow(
    'Release archive file is unexpectedly large: assets/oversized.bin'
  );
});

it('emits byte-identical archives for identical inputs', async () => {
  const root = await createReleaseRoot();
  const options = { date: new Date('2026-06-01T12:00:00.000Z'), repoRoot: root };
  const firstPath = await createReleaseArchive(options);
  const firstBytes = await fs.readFile(firstPath);
  const secondPath = await createReleaseArchive(options);
  const secondBytes = await fs.readFile(secondPath);

  expect(secondPath).toBe(firstPath);
  expect(secondBytes.equals(firstBytes)).toBe(true);
});

it('accepts hashed token-named bundles but rejects token payload files', async () => {
  const root = await createReleaseRoot();
  await fs.writeFile(
    path.join(root, 'dist', 'assets', 'tokens-Bnweetmb.js'),
    'export const ok = 1;'
  );

  await expect(createReleaseArchive({ repoRoot: root })).resolves.toEqual(expect.any(String));

  for (const forbiddenPath of [
    'token.json',
    'assets/token-abcdefgh.js',
    'assets/secret-abcdefgh.js',
    'assets/private-key-abcdefgh.js',
    'assets/raw-diagnostics-abcdefgh.js',
    'assets/raw-history-abcdefgh.js',
  ]) {
    const absolutePath = path.join(root, 'dist', forbiddenPath);
    await fs.writeFile(absolutePath, '{"secret":"value"}');
    await expect(createReleaseArchive({ repoRoot: root })).rejects.toThrow(
      `Release archive contains forbidden file: ${forbiddenPath}`
    );
    await fs.rm(absolutePath);
  }
});

it('rejects a dist file that collides with a required legal payload path', async () => {
  const root = await createReleaseRoot();
  await fs.writeFile(path.join(root, 'dist', 'NOTICE'), 'spoofed notice');

  await expect(createReleaseArchive({ repoRoot: root })).rejects.toThrow(
    'Release archive path collision: NOTICE'
  );
});
