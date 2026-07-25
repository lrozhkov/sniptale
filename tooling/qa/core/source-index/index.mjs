import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { parseSourceRecord } from './parser.mjs';
import { readSourceIndexCache, writeSourceIndexCache } from './persistence.mjs';

const SOURCE_INDEX_SCHEMA_VERSION = 2;
const DEFAULT_CACHE_RELATIVE_PATH = '.tmp/qa/source-index/import-export.json';
const TS_SOURCE_PATTERN = /\.(?:ts|tsx|cts|mts)$/u;
const IMPLEMENTATION_PATHS = [
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL('./parser.mjs', import.meta.url)),
  fileURLToPath(new URL('./persistence.mjs', import.meta.url)),
];
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function hashParts(parts) {
  const hash = crypto.createHash('sha256');
  for (const part of parts) {
    hash.update(part);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function normalizePath(value) {
  return value.replaceAll(path.sep, '/');
}

function collectWorkspaceConfigPaths(rootDir, tsConfigFilePath) {
  const candidates = [
    tsConfigFilePath,
    path.join(rootDir, 'package.json'),
    path.join(rootDir, 'package-lock.json'),
    path.join(rootDir, 'apps/extension/package.json'),
  ];
  const packagesRoot = path.join(rootDir, 'packages');
  if (fs.existsSync(packagesRoot)) {
    for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path.join(packagesRoot, entry.name, 'package.json'));
    }
  }
  return [...new Set(candidates)].sort();
}

function createConfigDigest({ compilerOptions, rootDir, tsConfigFilePath }) {
  const parts = [`typescript=${ts.version}`, JSON.stringify(compilerOptions)];
  for (const implementationPath of IMPLEMENTATION_PATHS) {
    parts.push(fs.readFileSync(implementationPath));
  }
  for (const configPath of collectWorkspaceConfigPaths(rootDir, tsConfigFilePath)) {
    parts.push(normalizePath(path.relative(rootDir, configPath)));
    parts.push(fs.existsSync(configPath) ? fs.readFileSync(configPath) : 'missing');
  }
  return hashParts(parts);
}

function parseTsConfig(tsConfigFilePath) {
  const rootDir = path.dirname(tsConfigFilePath);
  const config = ts.readConfigFile(tsConfigFilePath, ts.sys.readFile);
  if (config.error) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    rootDir,
    {},
    tsConfigFilePath
  );
  const blockingErrors = parsed.errors.filter((error) => error.code !== 18003);
  if (blockingErrors.length > 0) {
    throw new Error(
      blockingErrors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
        .join('\n')
    );
  }
  return { compilerOptions: parsed.options, fileNames: parsed.fileNames, rootDir };
}

function collectSources({ fileNames, rootDir }) {
  return fileNames
    .filter((absolutePath) => TS_SOURCE_PATTERN.test(absolutePath))
    .map((absolutePath) => ({
      absolutePath,
      file: normalizePath(path.relative(rootDir, absolutePath)),
      source: fs.readFileSync(absolutePath, 'utf8'),
    }))
    .filter(({ file }) => !file.startsWith('../'))
    .sort((left, right) => left.file.localeCompare(right.file));
}

function hasExactKeys(value, keys) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function createRecordIntegrityDigest({ digest, exports, file, usages }) {
  return hashParts([JSON.stringify({ digest, exports, file, usages })]);
}

function isValidCachedExport(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    hasExactKeys(value, ['exportName', 'kind']) &&
    typeof value.exportName === 'string' &&
    value.exportName.length > 0 &&
    typeof value.kind === 'string' &&
    value.kind.length > 0
  );
}

function isValidCachedUsage(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    hasExactKeys(value, ['target', 'names']) &&
    typeof value.target === 'string' &&
    value.target.length > 0 &&
    Array.isArray(value.names) &&
    value.names.length > 0 &&
    value.names.every((name) => typeof name === 'string' && name.length > 0)
  );
}

function isValidCachedRecord(record) {
  if (
    record == null ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    !hasExactKeys(record, ['digest', 'exports', 'file', 'integrityDigest', 'usages']) ||
    typeof record.file !== 'string' ||
    !SHA256_PATTERN.test(record.digest ?? '') ||
    !SHA256_PATTERN.test(record.integrityDigest ?? '') ||
    !Array.isArray(record.exports) ||
    !record.exports.every(isValidCachedExport) ||
    !Array.isArray(record.usages) ||
    !record.usages.every(isValidCachedUsage)
  ) {
    return false;
  }
  return record.integrityDigest === createRecordIntegrityDigest(record);
}

