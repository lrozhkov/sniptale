import { expect, it, vi } from 'vitest';

import { runGit } from './git-command.helpers.mjs';

function eperm() {
  return Object.assign(new Error('spawnSync git EPERM'), { code: 'EPERM' });
}

it('accepts a successful integer-status EPERM result', () => {
  expect(
    runGit(['status'], {
      spawnSyncImpl: () => ({
        error: eperm(),
        status: 0,
        stdout: 'authoritative',
        stderr: '',
      }),
    })
  ).toEqual({
    skipped: false,
    status: 0,
    stdout: 'authoritative',
    stderr: '',
  });
});

it('does not turn a failing integer-status EPERM result into success', () => {
  expect(() =>
    runGit(['status'], {
      spawnSyncImpl: () => ({
        error: eperm(),
        status: 1,
        stdout: '',
        stderr: 'fatal git failure',
      }),
    })
  ).toThrow('fatal git failure');
});

it('reports fallback only for EPERM without an integer status', () => {
  const spawnSyncImpl = vi.fn(() => ({
    error: eperm(),
    status: null,
    stdout: '',
    stderr: '',
  }));

  expect(runGit(['status'], { spawnSyncImpl })).toEqual({
    skipped: true,
    status: 0,
    stdout: '',
    stderr: '',
  });
});
