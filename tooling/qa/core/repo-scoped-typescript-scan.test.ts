import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from './test-helpers';
import {
  getNodeLine,
  normalizeRepoScopedPath,
  scanRepoScopedTypeScriptFiles,
} from './repo-scoped-typescript-scan.mjs';

it('normalizes repo-scoped src paths from absolute temp files', () => {
  const root = createTempRoot('repo-scoped-typescript-scan-');
  const file = writeFile(root, 'apps/extension/src/content/demo.ts', 'export const demo = true;\n');
  const visited: string[] = [];

  scanRepoScopedTypeScriptFiles([file], {
    targetFilePatterns: [/^apps\/extension\/src\/content\/.+\.[cm]?[jt]sx?$/u],
    visitFile: ({ normalizedPath }) => {
      visited.push(normalizedPath);
    },
  });

  expect(visited).toEqual(['apps/extension/src/content/demo.ts']);
  expect(normalizeRepoScopedPath(file)).toBe('apps/extension/src/content/demo.ts');
});

it('preserves the extension-app source root from absolute temp files', () => {
  const root = createTempRoot('repo-scoped-typescript-scan-app-');
  const file = writeFile(
    root,
    'apps/extension/src/popup/shell/app.tsx',
    'export const app = true;\n'
  );
  const visited: string[] = [];

  scanRepoScopedTypeScriptFiles([file], {
    targetFilePatterns: [/^apps\/extension\/src\/popup\/.+\.[cm]?[jt]sx?$/u],
    visitFile: ({ normalizedPath }) => {
      visited.push(normalizedPath);
    },
  });

  expect(visited).toEqual(['apps/extension/src/popup/shell/app.tsx']);
  expect(normalizeRepoScopedPath(file)).toBe('apps/extension/src/popup/shell/app.tsx');
});

it('skips test-like and allowlisted paths before parsing', () => {
  const root = createTempRoot('repo-scoped-typescript-scan-');
  const productionFile = writeFile(
    root,
    'apps/extension/src/content/demo.ts',
    'export const demo = true;\n'
  );
  const testFile = writeFile(
    root,
    'apps/extension/src/content/demo.test.ts',
    'export const demo = true;\n'
  );
  const allowlistedFile = writeFile(
    root,
    'apps/extension/src/content/parser/export-manager/file-modal-utils.ts',
    'export const demo = true;\n'
  );
  const visited: string[] = [];

  scanRepoScopedTypeScriptFiles([productionFile, testFile, allowlistedFile], {
    allowlistedRelativePaths: new Set([
      'apps/extension/src/content/parser/export-manager/file-modal-utils.ts',
    ]),
    targetFilePatterns: [/^apps\/extension\/src\/content\/.+\.[cm]?[jt]sx?$/u],
    visitFile: ({ relativePath, sourceFile }) => {
      visited.push(`${relativePath}:${getNodeLine(sourceFile, sourceFile)}`);
    },
  });

  expect(visited).toEqual([expect.stringContaining('apps/extension/src/content/demo.ts:1')]);
});
