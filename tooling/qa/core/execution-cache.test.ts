import { expect, it } from 'vitest';

import { createTempRoot, withCwd, writeFile } from './test-helpers';

it('reuses an execution cache entry when mode, inputs, and fingerprint match', async () => {
  const root = createTempRoot('execution-cache-');
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');
  writeFile(root, 'config.json', '{"flag":true}\n');

  const result = await withCwd(root, async () => {
    const module = await import('./execution-cache.mjs');
    module.recordSuccessfulExecution({
      cwd: root,
      tool: 'verify-example.mjs',
      mode: 'repo-wide',
      source: 'focused',
      targetFiles: ['src/example.ts'],
      configFiles: ['config.json'],
      keyInputs: { expandedFiles: ['src/example.ts'] },
    });

    return module.resolveReusableExecution({
      cwd: root,
      tool: 'verify-example.mjs',
      mode: 'repo-wide',
      targetFiles: ['src/example.ts'],
      configFiles: ['config.json'],
      keyInputs: { expandedFiles: ['src/example.ts'] },
    });
  });

  expect(result).toEqual({
    matched: true,
    source: 'focused',
  });
});

it('invalidates an execution cache entry when required inputs change', async () => {
  const root = createTempRoot('execution-cache-inputs-');
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./execution-cache.mjs');
    module.recordSuccessfulExecution({
      cwd: root,
      tool: 'verify-example.mjs',
      mode: 'repo-wide',
      targetFiles: ['src/example.ts'],
      keyInputs: { expandedFiles: ['src/example.ts'] },
    });

    return module.resolveReusableExecution({
      cwd: root,
      tool: 'verify-example.mjs',
      mode: 'repo-wide',
      targetFiles: ['src/example.ts'],
      keyInputs: { expandedFiles: ['src/other.ts'] },
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'required execution inputs changed',
  });
});

it('invalidates an execution cache entry when the workspace fingerprint changes', async () => {
  const root = createTempRoot('execution-cache-fingerprint-');
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./execution-cache.mjs');
    module.recordSuccessfulExecution({
      cwd: root,
      tool: 'verify-example.mjs',
      mode: 'repo-wide',
      targetFiles: ['src/example.ts'],
    });
    writeFile(root, 'src/example.ts', 'export const value = 2;\n');

    return module.resolveReusableExecution({
      cwd: root,
      tool: 'verify-example.mjs',
      mode: 'repo-wide',
      targetFiles: ['src/example.ts'],
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'workspace state changed since the last successful execution',
  });
});
