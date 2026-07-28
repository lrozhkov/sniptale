import { spawnSync } from 'node:child_process';
import { normalizeSyncProcessResult } from '../runtime/sync-process-result.mjs';

const GIT_BATCH_MAX_BUFFER = 64 * 1024 * 1024;
const HEAD_CODE_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs'];

function resolveGitExecutable() {
  return process.platform === 'win32' ? 'git.exe' : 'git';
}

function runHeadQuery(args, acceptedStatuses, { root = process.cwd(), spawnSyncImpl = spawnSync }) {
  const result = normalizeSyncProcessResult(
    spawnSyncImpl(resolveGitExecutable(), args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: GIT_BATCH_MAX_BUFFER,
    })
  );
  if (result.error || !acceptedStatuses.has(result.status) || typeof result.stdout !== 'string') {
    return { complete: false, files: [] };
  }
  return {
    complete: true,
    files: result.stdout
      .split(/\r?\n/u)
      .map((line) => line.replace(/^HEAD:/u, ''))
      .filter(Boolean),
  };
}

export function listHeadCodeFilesContainingText(text, options = {}) {
  return runHeadQuery(
    ['grep', '-l', '-F', '-e', text, 'HEAD', '--', ...HEAD_CODE_GLOBS],
    new Set([0, 1]),
    options
  );
}

export function listHeadFilesUnderPath(relativePath, options = {}) {
  return runHeadQuery(
    ['ls-tree', '-r', '--name-only', 'HEAD', '--', relativePath],
    new Set([0]),
    options
  );
}

export function readHeadFileTexts(
  relativePaths,
  { root = process.cwd(), spawnSyncImpl = spawnSync } = {}
) {
  if (relativePaths.length === 0) {
    return new Map();
  }

  const sources = new Map();
  for (const relativePath of relativePaths) {
    const result = normalizeSyncProcessResult(
      spawnSyncImpl(resolveGitExecutable(), ['show', `HEAD:${relativePath}`], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: GIT_BATCH_MAX_BUFFER,
      })
    );

    sources.set(
      relativePath,
      result.status === 0 && !result.error && typeof result.stdout === 'string'
        ? result.stdout
        : null
    );
  }

  return sources;
}

export function readHeadFileText(relativePath, options = {}) {
  return readHeadFileTexts([relativePath], options).get(relativePath) ?? null;
}

export function createHeadFileTextResolver(relativePaths, options = {}) {
  const sources = readHeadFileTexts(relativePaths, options);
  return (relativePath) => sources.get(relativePath) ?? null;
}
