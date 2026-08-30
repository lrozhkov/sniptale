import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const VERSION_SET = new Set(['current', 'HEAD']);
const DEFAULT_MAX_STRONG_SNAPSHOTS = 64;

function normalizePath(filePath) {
  return path.resolve(filePath).replaceAll(path.sep, '/');
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function resolveSourceScriptKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
    return ts.ScriptKind.JS;
  }
  if (extension === '.json') return ts.ScriptKind.JSON;
  return ts.ScriptKind.TS;
}

function normalizeParseDiagnostics(sourceFile) {
  return Object.freeze(
    sourceFile.parseDiagnostics.map((diagnostic) =>
      Object.freeze({
        code: diagnostic.code,
        length: diagnostic.length ?? 0,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        start: diagnostic.start ?? 0,
      })
    )
  );
}

export function createSourceSnapshotStore({
  createSourceFile = ts.createSourceFile,
  maxStrongSnapshots = DEFAULT_MAX_STRONG_SNAPSHOTS,
  readFile = (filePath) => fs.readFileSync(filePath, 'utf8'),
} = {}) {
  if (!Number.isSafeInteger(maxStrongSnapshots) || maxStrongSnapshots < 1) {
    throw new Error('Source snapshot cache size must be a positive safe integer.');
  }
  const currentTexts = new Map();
  const snapshots = new Map();
  let evictionCount = 0;
  let parseCount = 0;
  let readCount = 0;

  function retainSnapshot(key, snapshot) {
    snapshots.set(key, snapshot);
    if (snapshots.size <= maxStrongSnapshots) return;
    const oldestKey = snapshots.keys().next().value;
    snapshots.delete(oldestKey);
    evictionCount += 1;
  }

  function ensureTextCached(version, normalizedFilePath, suppliedText) {
    if (suppliedText != null) return suppliedText;
    if (version !== 'current') {
      throw new Error(`HEAD source text must be supplied for ${normalizedFilePath}`);
    }
    if (!currentTexts.has(normalizedFilePath)) {
      currentTexts.set(normalizedFilePath, readFile(normalizedFilePath));
      readCount += 1;
    }
    return currentTexts.get(normalizedFilePath);
  }

  function get({
    filePath,
    scriptKind = resolveSourceScriptKind(filePath),
    text,
    version = 'current',
  }) {
    if (!VERSION_SET.has(version)) throw new Error(`Unsupported source version: ${version}`);
    const normalizedFilePath = normalizePath(filePath);
    const sourceText = ensureTextCached(version, normalizedFilePath, text);
    const contentDigest = hashText(sourceText);
    const key = `${version}\0${normalizedFilePath}\0${contentDigest}\0${scriptKind}`;
    const cached = snapshots.get(key);
    if (cached) {
      snapshots.delete(key);
      snapshots.set(key, cached);
      return cached;
    }

    const sourceFile = createSourceFile(
      normalizedFilePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );
    parseCount += 1;
    const snapshot = Object.freeze({
      contentDigest,
      filePath: normalizedFilePath,
      lines: Object.freeze(sourceText.split(/\r?\n/u)),
      parseDiagnostics: normalizeParseDiagnostics(sourceFile),
      scriptKind,
      sourceFile,
      text: sourceText,
      version,
    });
    retainSnapshot(key, snapshot);
    return snapshot;
  }

  return Object.freeze({
    get,
    getStats: () =>
      Object.freeze({ evictionCount, parseCount, readCount, snapshotCount: snapshots.size }),
  });
}

const runSourceSnapshotStore = createSourceSnapshotStore();

export function getSourceSnapshot(options) {
  return runSourceSnapshotStore.get(options);
}

export function assertSourceSnapshotParseable(snapshot, label = snapshot.filePath) {
  if (snapshot.parseDiagnostics.length === 0) return snapshot;
  const first = snapshot.parseDiagnostics[0];
  throw new Error(
    `Cannot analyze malformed source ${label}: TS${first.code} at offset ${first.start}: ${first.message}`
  );
}

export function getParseableSourceSnapshot(options) {
  return assertSourceSnapshotParseable(getSourceSnapshot(options));
}

export function getSourceSnapshotStats() {
  return runSourceSnapshotStore.getStats();
}
