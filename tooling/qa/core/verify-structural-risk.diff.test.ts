import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, initGitRepo, runGit, writeFile } from './test-helpers';

it('analyzes only behavioral current-diff files and has no implicit repo-wide mode', () => {
  const root = createTempRoot('structural-risk-diff-');
  initGitRepo(root);
  writeFile(root, 'package.json', '{"name":"structural-risk-diff","type":"module"}\n');
  writeFile(root, 'unchanged-god.ts', `${'export const stable = 1;\n'.repeat(850)}`);
  writeFile(root, 'behavioral.ts', 'export function run() { return 1; }\n');
  writeFile(root, 'import-only.ts', "import './one.js';\n");
  writeFile(root, 'mock-only.test.ts', "vi.mock('./one.js');\n");
  writeFile(root, 'rename-source.ts', 'export const renamed = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'initial');

  writeFile(root, 'behavioral.ts', 'export function run() { if (true) return 2; return 1; }\n');
  writeFile(root, 'import-only.ts', "import './two.js';\n");
  writeFile(root, 'mock-only.test.ts', "vi.mock('./two.js');\n");
  runGit(root, 'mv', 'rename-source.ts', 'rename-target.ts');
  writeFile(root, 'added.ts', 'export function added() { return 1; }\n');

  const moduleUrl = pathToFileURL(path.resolve('tooling/qa/core/verify-structural-risk.mjs')).href;
  const source = `
    import { runStructuralRiskCheck } from ${JSON.stringify(moduleUrl)};
    const result = runStructuralRiskCheck();
    process.stdout.write(JSON.stringify({ files: result.files, scope: result.report.scope }));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: root,
    encoding: 'utf8',
  });
  const result = JSON.parse(output) as { files: string[]; scope: string };

  expect(result.scope).toBe('current-diff');
  expect(result.files).toEqual(['added.ts', 'behavioral.ts']);
  expect(result.files).not.toContain('unchanged-god.ts');
  expect(result.files).not.toContain('import-only.ts');
  expect(result.files).not.toContain('mock-only.test.ts');
  expect(result.files).not.toContain('rename-target.ts');
});

it('reports skip when the diff contains only import, mock, and rename changes', () => {
  const root = createTempRoot('structural-risk-skip-');
  initGitRepo(root);
  writeFile(root, 'package.json', '{"name":"structural-risk-skip","type":"module"}\n');
  writeFile(root, 'import-only.ts', "import './one.js';\n");
  writeFile(root, 'mock-only.test.ts', "vi.mock('./one.js');\n");
  writeFile(root, 'rename-source.ts', 'export const renamed = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'initial');

  writeFile(root, 'import-only.ts', "import './two.js';\n");
  writeFile(root, 'mock-only.test.ts', "vi.mock('./two.js');\n");
  runGit(root, 'mv', 'rename-source.ts', 'rename-target.ts');

  const moduleUrl = pathToFileURL(path.resolve('tooling/qa/core/verify-structural-risk.mjs')).href;
  const source = `
    import { runStructuralRiskCheck } from ${JSON.stringify(moduleUrl)};
    const result = runStructuralRiskCheck();
    process.stdout.write(JSON.stringify({ files: result.files, skipped: result.skipped }));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: root,
    encoding: 'utf8',
  });

  expect(JSON.parse(output)).toEqual({ files: [], skipped: true });
});

it('does not expose repo-wide or raw JSON modes from the enforcement entrypoint', () => {
  const source = fs.readFileSync('tooling/qa/core/verify-structural-risk.mjs', 'utf8');
  expect(source).not.toContain("scope === 'repo-wide'");
  expect(source).not.toContain("argv.includes('--json')");
});
