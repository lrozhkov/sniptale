import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { afterEach, expect, it } from 'vitest';

const roots: string[] = [];
const runner = path.resolve('tooling/test/mutation/run-profile.mjs');

function fixtureCli() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-mutation-profile-'));
  roots.push(root);
  const cli = path.join(root, 'fake-stryker.mjs');
  fs.writeFileSync(
    cli,
    [
      "import fs from 'node:fs';",
      'const target = process.env.SNIPTALE_MUTATION_RESULT_FILE;',
      "fs.mkdirSync(new URL('.', `file://${target}`).pathname, { recursive: true });",
      'fs.writeFileSync(target, JSON.stringify({ files: {',
      "  'sample.ts': { mutants: [{ status: 'Killed' }, { status: 'Survived' }] },",
      '} }));',
    ].join('\n')
  );
  return { cli, root };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

it('writes a deterministic summary for a known mutation profile', () => {
  const { cli, root } = fixtureCli();
  execFileSync(process.execPath, [runner, 'persistence', 'fixture'], {
    cwd: root,
    env: { ...process.env, SNIPTALE_MUTATION_CLI: cli },
  });
  const summary = JSON.parse(
    fs.readFileSync(path.join(root, '.tmp/mutation/persistence/fixture/summary.json'), 'utf8')
  );
  expect(summary).toMatchObject({
    counts: { killed: 1, survived: 1, total: 2 },
    exitCode: 0,
    mutationScore: 50,
    profile: 'persistence',
    runLabel: 'fixture',
  });
});

it('fails before spawning Stryker for an unknown profile or unsafe label', () => {
  const { cli, root } = fixtureCli();
  const unknown = spawnSync(process.execPath, [runner, 'unknown', 'fixture'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SNIPTALE_MUTATION_CLI: cli },
  });
  expect(unknown.status).not.toBe(0);
  expect(unknown.stderr).toContain('Unknown mutation profile');
  const unsafe = spawnSync(process.execPath, [runner, 'persistence', '../escape'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SNIPTALE_MUTATION_CLI: cli },
  });
  expect(unsafe.status).not.toBe(0);
  expect(unsafe.stderr).toContain('Invalid mutation run label');
});

it('reports a controlled tool-unavailable error before spawning a missing CLI', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-mutation-missing-cli-'));
  roots.push(root);
  const result = spawnSync(process.execPath, [runner, 'persistence', 'fixture'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SNIPTALE_MUTATION_CLI: path.join(root, 'missing-stryker.mjs') },
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Mutation CLI is unavailable at <configured-path>');
  expect(result.stderr).not.toContain('MODULE_NOT_FOUND');
  expect(result.stderr).not.toContain(root);
});

it('reports a controlled error when a successful mutation run omits its report', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-mutation-missing-report-'));
  roots.push(root);
  const cli = path.join(root, 'fake-stryker.mjs');
  fs.writeFileSync(cli, 'process.exitCode = 0;\n');

  const result = spawnSync(process.execPath, [runner, 'persistence', 'fixture'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SNIPTALE_MUTATION_CLI: cli },
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Mutation report is missing after a successful runner exit.');
  expect(result.stderr).not.toContain(root);
  const summary = JSON.parse(
    fs.readFileSync(path.join(root, '.tmp/mutation/persistence/fixture/summary.json'), 'utf8')
  );
  expect(summary).toMatchObject({ exitCode: 1, mutationScore: null });
});
