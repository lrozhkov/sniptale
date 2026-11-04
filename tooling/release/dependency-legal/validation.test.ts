import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { generateDependencyLegalClosure } from './index.mjs';
import { createLegalFixture, TEST_INTERFACE_FONT } from './test-support';
import { writeDependencyLegalClosure } from './output.mjs';
import { releaseLegalArchivePath } from '../policy/oss-release-policy.mjs';
import { validateDependencyLegalClosure } from './validation.mjs';
import { generateRepositoryDependencyLegal } from './generate-dependency-legal.mjs';

function sha256(contents: string) {
  return createHash('sha256').update(contents).digest('hex');
}

async function seedBaseLegalFiles(repoRoot: string) {
  const baseLegal = new Map([
    ['LICENSE', 'AGPL fixture\n'],
    ['LICENSES/OFL-1.1.txt', 'OFL fixture\n'],
    ['LICENSES/fonts/golos-ui.txt', 'Golos OFL fixture\n'],
    ['NOTICE', 'Notice fixture\n'],
    ['THIRD_PARTY_NOTICES.md', 'generated below'],
  ]);
  for (const [relativePath, contents] of baseLegal) {
    const destination = path.join(repoRoot, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, contents);
  }
  return baseLegal;
}

async function seedValidationFixture() {
  const repoRoot = await createLegalFixture({
    packages: [
      {
        files: { LICENSE: 'Mozilla Public License Version 2.0\n' },
        license: 'MPL-2.0',
        name: 'mediabunny',
        resolved: 'https://registry.example.test/mediabunny/-/mediabunny-1.46.0.tgz',
        version: '1.46.0',
      },
    ],
    rootDependencies: { mediabunny: '^1' },
  });
  const baseLegal = await seedBaseLegalFiles(repoRoot);
  const closure = await generateDependencyLegalClosure({ repoRoot, reviewedSelections: [] });
  await writeDependencyLegalClosure({
    closure,
    interfaceFont: TEST_INTERFACE_FONT,
    outputRoot: repoRoot,
  });
  const legalPaths = [
    ...baseLegal.keys(),
    'THIRD_PARTY_DEPENDENCIES.json',
    ...closure.entries.map((entry) => entry.archivePath),
  ];
  const legalFiles = await Promise.all(
    legalPaths.map(async (relativePath) => ({
      archivePath: relativePath,
      sha256: sha256(await fs.readFile(path.join(repoRoot, relativePath), 'utf8')),
      source: relativePath,
    }))
  );
  await fs.mkdir(path.join(repoRoot, 'tooling/configs/qa'), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, 'tooling/configs/qa/oss-release.data.json'),
    JSON.stringify({
      bundledAssets: [{ ...TEST_INTERFACE_FONT, id: 'golos-ui' }],
      dependencyLegal: {
        canonicalLicenseAliases: [],
        licenseDirectory: 'LICENSES/dependencies',
        manifestPath: 'THIRD_PARTY_DEPENDENCIES.json',
        pinnedSources: [],
        reviewedSelections: [],
      },
      legalFiles,
    })
  );
  return { closure, repoRoot };
}

it('accepts exact tracked dependency legal outputs and rejects a missing license artifact', async () => {
  const { closure, repoRoot } = await seedValidationFixture();
  expect(await validateDependencyLegalClosure(repoRoot)).toEqual([]);

  await fs.rm(path.join(repoRoot, closure.entries[0].archivePath));
  expect(await validateDependencyLegalClosure(repoRoot)).toEqual(
    expect.arrayContaining([
      'Dependency license artifact inventory is incomplete or stale',
      `Dependency license artifact is missing: ${closure.entries[0].archivePath}`,
    ])
  );
});

it('rejects a stale manifest and missing MPL corresponding-source URL', async () => {
  const { closure, repoRoot } = await seedValidationFixture();
  const entry = { ...closure.entries[0] };
  delete entry.correspondingSourceUrl;
  await fs.writeFile(
    path.join(repoRoot, 'THIRD_PARTY_DEPENDENCIES.json'),
    JSON.stringify({ entries: [entry], schemaVersion: 1 })
  );

  expect(await validateDependencyLegalClosure(repoRoot)).toEqual(
    expect.arrayContaining([
      'Dependency legal manifest is incomplete or stale',
      'MPL corresponding-source URL is missing: mediabunny@1.46.0',
    ])
  );
});

it('requires Text provenance in generated notices when the policy declares Text', async () => {
  const { closure, repoRoot } = await seedValidationFixture();
  const policyPath = path.join(repoRoot, 'tooling/configs/qa/oss-release.data.json');
  const policy = JSON.parse(await fs.readFile(policyPath, 'utf8'));
  const repositoryPolicy = JSON.parse(
    await fs.readFile('tooling/configs/qa/oss-release.data.json', 'utf8')
  );
  const documentFont = repositoryPolicy.bundledAssets.find(
    (entry: { id: string }) => entry.id === 'golos-text'
  );
  policy.bundledAssets.push(documentFont);
  policy.legalFiles.push({
    archivePath: releaseLegalArchivePath(documentFont.licensePath),
    source: releaseLegalArchivePath(documentFont.licensePath),
    sha256: 'a'.repeat(64),
  });
  await fs.writeFile(policyPath, JSON.stringify(policy));
  expect(await validateDependencyLegalClosure(repoRoot)).toContain(
    'THIRD_PARTY_NOTICES.md is incomplete or stale'
  );
  await writeDependencyLegalClosure({
    closure,
    interfaceFont: TEST_INTERFACE_FONT,
    documentFont,
    outputRoot: repoRoot,
  });
  expect(await validateDependencyLegalClosure(repoRoot)).toEqual([]);
});

