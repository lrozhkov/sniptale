import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { DEFAULT_LIMITS, DEFAULT_PATHS } from './constants.mjs';
import { sanitizeLogText, truncateUtf8 } from './sanitize.mjs';

const TRUNCATION_MARKER = '\n[qa-observability: log truncated]\n';

function resolveRoot(rootDir) {
  return path.resolve(rootDir ?? process.cwd());
}

export function resolveObservabilityPaths({ rootDir, runId, startedAt }) {
  const root = resolveRoot(rootDir);
  const day = startedAt.slice(0, 10);
  const runRelativePath = path.posix.join(DEFAULT_PATHS.runs, day, `${runId}.json`);
  const logRelativePath = path.posix.join(DEFAULT_PATHS.logs, day, `${runId}.log`);
  return {
    runRelativePath,
    logRelativePath,
    runPath: path.join(root, ...runRelativePath.split('/')),
    logPath: path.join(root, ...logRelativePath.split('/')),
  };
}

function ensurePrivateDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(directoryPath, 0o700);
  } catch {
    // why: chmod may be unsupported on a mounted Windows filesystem.
  }
}

function ensurePrivateFile(filePath) {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // why: chmod may be unsupported on a mounted Windows filesystem.
  }
}

function describeLog(logPath, { truncated, writtenBytes = 0 } = {}) {
  const contents = fs.existsSync(logPath) ? fs.readFileSync(logPath) : Buffer.alloc(0);
  return {
    writtenBytes,
    byteCount: contents.byteLength,
    digest: createHash('sha256').update(contents).digest('hex'),
    truncated: truncated ?? contents.toString('utf8').includes(TRUNCATION_MARKER.trim()),
  };
}

export function writeJsonAtomic(filePath, value, { createOnly = false } = {}) {
  writePrivateFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`, { createOnly });
}

function writePrivateFileAtomic(filePath, contents, { createOnly = false } = {}) {
  ensurePrivateDirectory(path.dirname(filePath));
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, contents, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    ensurePrivateFile(temporaryPath);
    if (createOnly) fs.linkSync(temporaryPath, filePath);
    else fs.renameSync(temporaryPath, filePath);
    ensurePrivateFile(filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function appendBoundedLog(
  logPath,
  value,
  { maximumBytes = DEFAULT_LIMITS.logBytes, repositoryRoot, repositoryRoots, sensitiveValues } = {}
) {
  ensurePrivateDirectory(path.dirname(logPath));
  const sanitized = sanitizeLogText(value, {
    repositoryRoot,
    repositoryRoots,
    sensitiveValues,
  });
  const existing = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
  const existingBytes = Buffer.byteLength(existing);
  if (existingBytes >= maximumBytes) {
    return describeLog(logPath, { truncated: true });
  }
  if (existingBytes > 0) {
    const existingTail = existing.slice(-TRUNCATION_MARKER.length - 8);
    if (existingTail.includes(TRUNCATION_MARKER.trim())) {
      return describeLog(logPath, { truncated: true });
    }
  }

  const markerBytes = Buffer.byteLength(TRUNCATION_MARKER);
  const availableBytes = maximumBytes - existingBytes;
  const bounded = truncateUtf8(sanitized, availableBytes);
  let output = bounded.text;
  if (bounded.truncated && availableBytes > markerBytes) {
    output = truncateUtf8(sanitized, availableBytes - markerBytes).text + TRUNCATION_MARKER;
  }
  writePrivateFileAtomic(logPath, existing + output);
  return describeLog(logPath, {
    writtenBytes: Buffer.byteLength(output),
    truncated: bounded.truncated,
  });
}

function listFilesWithSuffix(rootPath, suffix) {
  if (!fs.existsSync(rootPath)) return [];
  return fs
    .readdirSync(rootPath, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name))
    .sort();
}

export function listJsonFiles(rootPath) {
  return listFilesWithSuffix(rootPath, '.json');
}

export function listLogFiles(rootPath) {
  return listFilesWithSuffix(rootPath, '.log');
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function resolveRunsRoot(rootDir) {
  return path.join(resolveRoot(rootDir), ...DEFAULT_PATHS.runs.split('/'));
}

export function resolveLogsRoot(rootDir) {
  return path.join(resolveRoot(rootDir), ...DEFAULT_PATHS.logs.split('/'));
}
