import { spawnSync } from 'node:child_process';

const GIT_BATCH_MAX_BUFFER = 64 * 1024 * 1024;

function resolveGitExecutable() {
  return process.platform === 'win32' ? 'git.exe' : 'git';
}

export function readHeadFileTexts(relativePaths, { spawnSyncImpl = spawnSync } = {}) {
  if (relativePaths.length === 0) {
    return new Map();
  }

  const sources = new Map();
  for (const relativePath of relativePaths) {
    const result = spawnSyncImpl(resolveGitExecutable(), ['show', `HEAD:${relativePath}`], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: GIT_BATCH_MAX_BUFFER,
    });

    sources.set(
      relativePath,
      result.status === 0 && !result.error && typeof result.stdout === 'string'
        ? result.stdout
        : null
    );
  }

  return sources;
}

export function createHeadFileTextResolver(relativePaths, options = {}) {
  const sources = readHeadFileTexts(relativePaths, options);
  return (relativePath) => sources.get(relativePath) ?? null;
}
