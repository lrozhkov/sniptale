import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { expect, it } from 'vitest';

import { createTempRoot, withCwd, writeFile } from './test-helpers';
import { importSonarjsVerifier, writeSonarjsTsconfig } from './verify-sonarjs.test-support';

const repoRoot = process.cwd();
const verifierScript = path.join(repoRoot, 'tooling/qa/core/verify-sonarjs.mjs');

it('passes a clean production fixture', async () => {
  const root = createTempRoot('verify-sonarjs-clean-');
  writeSonarjsTsconfig(root);
  writeFile(
    root,
    'apps/extension/src/clean.ts',
    'export const total = [1, 2, 3].reduce((sum, item) => sum + item, 0);\n'
  );
  const verifier = await importSonarjsVerifier(root);

  const result = await withCwd(root, () => verifier.runSonarjsCheck({ scope: 'repo-wide' }));

  expect(result).toEqual({
    files: ['apps/extension/src/clean.ts'],
    skipped: false,
    violations: [],
  });
});

it('enables every curated hardfail rule against minimal fixtures', async () => {
  const root = createTempRoot('verify-sonarjs-rules-');
  writeSonarjsTsconfig(root);
  writeFile(
    root,
    'apps/extension/src/all.ts',
    [
      'function draw(width: number, height: number) { return width + height; }',
      'export function call(height: number, width: number) { return draw(height, width); }',
      "export const badCompare = '1' === 1;",
      'export const same = Math.random() > 0.5 ? 1 : 1;',
      'export function branches(value: string) {',
      "  if (value === 'a') { return 1; }",
      "  else if (value === 'b') { return 1; }",
      '  return 2;',
      '}',
      'type Source = { a: string; b: string };',
      "export type Duplicate = Pick<Source, 'a' | 'a'>;",
      'const values = [1, 2, 3];',
      'export const reversed = values.reverse()[0];',
      'let nested = 0;',
      'function accept(value: number) { return value; }',
      'export const nestedResult = accept((nested = 1));',
      'declare function getPromise(): Promise<number>;',
      'export function promiseTry() { try { getPromise(); } catch { return Promise.resolve(0); } }',
      'export const reduced = [1, 2, 3].reduce((sum, item) => sum + item);',
      '',
    ].join('\n')
  );
  const verifier = await importSonarjsVerifier(root);

  const result = await withCwd(root, () => verifier.runSonarjsCheck({ scope: 'repo-wide' }));

  expect(result.violations.map((violation) => violation.rule).sort()).toEqual(
    verifier.SONARJS_RULE_IDS.toSorted()
  );
});

it('ignores tests, specs, test-support, declarations, vendor, and non-src files', async () => {
  const root = createTempRoot('verify-sonarjs-scope-');
  writeSonarjsTsconfig(root);
  const productionFile = writeFile(
    root,
    'apps/extension/src/feature/prod.ts',
    'export const value = 1;\n'
  );
  writeFile(root, 'apps/extension/src/feature/prod.test.ts', 'export const value = 1;\n');
  writeFile(root, 'apps/extension/src/feature/prod.spec.ts', 'export const value = 1;\n');
  writeFile(root, 'apps/extension/src/feature/prod.test-support.ts', 'export const value = 1;\n');
  writeFile(root, 'apps/extension/src/feature/test-support.ts', 'export const value = 1;\n');
  writeFile(root, 'apps/extension/src/feature/types.d.ts', 'export type Value = string;\n');
  writeFile(root, 'apps/extension/src/vendor/fabric/adapter.mjs', 'export const adapter = 1;\n');
  writeFile(
    root,
    'apps/extension/src/editor/fabric/vendor/fabric/adapter.mjs',
    'export const adapter = 1;\n'
  );
  writeFile(root, 'tooling/tool.ts', 'export const value = 1;\n');
  const verifier = await importSonarjsVerifier(root);
  const seenFiles: string[] = [];

  const result = await withCwd(root, () =>
    verifier.runSonarjsCheck({
      lintFiles: async (files: string[]) => {
        seenFiles.push(...files);
        return [];
      },
      scope: 'repo-wide',
    })
  );

  expect(result.files).toEqual(['apps/extension/src/feature/prod.ts']);
  expect(seenFiles).toEqual([productionFile]);
});

it('keeps explicit file scope constrained to the selected production files', async () => {
  const root = createTempRoot('verify-sonarjs-explicit-');
  writeSonarjsTsconfig(root);
  const selected = writeFile(
    root,
    'apps/extension/src/selected.ts',
    'export const selected = 1;\n'
  );
  writeFile(root, 'apps/extension/src/other.ts', 'export const other = 1;\n');
  const verifier = await importSonarjsVerifier(root);

  const result = await withCwd(root, () =>
    verifier.runSonarjsCheck({
      files: [selected],
      lintFiles: async (files: string[]) =>
        files.map((file) => ({
          column: 1,
          file: path.relative(root, file).replaceAll(path.sep, '/'),
          line: 1,
          message: 'injected finding',
          rule: 'sonarjs/no-all-duplicated-branches',
        })),
    })
  );

  expect(result.files).toEqual(['apps/extension/src/selected.ts']);
  expect(result.violations).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/selected.ts',
      rule: 'sonarjs/no-all-duplicated-branches',
    }),
  ]);
});

it('keeps report-only CLI findings non-blocking', () => {
  const root = createTempRoot('verify-sonarjs-report-only-');
  writeSonarjsTsconfig(root);
  writeFile(
    root,
    'apps/extension/src/bad.ts',
    'export const same = Math.random() > 0.5 ? 1 : 1;\n'
  );

  const result = spawnSync(process.execPath, [verifierScript, '--repo-wide', '--report-only'], {
    cwd: root,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stderr).toContain('sonarjs/no-all-duplicated-branches');
});
