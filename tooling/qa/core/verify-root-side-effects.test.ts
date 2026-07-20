import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectRootSideEffectViolations } from './verify-root-side-effects.mjs';

const tempDirs: string[] = [];

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-root-side-effects-'));
  tempDirs.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function writePolicy(root: string, entries: unknown[] = []) {
  const policyPath = path.join(root, 'tooling/configs/qa/root-side-effects.data.json');
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });
  fs.writeFileSync(policyPath, JSON.stringify({ allowedRoots: entries }, null, 2));
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags top-level executable statements in shared public root modules', () => {
  const root = createTempRoot();
  writePolicy(root);
  const file = writeFile(
    root,
    'apps/extension/src/features/video/project/index.ts',
    ["import { register } from './hydration';", 'register();', 'export const value = 1;'].join('\n')
  );

  expect(collectRootSideEffectViolations([file], { rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'root-side-effects',
      file: 'apps/extension/src/features/video/project/index.ts',
    }),
  ]);
});

it('flags top-level executable initializers in shared public root modules', () => {
  const root = createTempRoot();
  writePolicy(root);
  const file = writeFile(
    root,
    'apps/extension/src/features/video/project/index.ts',
    [
      "import { register } from './hydration';",
      'const initialized = register();',
      'export { initialized };',
    ].join('\n')
  );

  expect(collectRootSideEffectViolations([file], { rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'root-side-effects',
      file: 'apps/extension/src/features/video/project/index.ts',
    }),
  ]);
});

it('flags export-default executable roots in shared public modules', () => {
  const root = createTempRoot();
  writePolicy(root);
  const file = writeFile(
    root,
    'apps/extension/src/features/video/project/index.ts',
    ["import { register } from './hydration';", 'export default register();'].join('\n')
  );

  expect(collectRootSideEffectViolations([file], { rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'root-side-effects',
      file: 'apps/extension/src/features/video/project/index.ts',
    }),
  ]);
});

it('ignores shared leaf index files that are not public facades or same-name owner roots', () => {
  const root = createTempRoot();
  writePolicy(root);
  const file = writeFile(
    root,
    'apps/extension/src/platform/i18n/messages/common/index.ts',
    [
      "import { defineMessageSource } from './shared';",
      'export const commonMessages = defineMessageSource({});',
    ].join('\n')
  );

  expect(collectRootSideEffectViolations([file], { rootDir: root })).toEqual([]);
});

it('allows thin shared public roots without import-time execution', () => {
  const root = createTempRoot();
  writePolicy(root);
  const file = writeFile(
    root,
    'apps/extension/src/features/video/project/index.ts',
    "export { hydrateVideoProject } from './hydration';\n"
  );

  expect(collectRootSideEffectViolations([file], { rootDir: root })).toEqual([]);
});

it('allows explicit entry/init roots from the registry', () => {
  const root = createTempRoot();
  writePolicy(root, [
    {
      file: 'apps/extension/src/features/video/project/index.ts',
      owner: 'shared-video-project-entry',
      justification: 'This root intentionally performs import-time bootstrap.',
      reviewNote: 'Keep import-time execution confined to this explicit root.',
    },
  ]);
  const file = writeFile(
    root,
    'apps/extension/src/features/video/project/index.ts',
    ["import { register } from './hydration';", 'register();', 'export const value = 1;'].join('\n')
  );

  expect(collectRootSideEffectViolations([file], { rootDir: root })).toEqual([]);
});

it('flags stale root-side-effect allowlist targets', () => {
  const root = createTempRoot();
  writePolicy(root, [
    {
      file: 'apps/extension/src/features/video/project/missing.ts',
      owner: 'shared-video-project-entry',
      justification: 'This root intentionally performs import-time bootstrap.',
      reviewNote: 'Keep import-time execution confined to this explicit root.',
    },
  ]);
  const file = writeFile(
    root,
    'apps/extension/src/features/video/project/index.ts',
    ["import { register } from './hydration';", 'register();', 'export const value = 1;'].join('\n')
  );

  expect(collectRootSideEffectViolations([file], { rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'root-side-effects-policy-missing-target',
      file: 'tooling/configs/qa/root-side-effects.data.json',
    }),
    expect.objectContaining({
      rule: 'root-side-effects',
      file: 'apps/extension/src/features/video/project/index.ts',
    }),
  ]);
});
