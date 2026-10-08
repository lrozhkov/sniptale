import fs from 'node:fs';

import { expect, it, vi } from 'vitest';
const normalization = vi.hoisted(() => vi.fn());
vi.mock('../../../../ci/mediabunny/normalize.mjs', () => ({ normalizeMediabunny: normalization }));

import { createTypecheckArguments, runTypecheck, runTypecheckAsync } from './check.mjs';
import { TYPECHECK_CHECKERS } from '../../../analysis/source/typescript-cli.mjs';

it('uses only the TypeScript 7 native package as the canonical CLI', () => {
  const source = fs.readFileSync('tooling/qa/proof/typecheck/execution/check.mjs', 'utf8');

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

it('rejects unverified installed declarations before sync and async typecheck consumers run', async () => {
  normalization.mockImplementation(() => {
    throw new Error('unverified Mediabunny');
  });
  expect(() => runTypecheck({ cwd: '/unverified-fixture' })).toThrow('unverified Mediabunny');
  await expect(
    runTypecheckAsync({
      cwd: '/unverified-fixture',
      mode: 'affected',
      targetFiles: ['apps/extension/src/workflows/video-review/media-output.ts'],
    })
  ).rejects.toThrow('unverified Mediabunny');
  expect(normalization).toHaveBeenCalledWith({ root: '/unverified-fixture', check: true });
  normalization.mockReset();
});
