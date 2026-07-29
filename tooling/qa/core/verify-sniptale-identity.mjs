import { execFile } from 'node:child_process';
import { readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import JSZip from 'jszip';

import { isExecutedAsScript, repoRoot } from './shared.mjs';
import { retiredIdentityKind } from './retired-identity.mjs';

const ARCHIVE_WORKER_ARGUMENT = '--inspect-identity-archive';
const ARCHIVE_WORKER_HEAP_MIB = 128;
const ARCHIVE_WORKER_TIMEOUT_MS = 30_000;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_COUNT = 4_096;
const MAX_ARCHIVE_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_COMPRESSION_RATIO = 200;
const EXCLUDED_PREFIXES = [
  '.cache/',
  '.git/',
  '.tmp/',
  'build/',
  'coverage/',
  'dist/',
  'node_modules/',
  'playwright-report/',
  'tasks/',
  'test-results/',
];
const RETIRED_EFFECT_VERSION = ['v', '4'].join('');
const EFFECT_V1_OWNER_PREFIXES = [
  'apps/extension/src/effect-runtime-sandbox/worker/interpreter/',
  'packages/runtime-contracts/src/effect-v1/',
];
const execFileAsync = promisify(execFile);

function decodeUtf8(bytes) {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function containsStandaloneRetiredEffectVersion(folded) {
  let offset = 0;
  while (offset < folded.length) {
    const versionIndex = folded.indexOf(RETIRED_EFFECT_VERSION, offset);
    if (versionIndex < 0) return false;
    const previous = folded[versionIndex - 1] ?? '';
    const next = folded[versionIndex + RETIRED_EFFECT_VERSION.length] ?? '';
    if (!/[a-z0-9_]/u.test(previous) && !/[a-z0-9_]/u.test(next)) return true;
    offset = versionIndex + 1;
  }
  return false;
}

function readCandidateBytes(path) {
  try {
    return { bytes: Buffer.from(readlinkSync(path)), isRegularFile: false };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error?.code !== 'EINVAL') throw error;
  }
  try {
    return { bytes: readFileSync(path), isRegularFile: true };
  } catch (error) {
    if (error?.code === 'EISDIR' || error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function candidatePathsAsync(root) {
  const runGit = async (args) => {
    const { stdout } = await execFileAsync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout.split('\0').filter(Boolean);
  };
  const [tracked, untracked] = await Promise.all([
    runGit(['ls-files', '-z']),
    runGit(['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  return [...new Set([...tracked, ...untracked])]
    .filter((path) => !EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix)))
    .sort();
}

function inspectValue(value, location, { rejectStandaloneEffectVersion = false } = {}) {
  const kind = retiredIdentityKind(value);
  if (kind) return [`${location}: ${kind}`];
  return rejectStandaloneEffectVersion &&
    containsStandaloneRetiredEffectVersion(value.toLowerCase())
    ? [`${location}: retired standalone Effect version`]
    : [];
}

export async function inspectIdentityArchive(bytes, archivePath) {
  const entries = await loadBoundedIdentityArchive(bytes);
  const violations = [];
  for (const entry of entries) {
    violations.push(...inspectValue(entry.name, `${archivePath}#${entry.name}`));
    if (entry.dir) continue;
    const payload = Buffer.from(await entry.async('uint8array'));
    const text = decodeUtf8(payload);
    if (text !== null) {
      violations.push(...inspectValue(text, `${archivePath}#${entry.name} payload`));
    }
  }
  return violations;
}

function assertArchiveEntryBudget(entry) {
  const compressedSize = entry._data?.compressedSize;
  const uncompressedSize = entry._data?.uncompressedSize;
  if (
    !Number.isSafeInteger(compressedSize) ||
    compressedSize < 0 ||
    !Number.isSafeInteger(uncompressedSize) ||
    uncompressedSize < 0
  ) {
    throw new Error('archive entry size metadata is invalid');
  }
  if (uncompressedSize > MAX_ARCHIVE_ENTRY_BYTES) {
    throw new Error('archive per-entry size limit exceeded');
  }
  if (
    uncompressedSize > 0 &&
    uncompressedSize / Math.max(1, compressedSize) > MAX_ARCHIVE_COMPRESSION_RATIO
  ) {
    throw new Error('archive compression-ratio limit exceeded');
  }
  return uncompressedSize;
}

async function loadBoundedIdentityArchive(bytes) {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error('archive compressed-size limit exceeded');
  }
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entries = Object.values(zip.files).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  if (entries.length > MAX_ARCHIVE_ENTRY_COUNT) {
    throw new Error('archive entry-count limit exceeded');
  }
  let aggregateUncompressedBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    aggregateUncompressedBytes += assertArchiveEntryBudget(entry);
    if (aggregateUncompressedBytes > MAX_ARCHIVE_TOTAL_BYTES) {
      throw new Error('archive aggregate size limit exceeded');
    }
  }
  return entries;
}

async function inspectArchiveAsync(root, relativePath) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      `--max-old-space-size=${ARCHIVE_WORKER_HEAP_MIB}`,
      fileURLToPath(import.meta.url),
      ARCHIVE_WORKER_ARGUMENT,
      resolve(root, relativePath),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: ARCHIVE_WORKER_TIMEOUT_MS,
    }
  );
  return JSON.parse(stdout);
}

async function sniptaleIdentityViolationsAsync({ root = repoRoot, paths } = {}) {
  const candidates = paths ?? (await candidatePathsAsync(root));
  const violations = [];
  for (const relativePath of candidates) {
    const absolutePath = resolve(root, relativePath);
    const candidate = readCandidateBytes(absolutePath);
    if (candidate === null) continue;
    violations.push(...inspectValue(relativePath, relativePath));
    const { bytes, isRegularFile } = candidate;
    const text = decodeUtf8(bytes);
    if (text !== null) {
      violations.push(
        ...inspectValue(text, `${relativePath} content`, {
          rejectStandaloneEffectVersion: EFFECT_V1_OWNER_PREFIXES.some((prefix) =>
            relativePath.startsWith(prefix)
          ),
        })
      );
    }
    if (isRegularFile && relativePath.toLocaleLowerCase('en-US').endsWith('.zip')) {
      try {
        violations.push(...(await inspectArchiveAsync(root, relativePath)));
      } catch (error) {
        violations.push(`${relativePath}: identity ZIP inspection failed: ${error.message}`);
      }
    }
  }
  return violations.sort();
}

export async function runSniptaleIdentityCheck(options = {}) {
  return { violations: await sniptaleIdentityViolationsAsync(options) };
}

const archiveWorkerArgumentIndex = process.argv.indexOf(ARCHIVE_WORKER_ARGUMENT);
if (archiveWorkerArgumentIndex >= 0) {
  const archivePath = process.argv[archiveWorkerArgumentIndex + 1];
  const violations = await inspectIdentityArchive(readFileSync(archivePath), archivePath);
  writeFileSync(process.stdout.fd, JSON.stringify(violations));
} else if (isExecutedAsScript(import.meta.url)) {
  const violations = await sniptaleIdentityViolationsAsync();
  if (violations.length > 0) {
    process.stderr.write(`Sniptale identity violations found:\n${violations.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('Sniptale identity: OK\n');
  }
}
