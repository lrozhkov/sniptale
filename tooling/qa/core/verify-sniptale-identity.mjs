import { execFileSync } from 'node:child_process';
import { readFileSync, readlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

import { isExecutedAsScript, repoRoot } from './shared.mjs';
import { retiredIdentityKind } from './retired-identity.mjs';

const ARCHIVE_WORKER_ARGUMENT = '--inspect-identity-archive';
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

function candidatePaths(root) {
  const runGit = (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const tracked = runGit(['ls-files', '-z']);
  const untracked = runGit(['ls-files', '--others', '--exclude-standard', '-z']);
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
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const violations = [];
  for (const entry of Object.values(zip.files).sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
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

function inspectArchiveSync(root, relativePath) {
  const output = execFileSync(
    process.execPath,
    [fileURLToPath(import.meta.url), ARCHIVE_WORKER_ARGUMENT, resolve(root, relativePath)],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
  return JSON.parse(output);
}

export function sniptaleIdentityViolations({ root = repoRoot, paths = candidatePaths(root) } = {}) {
  const violations = [];
  for (const relativePath of paths) {
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
        violations.push(...inspectArchiveSync(root, relativePath));
      } catch (error) {
        violations.push(`${relativePath}: identity ZIP inspection failed: ${error.message}`);
      }
    }
  }
  return violations.sort();
}

export function runSniptaleIdentityCheck() {
  return { violations: sniptaleIdentityViolations() };
}

if (isExecutedAsScript(import.meta.url)) {
  if (process.argv[2] === ARCHIVE_WORKER_ARGUMENT) {
    const archivePath = process.argv[3];
    const violations = await inspectIdentityArchive(readFileSync(archivePath), archivePath);
    process.stdout.write(JSON.stringify(violations));
  } else {
    const violations = sniptaleIdentityViolations();
    if (violations.length > 0) {
      process.stderr.write(`Sniptale identity violations found:\n${violations.join('\n')}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write('Sniptale identity: OK\n');
    }
  }
}