function isValidCachedIndex(cache, configDigest, inventoryDigest, files) {
  if (
    cache == null ||
    typeof cache !== 'object' ||
    Array.isArray(cache) ||
    !hasExactKeys(cache, ['configDigest', 'inventoryDigest', 'records', 'schemaVersion']) ||
    cache?.schemaVersion !== SOURCE_INDEX_SCHEMA_VERSION ||
    cache.configDigest !== configDigest ||
    cache.inventoryDigest !== inventoryDigest ||
    !Array.isArray(cache.records)
  ) {
    return false;
  }
  if (!cache.records.every(isValidCachedRecord)) return false;
  const cachedFiles = cache.records.map(({ file }) => file);
  return (
    cachedFiles.length === files.length && cachedFiles.every((file, index) => file === files[index])
  );
}

function resolveImports({
  absolutePath,
  compilerOptions,
  fileSet,
  imports,
  moduleResolutionCache,
  rootDir,
}) {
  const usages = [];
  for (const entry of imports) {
    const resolved = ts.resolveModuleName(
      entry.specifier,
      absolutePath,
      compilerOptions,
      ts.sys,
      moduleResolutionCache
    ).resolvedModule;
    if (!resolved) continue;
    const target = normalizePath(path.relative(rootDir, resolved.resolvedFileName));
    if (fileSet.has(target)) usages.push({ target, names: entry.names });
  }
  return usages;
}

function createRecord({ sourceEntry, compilerOptions, fileSet, moduleResolutionCache, rootDir }) {
  const digest = hashParts([sourceEntry.source]);
  const parsed = parseSourceRecord({ file: sourceEntry.file, source: sourceEntry.source });
  const record = {
    file: sourceEntry.file,
    digest,
    exports: parsed.exports,
    usages: resolveImports({
      absolutePath: sourceEntry.absolutePath,
      compilerOptions,
      fileSet,
      imports: parsed.imports,
      moduleResolutionCache,
      rootDir,
    }),
  };
  return { ...record, integrityDigest: createRecordIntegrityDigest(record) };
}

function createRecords({ cache, compilerOptions, rootDir, sources }) {
  const fileSet = new Set(sources.map(({ file }) => file));
  const cachedByFile = new Map(cache?.records?.map((record) => [record.file, record]) ?? []);
  const moduleResolutionCache = ts.createModuleResolutionCache(
    rootDir,
    (value) => value,
    compilerOptions
  );
  let parsedFileCount = 0;
  const records = sources.map((sourceEntry) => {
    const digest = hashParts([sourceEntry.source]);
    const cachedRecord = cachedByFile.get(sourceEntry.file);
    if (cachedRecord?.digest === digest) return cachedRecord;
    parsedFileCount += 1;
    return createRecord({ sourceEntry, compilerOptions, fileSet, moduleResolutionCache, rootDir });
  });
  return { parsedFileCount, records };
}

export function loadSourceIndex({ cachePath, tsConfigFilePath }) {
  const { compilerOptions, fileNames, rootDir } = parseTsConfig(tsConfigFilePath);
  const sources = collectSources({ fileNames, rootDir });
  const files = sources.map(({ file }) => file);
  const configDigest = createConfigDigest({ compilerOptions, rootDir, tsConfigFilePath });
  const inventoryDigest = hashParts(files);
  const resolvedCachePath = cachePath ?? path.join(rootDir, DEFAULT_CACHE_RELATIVE_PATH);
  const stored = readSourceIndexCache(resolvedCachePath);
  const cache = isValidCachedIndex(stored, configDigest, inventoryDigest, files) ? stored : null;
  const { parsedFileCount, records } = createRecords({ cache, compilerOptions, rootDir, sources });
  const cacheStatus = cache == null ? 'rebuilt' : parsedFileCount === 0 ? 'reused' : 'updated';

  if (cacheStatus !== 'reused') {
    writeSourceIndexCache(resolvedCachePath, {
      schemaVersion: SOURCE_INDEX_SCHEMA_VERSION,
      configDigest,
      inventoryDigest,
      records,
    });
  }
  return {
    records,
    rootDir,
    stats: {
      cacheStatus,
      parsedFileCount,
      reusedFileCount: records.length - parsedFileCount,
      sourceFileCount: records.length,
    },
  };
}
