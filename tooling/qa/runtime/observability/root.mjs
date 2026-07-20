import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { normalizeSyncProcessResult } from '../sync-process-result.mjs';
import { OBSERVABILITY_ROOT_ENV } from './constants.mjs';

function resolveGitTopLevel(directoryPath, spawnSyncImpl) {
  const result = normalizeSyncProcessResult(
    spawnSyncImpl(
      process.platform === 'win32' ? 'git.exe' : 'git',
      ['rev-parse', '--show-toplevel'],
      {
        cwd: directoryPath,
        encoding: 'utf8',
      }
    )
  );
  if (result.error || result.status !== 0) return null;
  const topLevel = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  return topLevel.length > 0 ? fs.realpathSync(topLevel) : null;
}

export function resolveObservabilityRoot({
  cwd = process.cwd(),
  environment = process.env,
  spawnSyncImpl = spawnSync,
} = {}) {
  const configuredRoot = environment[OBSERVABILITY_ROOT_ENV];
  if (configuredRoot !== undefined && !path.isAbsolute(configuredRoot)) {
    throw new Error(`${OBSERVABILITY_ROOT_ENV} must be an absolute Git worktree root`);
  }
  const candidate = fs.realpathSync(configuredRoot ?? cwd);
  if (
    !fs.statSync(candidate).isDirectory() ||
    resolveGitTopLevel(candidate, spawnSyncImpl) !== candidate
  ) {
    throw new Error(`${OBSERVABILITY_ROOT_ENV} must identify an existing Git worktree root`);
  }
  return candidate;
}
