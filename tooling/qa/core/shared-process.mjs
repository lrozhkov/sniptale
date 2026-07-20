import { spawnSync } from 'node:child_process';

import { collectSandboxStagedFiles } from './git-fallback.mjs';
import { normalizeSyncProcessResult } from '../runtime/sync-process-result.mjs';
import {
  fromRelativePath,
  isIgnoredRelativePath,
  repoRoot,
  toRelativePath,
} from './shared-paths.mjs';

const DEFAULT_COMMAND_BUFFER_BYTES = 64 * 1024 * 1024;

export function collectStagedFiles({
  spawnSyncImpl = spawnSync,
  sandboxFallback = collectSandboxStagedFiles,
} = {}) {
  const gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';
  const result = normalizeSyncProcessResult(
    spawnSyncImpl(gitExecutable, ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
  );
  if (result.error?.code === 'EPERM') {
    return sandboxFallback(repoRoot);
  }
  if (result.error && result.status == null) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Unable to read staged files');
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean)
    .map(toRelativePath)
    .filter((file) => !isIgnoredRelativePath(file));
}

function getNpmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function runNpm(args, options = {}) {
  return runCommand(getNpmExecutable(), args, options);
}

export function runRepoNodeEntry(entryPath, args = [], options = {}) {
  return runCommand(process.execPath, [fromRelativePath(entryPath), ...args], options);
}

function mergeCommandEnvironment(overrides = {}) {
  const environment = { ...process.env };

  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) {
      delete environment[key];
      continue;
    }

    environment[key] = value;
  }

  return environment;
}

export function runCommand(command, args, options = {}) {
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  const result = normalizeSyncProcessResult(
    spawnSyncImpl(command, args, {
      cwd: options.cwd ?? repoRoot,
      encoding: 'utf8',
      env: mergeCommandEnvironment(options.env),
      maxBuffer: options.maxBuffer ?? DEFAULT_COMMAND_BUFFER_BYTES,
      stdio: options.stdio ?? 'pipe',
    })
  );

  if (result.error && result.status == null) {
    throw result.error;
  }
  return result;
}
