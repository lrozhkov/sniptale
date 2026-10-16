import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { generateDependencyLegalClosure } from './index.mjs';
import { createLegalFixture, TEST_INTERFACE_FONT } from './test-support';
import { writeDependencyLegalClosure } from './output.mjs';
import { validateDependencyLegalClosure } from './validation.mjs';

function sha256(contents: string) {
  return createHash('sha256').update(contents).digest('hex');
}

async function seedBaseLegalFiles(repoRoot: string) {
  const baseLegal = new Map([
    ['LICENSE', 'AGPL fixture\n'],
    ['LICENSES/OFL-1.1.txt', 'OFL fixture\n'],
    ['packages/ui/src/styles/golos-ui/LICENSE.txt', 'Golos OFL fixture\n'],
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
    archivePath: documentFont.licensePath,
    source: documentFont.licensePath,
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
