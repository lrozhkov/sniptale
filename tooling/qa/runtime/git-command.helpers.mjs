import { spawnSync } from 'node:child_process';

import { normalizeSyncProcessResult } from './sync-process-result.mjs';

const GIT_MAX_BUFFER = 64 * 1024 * 1024;

export function runGit(args, { spawnSyncImpl = spawnSync } = {}) {
  const executable = process.platform === 'win32' ? 'git.exe' : 'git';
  const result = normalizeSyncProcessResult(
    spawnSyncImpl(executable, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: GIT_MAX_BUFFER,
    })
  );

  if (result.error?.code === 'EPERM') {
    return {
      skipped: true,
      stdout: '',
      stderr: '',
      status: 0,
    };
  }

  if (result.error && result.status == null) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  }

  return {
    skipped: false,
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
  };
}