async function seedBundledModelFixture() {
  const { closure, repoRoot } = await seedValidationFixture();
  const files = new Map([
    ['vendor/clark/LICENSE', 'Apache model license fixture\n'],
    ['vendor/clark/NOTICE.txt', 'Clark model and runtime notice fixture\n'],
    ['vendor/clark/identity.json', '{"runtime":"reviewed"}\n'],
    ['vendor/clark/model.bin', 'model weights fixture\n'],
    ['vendor/clark/runtime.js', 'adapted runtime fixture\n'],
  ]);
  for (const [file, contents] of files) {
    await fs.mkdir(path.dirname(path.join(repoRoot, file)), { recursive: true });
    await fs.writeFile(path.join(repoRoot, file), contents);
  }
  const digest = (file: string) => sha256(files.get(file)!);
  const asset = {
    id: 'clark-x2',
    name: 'Clark Realtime UI Video Upscaler x2',
    attribution: 'Clark Labs',
    license: 'Apache-2.0',
    sourceUrl: 'https://example.test/clark',
    licensePath: 'vendor/clark/LICENSE',
    licenseSha256: digest('vendor/clark/LICENSE'),
    noticePath: 'vendor/clark/NOTICE.txt',
    noticeSha256: digest('vendor/clark/NOTICE.txt'),
    provenancePath: 'vendor/clark/identity.json',
    provenanceSha256: digest('vendor/clark/identity.json'),
    modifications: 'The runtime adds initialization cleanup.',
    artifacts: ['vendor/clark/model.bin', 'vendor/clark/runtime.js'].map((file) => ({
      path: file,
      sha256: digest(file),
      sourceUrl: `https://example.test/upstream/${path.basename(file)}`,
      sourceSha256: digest(file),
    })),
  };
  const policyPath = path.join(repoRoot, 'tooling/configs/qa/oss-release.data.json');
  const policy = JSON.parse(await fs.readFile(policyPath, 'utf8'));
  policy.dependencyLegal.bundledAssets = [asset];
  for (const file of [asset.licensePath, asset.noticePath, asset.provenancePath])
    policy.legalFiles.push({ archivePath: file, source: file, sha256: digest(file) });
  await fs.writeFile(policyPath, JSON.stringify(policy));
  return { closure, repoRoot, asset, files, policyPath };
}

it('requires model and runtime provenance in generated notices without changing font or npm closure', async () => {
  const { closure, repoRoot, asset } = await seedBundledModelFixture();
  expect(await validateDependencyLegalClosure(repoRoot)).toContain(
    'THIRD_PARTY_NOTICES.md is incomplete or stale'
  );
  await writeDependencyLegalClosure({
    closure,
    interfaceFont: TEST_INTERFACE_FONT,
    bundledAssets: [asset],
    outputRoot: repoRoot,
  });
  expect(await validateDependencyLegalClosure(repoRoot)).toEqual([]);
  const manifest = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'THIRD_PARTY_DEPENDENCIES.json'), 'utf8')
  );
  expect(manifest.entries).toEqual(closure.entries);
  expect(
    manifest.entries.some((entry: { packageName: string }) => entry.packageName === 'clark-x2')
  ).toBe(false);
});

it('rejects actual model, runtime, license, notice and provenance byte drift', async () => {
  const { closure, repoRoot, asset, files } = await seedBundledModelFixture();
  await writeDependencyLegalClosure({
    closure,
    interfaceFont: TEST_INTERFACE_FONT,
    bundledAssets: [asset],
    outputRoot: repoRoot,
  });
  for (const [file, contents] of files) {
    await fs.writeFile(path.join(repoRoot, file), `${contents}drift`);
    const errors = await validateDependencyLegalClosure(repoRoot);
    expect(
      errors.some((error: string) => error.includes('content drift') && error.includes(file))
    ).toBe(true);
    await fs.writeFile(path.join(repoRoot, file), contents);
  }
  expect(await validateDependencyLegalClosure(repoRoot)).toEqual([]);
});

