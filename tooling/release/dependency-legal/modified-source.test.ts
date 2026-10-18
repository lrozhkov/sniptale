import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import { generateDependencyLegalClosure } from './index.mjs';
import { generateRepositoryDependencyLegal } from './generate-dependency-legal.mjs';
import { validateDependencyLegalClosure } from './validation.mjs';
import { createLegalFixture, TEST_INTERFACE_FONT } from './test-support';
import { seedTestOssReleasePolicy } from '../policy/oss-release-policy.test-support';
import {
  assertReleaseLegalPayload,
  collectReleaseLegalSourceFiles,
} from '../policy/oss-release-policy.mjs';

const roots: string[] = [];
const owner = 'tooling/ci/mediabunny';
const modifiedSources = [{ packageName: 'mediabunny', version: '1.61.3', owner }];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const manifest = JSON.parse(await fs.readFile(`${owner}/patch-manifest.json`, 'utf8'));
  const repoRoot = await createLegalFixture({
    rootDependencies: { mediabunny: '1.61.3', alpha: '1.0.0' },
    packages: [
      {
        name: 'mediabunny',
        version: '1.61.3',
        license: 'MPL-2.0',
        resolved: manifest.resolved,
        integrity: manifest.integrity,
        files: { LICENSE: await fs.readFile(`${owner}/LICENSE`, 'utf8') },
      },
      { name: 'alpha', files: { LICENSE: 'MIT License\nCopyright fixture\n' } },
    ],
  });
  roots.push(repoRoot);
  await fs.writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'sniptale', version: '0.4.0' })
  );
  for (const row of manifest.changes) {
    const target = path.join(repoRoot, 'node_modules/mediabunny', row.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join('node_modules/mediabunny', row.path), target);
  }
  await fs.copyFile(
    'node_modules/mediabunny/package.json',
    path.join(repoRoot, 'node_modules/mediabunny/package.json')
  );
  await fs.mkdir(path.join(repoRoot, owner), { recursive: true });
  for (const file of ['patch-manifest.json', 'patch-payload.json.gz', 'source.patch', 'LICENSE']) {
    await fs.copyFile(`${owner}/${file}`, path.join(repoRoot, owner, file));
  }
  return { repoRoot, manifest };
}

it('preserves upstream identity and unrelated dependencies while supplying complete modified source', async () => {
  const { repoRoot, manifest } = await fixture();
  const original = await generateDependencyLegalClosure({ repoRoot });
  const closure = await generateDependencyLegalClosure({ repoRoot, modifiedSources });
  expect(closure.entries.find((entry) => entry.packageName === 'alpha')).toEqual(
    original.entries.find((entry) => entry.packageName === 'alpha')
  );
  const entry = closure.entries.find((candidate) => candidate.packageName === 'mediabunny');
  expect(entry.correspondingSourceUrl).toBe(manifest.resolved);
  expect(entry.modifiedSource.upstreamIntegrity).toBe(manifest.integrity);
  expect(entry.modifiedSource.files).toHaveLength(5);
  const archive = closure.sourceFiles.find((file) => file.archivePath.endsWith('.gz'));
  const payload = JSON.parse(gunzipSync(archive.contents).toString('utf8'));
  for (const source of manifest.license.modifiedSourcePaths)
    expect(typeof payload[source]).toBe('string');
  expect(
    closure.sourceFiles.find((file) => file.archivePath.endsWith('/README.md')).contents.toString()
  ).toContain('tarball alone is not the modified corresponding source');
});

it.each(['installed', 'archive', 'policy'] as const)(
  'rejects %s source closure drift',
  async (kind) => {
    const { repoRoot } = await fixture();
    if (kind === 'installed')
      await fs.appendFile(path.join(repoRoot, 'node_modules/mediabunny/src/output.ts'), 'drift');
    if (kind === 'archive')
      await fs.appendFile(path.join(repoRoot, owner, 'patch-payload.json.gz'), 'drift');
    const policies =
      kind === 'policy' ? [{ ...modifiedSources[0], version: '9.0.0' }] : modifiedSources;
    await expect(
      generateDependencyLegalClosure({ repoRoot, modifiedSources: policies })
    ).rejects.toThrow();
  }
);

