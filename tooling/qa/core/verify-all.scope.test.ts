import { expect, it } from 'vitest';

import { classifyFullVerifyScope, resolveFullVerifyScope } from './verify-all.scope.mjs';
import { createTempRoot, importFresh, withCwd, writeFile } from './test-helpers';

it('uses owner-local affected mode for editor-only code changes', () => {
  const result = classifyFullVerifyScope({
    targetFiles: ['apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx'],
    codeFiles: ['apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx'],
  });

  expect(result.mode).toBe('owner-local-affected');
  expect(result.ownerScope?.name).toBe('editor');
  expect(result.relatedFiles).toEqual([
    'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
  ]);
});

it('uses owner-local affected mode for video-editor-only code changes', () => {
  const result = classifyFullVerifyScope({
    targetFiles: ['apps/extension/src/video-editor/state/store.ts'],
    codeFiles: ['apps/extension/src/video-editor/state/store.ts'],
  });

  expect(result.mode).toBe('owner-local-affected');
  expect(result.ownerScope?.name).toBe('video-editor');
  expect(result.relatedFiles).toEqual(['apps/extension/src/video-editor/state/store.ts']);
});

it('falls back to the full suite when a broad shared seam changes', () => {
  const result = classifyFullVerifyScope({
    targetFiles: [
      'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
      'src/shared/logger.ts',
    ],
    codeFiles: [
      'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
      'src/shared/logger.ts',
    ],
  });

  expect(result.mode).toBe('full-suite');
  expect(result.detail).toContain('src/shared/logger.ts');
});

it('keeps owner-local mode when docs change with an owner-local seam', () => {
  const result = classifyFullVerifyScope({
    targetFiles: [
      'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
      'docs/tooling/code-quality.md',
    ],
    codeFiles: ['apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx'],
  });

  expect(result.mode).toBe('owner-local-affected');
  expect(result.ownerScope?.name).toBe('editor');
  expect(result.relatedFiles).toEqual([
    'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
  ]);
});

it('keeps owner-local mode when AGENTS.md changes with an owner-local seam', () => {
  const result = classifyFullVerifyScope({
    targetFiles: ['AGENTS.md', 'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx'],
    codeFiles: ['apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx'],
  });

  expect(result.mode).toBe('owner-local-affected');
  expect(result.ownerScope?.name).toBe('editor');
});

it('still falls back to the full suite when test-infra changes with an owner-local seam', () => {
  const result = classifyFullVerifyScope({
    targetFiles: [
      'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
      'vitest.config.ts',
    ],
    codeFiles: [
      'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
      'vitest.config.ts',
    ],
  });

  expect(result.mode).toBe('full-suite');
  expect(result.detail).toContain('vitest.config.ts');
});

it('falls back to the full suite when owner-local changes do not include code files', () => {
  const result = classifyFullVerifyScope({
    targetFiles: ['apps/extension/src/editor/styles/editor-surface.css'],
    codeFiles: [],
  });

  expect(result.mode).toBe('full-suite');
  expect(result.detail).toContain('no changed code files');
});

it('filters harness files out of resolved product release scope', async () => {
  const root = createTempRoot('verify-all-product-scope-');
  writeFile(
    root,
    'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
    'export const value = 1;\n'
  );
  writeFile(root, 'tooling/qa/core/example.test.ts', 'export const testValue = 1;\n');

  const result = await withCwd(root, async () =>
    resolveFullVerifyScope({
      files: [
        'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
        'tooling/qa/core/example.test.ts',
      ],
    })
  );

  expect(result.targetFiles).toEqual([
    'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
  ]);
  expect(result.harnessTargetFiles).toEqual(['tooling/qa/core/example.test.ts']);
});

it('keeps deleted files in the diff scope without routing them to source readers', async () => {
  const root = createTempRoot('verify-all-deleted-target-');
  const existingFile = 'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx';
  const deletedFile = 'apps/extension/src/features/ai/schemas/ai-presets.ts';
  writeFile(root, existingFile, 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-all.scope.mjs')>(
      './verify-all.scope.mjs',
      import.meta.url
    );
    return module.resolveFullVerifyScope({ files: [existingFile, deletedFile] });
  });

  expect(result.targetFiles).toEqual([existingFile, deletedFile]);
  expect(result.codeFiles).toEqual([existingFile]);
});
