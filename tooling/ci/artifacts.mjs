import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseRunRecord } from '../qa/runtime/observability/schema.mjs';

const root = process.cwd();
const OUTPUT_ROOT = 'build/ci-artifacts';

function relativePath(value) {
  const absolute = path.resolve(root, value);
  const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`Artifact source escapes repository: ${value}`);
  }
  return relative;
}

function safeSegment(value, label) {
  if (!/^[A-Za-z0-9._-]+$/u.test(value)) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function copyFile(source, destinationRoot, destination = source, { notBeforeMs = null } = {}) {
  const relativeSource = relativePath(source);
  const absoluteSource = path.join(root, relativeSource);
  if (!fs.existsSync(absoluteSource)) return false;
  const details = fs.lstatSync(absoluteSource);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error(`Unsafe artifact: ${source}`);
  if (notBeforeMs !== null && details.mtimeMs < notBeforeMs - 1000) {
    throw new Error(`Stale artifact predates lane: ${source}`);
  }
  const relativeDestination = relativePath(destination);
  const output = path.join(destinationRoot, relativeDestination);
  if (fs.existsSync(output)) throw new Error(`Artifact collision: ${relativeDestination}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(absoluteSource, output, fs.constants.COPYFILE_EXCL);
  return true;
}

function copyTree(source, destinationRoot, options = {}) {
  const absolute = path.resolve(root, relativePath(source));
  if (!fs.existsSync(absolute)) return false;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(source, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unsafe artifact symlink: ${child}`);
    if (entry.isDirectory()) copyTree(child, destinationRoot, options);
    else if (entry.isFile()) copyFile(child, destinationRoot, child, options);
  }
  return true;
}

const LANE_WRAPPERS = {
  release: new Set(['qa:release-harness', 'qa:release', 'qa:audit']),
  security: new Set(['qa:audit']),
  coverage: new Set(['qa:audit']),
};

function collectRunRecords(lane, startedAtMs, destinationRoot) {
  const recordsRoot = path.join(root, '.tmp/qa-observability/runs');
  if (!fs.existsSync(recordsRoot)) return [];
  const copied = [];
  for (const day of fs.readdirSync(recordsRoot)) {
    const dayRoot = path.join(recordsRoot, day);
    if (!fs.statSync(dayRoot).isDirectory()) continue;
    for (const name of fs.readdirSync(dayRoot).filter((entry) => entry.endsWith('.json'))) {
      const source = path.join(dayRoot, name);
      const record = parseRunRecord(JSON.parse(fs.readFileSync(source, 'utf8')));
      if (Date.parse(record.startedAt) < startedAtMs) continue;
      if (record.parentRunId !== null || !LANE_WRAPPERS[lane].has(record.wrapperId)) continue;
      const expectedRecord = `.tmp/qa-observability/runs/${record.startedAt.slice(0, 10)}/${record.runId}.json`;
      const relative = relativePath(source);
      if (relative !== expectedRecord)
        throw new Error(`Non-canonical run record path: ${relative}`);
      copyFile(relative, destinationRoot);
      copied.push(relative);
      const absoluteLog = path.join(root, relativePath(record.log.path));
      if (!fs.existsSync(absoluteLog))
        throw new Error(`Canonical run log is missing: ${record.log.path}`);
      if (
        fs.statSync(absoluteLog).size !== record.log.byteCount ||
        sha256(absoluteLog) !== record.log.digest
      ) {
        throw new Error(`Canonical run log identity drifted: ${record.log.path}`);
      }
      copyFile(record.log.path, destinationRoot);
    }
  }
  return copied.sort();
}

