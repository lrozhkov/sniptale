import { spawnSync } from 'node:child_process';
import { normalizeSyncProcessResult } from '../../runtime/process/sync-process-result.mjs';
import { collectTaskTopologySourceByTarget } from '../../composition/preflight/task-topology-lineage.mjs';

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

export function readRevisionFileTexts(
  relativePaths,
  { revision = 'HEAD', root = process.cwd(), spawnSyncImpl = spawnSync } = {}
) {
  if (relativePaths.length === 0) {
    return new Map();
  }

  const sources = new Map();
  for (const relativePath of relativePaths) {
    const result = normalizeSyncProcessResult(
      spawnSyncImpl(resolveGitExecutable(), ['show', `${revision}:${relativePath}`], {
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

export function readHeadFileTexts(relativePaths, options = {}) {
  return readRevisionFileTexts(relativePaths, { ...options, revision: 'HEAD' });
}

export function readRevisionFileText(relativePath, options = {}) {
  return readRevisionFileTexts([relativePath], options).get(relativePath) ?? null;
}

export function readHeadFileText(relativePath, options = {}) {
  return readHeadFileTexts([relativePath], options).get(relativePath) ?? null;
}

export function createHeadFileTextResolver(relativePaths, options = {}) {
  const lineage = collectTaskTopologySourceByTarget({ root: options.root ?? process.cwd() });
  const sourcePaths = relativePaths.map(
    (relativePath) => lineage.get(relativePath) ?? relativePath
  );
  const sources = readHeadFileTexts(sourcePaths, options);
  return (relativePath) => sources.get(lineage.get(relativePath) ?? relativePath) ?? null;
}
