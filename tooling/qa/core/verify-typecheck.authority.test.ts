import fs from 'node:fs';

import { expect, it } from 'vitest';

import { createTypecheckArguments } from './verify-typecheck.mjs';
import { TYPECHECK_CHECKERS } from './typescript-cli.mjs';

it('uses only the TypeScript 7 native package as the canonical CLI', () => {
  const source = fs.readFileSync('tooling/qa/core/verify-typecheck.mjs', 'utf8');

  expect(source).toContain('resolveCanonicalTypeScriptEntry');
  expect(source).not.toContain('node_modules/typescript/lib/tsc');
  expect(source).not.toContain('@typescript/native-preview');
});

it('caps resource-profile checker counts for full and affected typechecks', () => {
  expect(TYPECHECK_CHECKERS).toEqual({ affected: 2, full: 4 });
  expect(createTypecheckArguments({ checkerCount: TYPECHECK_CHECKERS.full })).toEqual([
    '--checkers',
    '4',
  ]);
  expect(
    createTypecheckArguments({
      checkerCount: TYPECHECK_CHECKERS.affected,
      projectPath: '.tmp/project/tsconfig.json',
    })
  ).toEqual(['--checkers', '2', '--project', '.tmp/project/tsconfig.json']);
});

it('keeps unchecked side-effect import validation enabled in both root configs', () => {
  const rootConfig = fs.readFileSync('tsconfig.json', 'utf8');
  const nodeConfig = fs.readFileSync('tsconfig.node.json', 'utf8');

  expect(rootConfig).toContain('"noUncheckedSideEffectImports": true');
  expect(nodeConfig).toContain('"noUncheckedSideEffectImports": true');
});