it('keeps source payload out of the installer and checks its separate distribution inputs', async () => {
  const { repoRoot } = await fixture();
  await seedTestOssReleasePolicy(repoRoot);
  const policyPath = path.join(repoRoot, 'tooling/configs/qa/oss-release.data.json');
  const policy = JSON.parse(await fs.readFile(policyPath, 'utf8'));
  policy.bundledAssets = [{ ...TEST_INTERFACE_FONT, id: 'golos-ui' }];
  policy.dependencyLegal = {
    manifestPath: 'THIRD_PARTY_DEPENDENCIES.json',
    licenseDirectory: 'LICENSES/dependencies',
    canonicalLicenseAliases: [],
    pinnedSources: [],
    reviewedSelections: [],
    modifiedSources,
  };
  await fs.writeFile(policyPath, JSON.stringify(policy));
  await generateRepositoryDependencyLegal(repoRoot);
  expect(await validateDependencyLegalClosure(repoRoot)).toEqual([]);
  const files = await collectReleaseLegalSourceFiles(repoRoot);
  expect(() => assertReleaseLegalPayload(files, repoRoot)).not.toThrow();
  expect(files.some((file) => file.relativePath.endsWith('patch-payload.json.gz'))).toBe(false);
  expect(files.some((file) => file.relativePath.startsWith('packages/'))).toBe(false);
  const sourceFiles = await collectReleaseLegalSourceFiles(repoRoot, { includeSource: true });
  const payload = sourceFiles.find((file) => file.relativePath.endsWith('patch-payload.json.gz'))!;
  expect(() => assertReleaseLegalPayload([...files, payload], repoRoot)).toThrow(
    'Source-only file'
  );
  await fs.appendFile(payload.absolutePath, 'changed');
  await expect(collectReleaseLegalSourceFiles(repoRoot, { includeSource: true })).rejects.toThrow(
    'digest drift'
  );
});

it('reads the checked source object when its path is replaced after the file check', async () => {
  const { repoRoot } = await fixture();
  const target = path.join(repoRoot, owner, 'source.patch');
  const stat = fs.stat.bind(fs);
  const open = fs.open.bind(fs);
  let replaced = false;
  const replace = async () => {
    if (replaced) return;
    replaced = true;
    await fs.rename(target, `${target}.old`);
    await fs.writeFile(target, 'replacement');
  };
  vi.spyOn(fs, 'stat').mockImplementation(async (...args) => {
    const result = await stat(...args);
    if (args[0] === target) await replace();
    return result;
  });
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args);
    if (args[0] === target) {
      const handleStat = handle.stat.bind(handle);
      vi.spyOn(handle, 'stat').mockImplementation(async (...options) => {
        const result = await handleStat(...options);
        await replace();
        return result;
      });
    }
    return handle;
  });
  await expect(
    generateDependencyLegalClosure({ repoRoot, modifiedSources })
  ).resolves.toBeDefined();
  expect(replaced).toBe(true);
});

it.each(['stat', 'readFile'] as const)(
  'closes the owned source handle after %s failure',
  async (operation) => {
    const { repoRoot } = await fixture();
    const target = path.join(repoRoot, owner, 'source.patch');
    const open = fs.open.bind(fs);
    const closed = vi.fn();
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (args[0] === target) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, operation).mockRejectedValue(new Error('source read failed'));
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          await close();
          closed();
        });
      }
      return handle;
    });
    await expect(generateDependencyLegalClosure({ repoRoot, modifiedSources })).rejects.toThrow(
      'source read failed'
    );
    expect(closed).toHaveBeenCalledOnce();
  }
);
