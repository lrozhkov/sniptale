import fs from 'node:fs';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile, writeJson } from '../qa/core/test-helpers';
import { verifyProjectToolchain } from './verify-project-toolchain.mjs';

it('binds installed packages, aliases, entrypoints, and the TS6 runtime to the machine lock', () => {
  expect(verifyProjectToolchain()).toMatchObject({
    toolCount: 7,
    typescriptCompilerApiVersion: '6.0.3',
  });
});

it('fails closed when an installed project tool drifts from the machine lock', () => {
  const root = createTempRoot('project-toolchain-drift');
  writeJson(
    root,
    'tooling/configs/ci/toolchain.lock.json',
    JSON.parse(fs.readFileSync('tooling/configs/ci/toolchain.lock.json', 'utf8'))
  );
  const projectLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  writeJson(root, 'package-lock.json', projectLock);

  for (const tool of Object.values(
    JSON.parse(fs.readFileSync('tooling/configs/ci/toolchain.lock.json', 'utf8')).projectToolchain
  ) as Array<{ packagePath: string }>) {
    const packageJson = JSON.parse(fs.readFileSync(`${tool.packagePath}/package.json`, 'utf8'));
    writeJson(root, `${tool.packagePath}/package.json`, packageJson);
  }
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
  const drifted = JSON.parse(fs.readFileSync(`${root}/node_modules/oxlint/package.json`, 'utf8'));
  drifted.version = '0.0.0';
  writeJson(root, 'node_modules/oxlint/package.json', drifted);

  expect(() => verifyProjectToolchain({ cwd: root })).toThrow('oxlint version drift');
});