function newestReleaseArchive(startedAtMs) {
  const candidates = fs
    .readdirSync(path.join(root, 'build'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^sniptale_.+\.zip$/u.test(entry.name))
    .map((entry) => `build/${entry.name}`)
    .filter((file) => fs.statSync(path.join(root, file)).mtimeMs >= startedAtMs - 1000);
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one fresh release ZIP, found ${candidates.length}.`);
  }
  return candidates[0];
}

const LANE_FILES = {
  coverage: [
    '.tmp/coverage/canonical/coverage-final.json',
    '.tmp/coverage/canonical/coverage-summary.json',
    '.tmp/coverage/canonical/lcov.info',
  ],
  security: [
    '.tmp/semgrep/results.json',
    '.tmp/semgrep/results.sarif',
    '.tmp/codeql/results.filtered.sarif',
    '.tmp/osv/results.json',
    '.tmp/gitleaks/report.json',
    '.tmp/npm-audit/results.json',
    '.tmp/npm-audit/signatures.json',
    '.tmp/licenses/summary.json',
    '.tmp/licenses/sbom.cdx.json',
  ],
};

function createArtifactDestination(lane) {
  const commit = safeSegment(
    process.env.GITHUB_SHA ?? process.env.SNIPTALE_PROOF_SHA ?? 'local',
    'commit'
  );
  const runId = safeSegment(process.env.GITHUB_RUN_ID ?? `${Date.now()}`, 'run id');
  const relativeOutput = `${OUTPUT_ROOT}/${lane}-${commit}-${runId}`;
  const destinationRoot = path.join(root, relativeOutput);
  fs.mkdirSync(path.dirname(destinationRoot), { recursive: true });
  fs.mkdirSync(destinationRoot, { recursive: false });
  return { commit, destinationRoot, relativeOutput };
}

function collectLaneReports({ lane, startedAtMs, status, destinationRoot }) {
  const required = status === 'passed';
  for (const file of LANE_FILES[lane] ?? []) {
    const copied = copyFile(file, destinationRoot, file, { notBeforeMs: startedAtMs });
    if (required && !copied) throw new Error(`Required artifact is missing: ${file}`);
  }
  if (lane === 'coverage') {
    const copied = copyTree('.tmp/coverage/canonical/html', destinationRoot, {
      notBeforeMs: startedAtMs,
    });
    if (required && !copied) throw new Error('Required coverage HTML is missing.');
  }
  if (lane === 'release' && required) {
    copyFile(newestReleaseArchive(startedAtMs), destinationRoot);
    if (process.env.SNIPTALE_RELEASE_AUDIT === '1') {
      copyFile('.tmp/licenses/sbom.cdx.json', destinationRoot);
    }
  }
  const runRecords = collectRunRecords(lane, startedAtMs, destinationRoot);
  if (required && runRecords.length === 0) {
    throw new Error('No canonical QA run record was produced.');
  }
}

function listArtifactFiles(destinationRoot) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(child);
      else files.push(path.relative(destinationRoot, child).replaceAll(path.sep, '/'));
    }
  }
  walk(destinationRoot);
  return files.sort();
}

function writeProofManifest(destinationRoot, manifest) {
  const manifestPath = path.join(destinationRoot, 'proof-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  const checksums = manifest.files.map(({ file, sha256: digest }) => `${digest}  ${file}`);
  checksums.push(`${sha256(manifestPath)}  proof-manifest.json`);
  fs.writeFileSync(path.join(destinationRoot, 'SHA256SUMS'), `${checksums.join('\n')}\n`, {
    flag: 'wx',
  });
}

export function collectLaneArtifacts({ lane, startedAtMs, status, command, containerDigest }) {
  if (!['release', 'security', 'coverage'].includes(lane)) throw new Error(`Unknown lane: ${lane}`);
  if (!/^sha256:[a-f0-9]{64}$/u.test(containerDigest ?? '')) {
    throw new Error('Unknown or malformed container digest.');
  }
  const { commit, destinationRoot, relativeOutput } = createArtifactDestination(lane);
  collectLaneReports({ lane, startedAtMs, status, destinationRoot });
  const files = listArtifactFiles(destinationRoot);
  const manifest = {
    schemaVersion: 1,
    artifactKind: 'sniptale-ci-proof',
    lane,
    status,
    commit,
    baseSha: process.env.SNIPTALE_BASE_SHA ?? null,
    containerDigest,
    command,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date().toISOString(),
    files: files.map((file) => ({ file, sha256: sha256(path.join(destinationRoot, file)) })),
  };
  writeProofManifest(destinationRoot, manifest);
  return relativeOutput;
}
