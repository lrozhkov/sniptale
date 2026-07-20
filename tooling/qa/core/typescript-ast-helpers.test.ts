import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createTypeScriptSourceFile,
  getFunctionLikeName,
  getNodeLine,
  toRootRelativePath,
} from './typescript-ast-helpers.mjs';

function createSource(text: string) {
  return createTypeScriptSourceFile('/virtual/sample.ts', text);
}

describe('typescript AST helpers', () => {
  it('reads declaration and variable-backed function names', () => {
    const sourceFile = createSource(`
      export function alpha() {}
      const beta = () => {};
      const gamma = function () {};
    `);
    const alpha = sourceFile.statements[0];
    const beta = sourceFile.statements[1].declarationList.declarations[0].initializer;
    const gamma = sourceFile.statements[2].declarationList.declarations[0].initializer;

    expect(getFunctionLikeName(alpha)).toBe('alpha');
    expect(getFunctionLikeName(beta)).toBe('beta');
    expect(getFunctionLikeName(gamma)).toBe('gamma');
  });

  it('returns null for anonymous inline callbacks', () => {
    const sourceFile = createSource(`promise.then(() => {});`);
    const callback = sourceFile.statements[0].expression.arguments[0];

    expect(getFunctionLikeName(callback)).toBe(null);
  });

  it('resolves one-based node lines', () => {
    const sourceFile = createSource(`const first = 1;\nconst second = 2;\n`);
    const declaration = sourceFile.statements[1].declarationList.declarations[0];

    expect(getNodeLine(sourceFile, declaration)).toBe(2);
  });

  it('normalizes root-relative paths with forward slashes', () => {
    const rootDir = path.join(path.sep, 'repo');
    const filePath = path.join(rootDir, 'tooling', 'qa', 'core', 'sample.mjs');

    expect(toRootRelativePath(rootDir, filePath)).toBe('tooling/qa/core/sample.mjs');
  });
});
