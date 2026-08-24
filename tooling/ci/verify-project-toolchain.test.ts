import fs from 'node:fs';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile, writeJson } from '../qa/core/test-helpers';
import { verifyProjectToolchain } from './verify-project-toolchain.mjs';

function createProjectToolchainFixture(prefix: string) {
  const root = createTempRoot(prefix);
  const lock = JSON.parse(fs.readFileSync('tooling/configs/ci/toolchain.lock.json', 'utf8'));
  writeJson(root, 'tooling/configs/ci/toolchain.lock.json', lock);
  writeJson(root, 'package-lock.json', JSON.parse(fs.readFileSync('package-lock.json', 'utf8')));
  writeJson(
    root,
    'tooling/test/mutation/package.json',
    JSON.parse(fs.readFileSync('tooling/test/mutation/package.json', 'utf8'))
  );
  writeJson(
    root,
    'tooling/test/mutation/package-lock.json',
    JSON.parse(fs.readFileSync('tooling/test/mutation/package-lock.json', 'utf8'))
  );
  for (const tool of Object.values(lock.projectToolchain) as Array<{ packagePath: string }>) {
    const packageJson = JSON.parse(fs.readFileSync(`${tool.packagePath}/package.json`, 'utf8'));
    writeJson(root, `${tool.packagePath}/package.json`, packageJson);
  }
  writeJson(
    root,
    `${lock.dependencyGraph.packagePath}/package.json`,
    JSON.parse(fs.readFileSync(`${lock.dependencyGraph.packagePath}/package.json`, 'utf8'))
  );
  for (const entry of [
    'node_modules/oxfmt/bin/oxfmt',
    'node_modules/oxlint/bin/oxlint',
    'node_modules/oxlint-tsgolint/bin/tsgolint.js',
    'node_modules/@typescript/old/lib/typescript.js',
    'node_modules/typescript/lib/typescript.js',
    'node_modules/@typescript/native/bin/tsc',
  ]) {
    writeFile(root, entry, 'fixture');
  }
  writeFile(
    root,
    'node_modules/typescript/lib/typescript.js',
    `module.exports = { version: '${lock.projectToolchain.typescriptCompilerApi.version}' };`
  );
  return root;
}

it('binds installed packages, aliases, entrypoints, and the TS6 runtime to the machine lock', () => {
  expect(verifyProjectToolchain()).toMatchObject({
    dependencyCruiserVersion: '18.2.0',
    mutationTypescriptVersion: '6.0.3',
    toolCount: 8,
    typescriptCompilerApiVersion: '6.0.3',
  });
});

it('fails closed when dependency-cruiser drifts from the dependency graph lock', () => {
  const root = createProjectToolchainFixture('dependency-cruiser-drift');
  const packagePath = `${root}/node_modules/dependency-cruiser/package.json`;
  const drifted = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  drifted.version = '0.0.0';
  writeJson(root, 'node_modules/dependency-cruiser/package.json', drifted);

  expect(() => verifyProjectToolchain({ cwd: root })).toThrow('dependencyCruiser version drift');
});

it('fails closed when an installed project tool drifts from the machine lock', () => {
  const root = createProjectToolchainFixture('project-toolchain-drift');
  const drifted = JSON.parse(fs.readFileSync(`${root}/node_modules/oxlint/package.json`, 'utf8'));
  drifted.version = '0.0.0';
  writeJson(root, 'node_modules/oxlint/package.json', drifted);

  expect(() => verifyProjectToolchain({ cwd: root })).toThrow('oxlint version drift');
});

it('fails closed when the isolated mutation runner TypeScript drifts from the project lock', () => {
  const root = createProjectToolchainFixture('mutation-typescript-drift');
  const mutationPackagePath = `${root}/tooling/test/mutation/package.json`;
  const mutationPackage = JSON.parse(fs.readFileSync(mutationPackagePath, 'utf8'));
  mutationPackage.devDependencies.typescript = 'npm:@typescript/typescript6@0.0.0';
  fs.writeFileSync(mutationPackagePath, `${JSON.stringify(mutationPackage, null, 2)}\n`);
  expect(() => verifyProjectToolchain({ cwd: root })).toThrow(
    'Mutation TypeScript authority drift'
  );
});
