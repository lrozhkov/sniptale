import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, expect, it } from 'vitest';
import { generateDependencyLegalClosure } from './index.mjs';
import { generateRepositoryDependencyLegal } from './generate-dependency-legal.mjs';
import { validateDependencyLegalClosure } from './validation.mjs';
import { createLegalFixture, TEST_MANROPE } from './test-support';
import { seedTestOssReleasePolicy } from '../policy/oss-release-policy.test-support';
import {
  assertReleaseLegalPayload,
  collectReleaseLegalSourceFiles,
} from '../policy/oss-release-policy.mjs';

const roots: string[] = [];
const owner = 'tooling/ci/mediabunny';
const modifiedSources = [{ packageName: 'mediabunny', version: '1.55.2', owner }];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const manifest = JSON.parse(await fs.readFile(`${owner}/patch-manifest.json`, 'utf8'));
  const repoRoot = await createLegalFixture({
    rootDependencies: { mediabunny: '1.55.2', alpha: '1.0.0' },
    packages: [
      {
        name: 'mediabunny',
        version: '1.55.2',
        license: 'MPL-2.0',
        resolved: manifest.resolved,
        integrity: manifest.integrity,
        files: { LICENSE: await fs.readFile(`${owner}/LICENSE`, 'utf8') },
      },
      { name: 'alpha', files: { LICENSE: 'MIT License\nCopyright fixture\n' } },
    ],
  });
  roots.push(repoRoot);
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

it('requires every generated modified-source file at the release packaging boundary', async () => {
  const { repoRoot } = await fixture();
  await seedTestOssReleasePolicy(repoRoot);
  const policyPath = path.join(repoRoot, 'tooling/configs/qa/oss-release.data.json');
  const policy = JSON.parse(await fs.readFile(policyPath, 'utf8'));
  policy.bundledAssets = [{ ...TEST_MANROPE, id: 'manrope' }];
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
  const sourcePath = files.find((file) =>
    file.relativePath.endsWith('modified/patch-payload.json.gz')
  )!.relativePath;
  expect(() =>
    assertReleaseLegalPayload(
      files.filter((file) => file.relativePath !== sourcePath),
      repoRoot
    )
  ).toThrow('missing legal file');
  expect(() =>
    assertReleaseLegalPayload(
      files.map((file) =>
        file.relativePath === sourcePath ? { ...file, contents: Buffer.from('changed') } : file
      ),
      repoRoot
    )
  ).toThrow('digest drift');
});
