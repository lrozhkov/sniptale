import { expect, it, vi } from 'vitest';

import { collectStagedFiles, runCommand } from './shared-process.mjs';

it('captures diagnostic output beyond the child-process default buffer', () => {
  const result = runCommand(process.execPath, [
    '-e',
    "process.stdout.write('x'.repeat(2 * 1024 * 1024))",
  ]);

  expect(result.status).toBe(0);
  expect(result.stdout).toHaveLength(2 * 1024 * 1024);
});

it('trusts status and output when the sandbox attaches a false EPERM', () => {
  const error = Object.assign(new Error('spawnSync git EPERM'), { code: 'EPERM' });
  const result = runCommand('git', ['status'], {
    spawnSyncImpl: () => ({
      error,
      status: 0,
      stdout: 'authoritative output',
      stderr: '',
    }),
  });

  expect(result).toMatchObject({
    error: undefined,
    status: 0,
    stdout: 'authoritative output',
    stderr: '',
  });
});

it('keeps integer-status staged-file EPERM results authoritative', () => {
  const error = Object.assign(new Error('spawnSync git EPERM'), { code: 'EPERM' });
  const spawnSyncImpl = vi
    .fn()
    .mockReturnValueOnce({ error, status: 0, stdout: 'src/example.ts\n', stderr: '' })
    .mockReturnValueOnce({ error, status: 1, stdout: '', stderr: 'fatal staged diff' });

  expect(collectStagedFiles({ spawnSyncImpl })).toEqual(['src/example.ts']);
  expect(() => collectStagedFiles({ spawnSyncImpl })).toThrow('fatal staged diff');
});

it('uses staged-file fallback only when EPERM has no integer status', () => {
  const error = Object.assign(new Error('spawnSync git EPERM'), { code: 'EPERM' });
  const sandboxFallback = vi.fn(() => ['fallback.ts']);

  expect(
    collectStagedFiles({
      sandboxFallback,
      spawnSyncImpl: () => ({ error, status: null, stdout: '', stderr: '' }),
    })
  ).toEqual(['fallback.ts']);
  expect(sandboxFallback).toHaveBeenCalledOnce();
});
