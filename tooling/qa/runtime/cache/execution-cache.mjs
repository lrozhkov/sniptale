import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const EXECUTION_CACHE_DIR = '.tmp/qa/execution-cache';

function normalizeRelativePath(file) {
  return file.split(path.sep).join(path.posix.sep);
}

function collectFingerprintFiles({ targetFiles = [], configFiles = [] } = {}) {
  return [
    ...new Set([
      ...targetFiles.map(normalizeRelativePath),
      ...configFiles.map(normalizeRelativePath),
    ]),
  ].sort();
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortValue(nestedValue)])
    );
  }

  return value;
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function buildFingerprint(cwd, files) {
  const hash = crypto.createHash('sha256');

  for (const file of files) {
    const absolutePath = path.join(cwd, file);
    hash.update(file);
    hash.update('\0');

    if (!fs.existsSync(absolutePath)) {
      hash.update('missing');
      hash.update('\0');
      continue;
    }

    hash.update('file');
    hash.update('\0');
    hash.update(fs.readFileSync(absolutePath));
    hash.update('\0');
  }

  return hash.digest('hex');
}

function resolveCachePath(cwd, tool) {
  return path.join(cwd, EXECUTION_CACHE_DIR, `${tool}.json`);
}

function readExecutionCache(cwd, tool) {
  const cachePath = resolveCachePath(cwd, tool);
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

export function createExecutionFingerprint({
  cwd = process.cwd(),
  targetFiles = [],
  configFiles = [],
} = {}) {
  const files = collectFingerprintFiles({ targetFiles, configFiles });

  return {
    files,
    fingerprint: buildFingerprint(cwd, files),
  };
}

export function recordSuccessfulExecution({
  cwd = process.cwd(),
  tool,
  mode,
  source = 'unknown',
  targetFiles = [],
  configFiles = [],
  keyInputs = {},
} = {}) {
  const state = createExecutionFingerprint({ cwd, targetFiles, configFiles });
  const cachePath = resolveCachePath(cwd, tool);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  const record = {
    tool,
    mode,
    source,
    fingerprint: state.fingerprint,
    files: state.files,
    keyInputs: sortValue(keyInputs),
    recordedAt: new Date().toISOString(),
  };
  fs.writeFileSync(cachePath, `${JSON.stringify(record, null, 2)}\n`);

  return record;
}

export function resolveReusableExecution({
  cwd = process.cwd(),
  tool,
  mode,
  targetFiles = [],
  configFiles = [],
  keyInputs = {},
} = {}) {
  const cachedState = readExecutionCache(cwd, tool);
  if (!cachedState) {
    return {
      matched: false,
      reason: 'no cached execution state',
    };
  }

  if (cachedState.mode !== mode) {
    return {
      matched: false,
      reason: 'required execution mode changed',
    };
  }

  if (stableStringify(cachedState.keyInputs ?? {}) !== stableStringify(keyInputs)) {
    return {
      matched: false,
      reason: 'required execution inputs changed',
    };
  }

  const currentState = createExecutionFingerprint({ cwd, targetFiles, configFiles });
  if (cachedState.fingerprint !== currentState.fingerprint) {
    return {
      matched: false,
      reason: 'workspace state changed since the last successful execution',
    };
  }

  return {
    matched: true,
    source: typeof cachedState.source === 'string' ? cachedState.source : 'unknown',
  };
}