it('rejects missing asset notices, missing source hashes and incomplete legal payload declarations', async () => {
  const { closure, repoRoot, asset, files, policyPath } = await seedBundledModelFixture();
  await writeDependencyLegalClosure({
    closure,
    interfaceFont: TEST_INTERFACE_FONT,
    bundledAssets: [asset],
    outputRoot: repoRoot,
  });
  await fs.rm(path.join(repoRoot, asset.noticePath));
  expect(await validateDependencyLegalClosure(repoRoot)).toContain(
    `Bundled asset notice is missing: ${asset.noticePath}`
  );
  await fs.writeFile(path.join(repoRoot, asset.noticePath), files.get(asset.noticePath)!);
  const policy = JSON.parse(await fs.readFile(policyPath, 'utf8'));
  delete policy.dependencyLegal.bundledAssets[0].artifacts[0].sourceSha256;
  await fs.writeFile(policyPath, JSON.stringify(policy));
  expect(await validateDependencyLegalClosure(repoRoot)).toContain(
    'Bundled asset artifact source SHA-256 is required.'
  );
  policy.dependencyLegal.bundledAssets = [asset];
  policy.legalFiles = policy.legalFiles.filter(
    (file: { source: string }) => file.source !== asset.noticePath
  );
  await fs.writeFile(policyPath, JSON.stringify(policy));
  expect(await validateDependencyLegalClosure(repoRoot)).toContain(
    `Bundled asset legal payload is missing or stale: ${asset.noticePath}`
  );
});

it('generates model legal payloads through the existing owner and refuses source drift before writing', async () => {
  const { repoRoot, asset } = await seedBundledModelFixture();
  const fontLicense = 'packages/ui/src/styles/golos-ui/LICENSE.txt';
  await fs.mkdir(path.dirname(path.join(repoRoot, fontLicense)), { recursive: true });
  await fs.copyFile(fontLicense, path.join(repoRoot, fontLicense));
  await generateRepositoryDependencyLegal(repoRoot);
  expect(await validateDependencyLegalClosure(repoRoot)).toEqual([]);
  const policyPath = path.join(repoRoot, 'tooling/configs/qa/oss-release.data.json');
  const policyBefore = await fs.readFile(policyPath, 'utf8');
  const policy = JSON.parse(policyBefore);
  for (const file of [asset.licensePath, asset.noticePath, asset.provenancePath])
    expect(policy.legalFiles.some((entry: { source: string }) => entry.source === file)).toBe(true);
  expect(policy.bundledAssets.map((entry: { id: string }) => entry.id)).toEqual(['golos-ui']);
  const noticesPath = path.join(repoRoot, 'THIRD_PARTY_NOTICES.md');
  const before = await fs.readFile(noticesPath, 'utf8');
  await fs.appendFile(path.join(repoRoot, asset.artifacts[0]!.path), 'drift');
  await expect(generateRepositoryDependencyLegal(repoRoot)).rejects.toThrow(
    'Bundled asset artifact content drift'
  );
  expect(await fs.readFile(noticesPath, 'utf8')).toBe(before);
  expect(await fs.readFile(policyPath, 'utf8')).toBe(policyBefore);
});

it('validates the actual vendored model, runtime and legal bytes in an isolated copy', async () => {
  const { closure, repoRoot } = await seedValidationFixture();
  const repositoryPolicy = JSON.parse(
    await fs.readFile('tooling/configs/qa/oss-release.data.json', 'utf8')
  );
  const asset = repositoryPolicy.dependencyLegal.bundledAssets.find(
    (entry: { id: string }) => entry.id === 'clark-x2'
  );
  if (!asset) throw new Error('The Clark legal metadata is missing.');
  const paths: string[] = [
    asset.licensePath,
    asset.noticePath,
    asset.provenancePath,
    ...asset.artifacts.map((entry: { path: string }) => entry.path),
  ];
  const originals = new Map<string, Buffer>();
  for (const file of paths) {
    const bytes = await fs.readFile(file);
    originals.set(file, bytes);
    await fs.mkdir(path.dirname(path.join(repoRoot, file)), { recursive: true });
    await fs.writeFile(path.join(repoRoot, file), bytes);
  }
  const policyPath = path.join(repoRoot, 'tooling/configs/qa/oss-release.data.json');
  const policy = JSON.parse(await fs.readFile(policyPath, 'utf8'));
  policy.dependencyLegal.bundledAssets = [asset];
  for (const [file, digest] of [
    [asset.licensePath, asset.licenseSha256],
    [asset.noticePath, asset.noticeSha256],
    [asset.provenancePath, asset.provenanceSha256],
  ])
    policy.legalFiles.push({ source: file, archivePath: file, sha256: digest });
  await fs.writeFile(policyPath, JSON.stringify(policy));
  await writeDependencyLegalClosure({
    closure,
    interfaceFont: TEST_INTERFACE_FONT,
    bundledAssets: [asset],
    outputRoot: repoRoot,
  });
  expect(await validateDependencyLegalClosure(repoRoot)).toEqual([]);
  for (const file of paths) {
    await fs.appendFile(path.join(repoRoot, file), '\nchanged');
    expect(
      (await validateDependencyLegalClosure(repoRoot)).some(
        (error: string) => error.includes('content drift') && error.includes(file)
      )
    ).toBe(true);
    await fs.writeFile(path.join(repoRoot, file), originals.get(file)!);
  }
  expect(await fs.readFile(path.join(repoRoot, asset.licensePath))).toEqual(
    originals.get(asset.licensePath)
  );
  expect(await fs.readFile(path.join(repoRoot, asset.noticePath))).toEqual(
    originals.get(asset.noticePath)
  );
});
