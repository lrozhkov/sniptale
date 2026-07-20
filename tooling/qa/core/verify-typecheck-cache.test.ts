import { expect, it } from 'vitest';

import { createTempRoot, withCwd, writeFile, writeJson } from './test-helpers';

it('reuses the cached typecheck state when the workspace fingerprint matches', async () => {
  const root = createTempRoot('verify-typecheck-cache-');
  writeJson(root, 'tsconfig.json', { compilerOptions: { strict: true }, include: ['src'] });
  writeJson(root, 'tsconfig.node.json', { compilerOptions: { composite: true } });
  writeFile(root, 'apps/extension/vite.config.ts', 'export default {};\n');
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./verify-typecheck-cache.mjs');
    module.recordSuccessfulTypecheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
      source: 'focused',
    });
    return module.resolveReusableTypecheckState({
      cwd: root,
      targetFiles: ['src/example.ts'],
    });
  });

  expect(result).toEqual({
    matched: true,
    source: 'focused',
  });
});

it('invalidates the cached typecheck state after a source-file change', async () => {
  const root = createTempRoot('verify-typecheck-cache-source-');
  writeJson(root, 'tsconfig.json', { compilerOptions: { strict: true }, include: ['src'] });
  writeJson(root, 'tsconfig.node.json', { compilerOptions: { composite: true } });
  writeFile(root, 'apps/extension/vite.config.ts', 'export default {};\n');
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./verify-typecheck-cache.mjs');
    module.recordSuccessfulTypecheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
      source: 'focused',
    });
    writeFile(root, 'src/example.ts', 'export const value = 2;\n');
    return module.resolveReusableTypecheckState({
      cwd: root,
      targetFiles: ['src/example.ts'],
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'workspace state changed since the last successful typecheck',
  });
});

it('invalidates the cached typecheck state after a config change', async () => {
  const root = createTempRoot('verify-typecheck-cache-config-');
  writeJson(root, 'tsconfig.json', { compilerOptions: { strict: true }, include: ['src'] });
  writeJson(root, 'tsconfig.node.json', { compilerOptions: { composite: true } });
  writeFile(root, 'apps/extension/vite.config.ts', 'export default {};\n');
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./verify-typecheck-cache.mjs');
    module.recordSuccessfulTypecheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
      source: 'focused',
    });
    writeJson(root, 'tsconfig.node.json', { compilerOptions: { composite: false } });
    return module.resolveReusableTypecheckState({
      cwd: root,
      targetFiles: ['src/example.ts'],
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'workspace state changed since the last successful typecheck',
  });
});

it('invalidates the cached typecheck state when the checked project set changes', async () => {
  const root = createTempRoot('verify-typecheck-cache-projects-');
  writeJson(root, 'tsconfig.json', { compilerOptions: { strict: true }, include: ['src'] });
  writeJson(root, 'tsconfig.node.json', { compilerOptions: { composite: true } });
  writeFile(root, 'apps/extension/vite.config.ts', 'export default {};\n');
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./verify-typecheck-cache.mjs');
    module.recordSuccessfulTypecheck({
      checkedProjectIds: ['popup', 'popup-tests'],
      cwd: root,
      mode: 'affected',
      targetFiles: ['src/example.ts'],
      source: 'focused',
    });
    return module.resolveReusableTypecheckState({
      checkedProjectIds: ['content', 'content-tests'],
      cwd: root,
      mode: 'affected',
      targetFiles: ['src/example.ts'],
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'workspace state changed since the last successful typecheck',
  });
});
