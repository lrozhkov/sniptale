import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { parseRunRecord } from '../qa/runtime/observability/schema.mjs';

const root = process.cwd();
const OUTPUT_ROOT = 'build/ci-artifacts';

function relativePath(value, repositoryRoot = root) {
  const absolute = path.resolve(repositoryRoot, value);
  const relative = path.relative(repositoryRoot, absolute).replaceAll(path.sep, '/');
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

function copyFile(
  source,
  destinationRoot,
  destination = source,
  { notBeforeMs = null, repositoryRoot = root } = {}
) {
  const relativeSource = relativePath(source, repositoryRoot);
  const absoluteSource = path.join(repositoryRoot, relativeSource);
  if (!fs.existsSync(absoluteSource)) return false;
  const details = fs.lstatSync(absoluteSource);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error(`Unsafe artifact: ${source}`);
  if (notBeforeMs !== null && details.mtimeMs < notBeforeMs - 1000) {
    throw new Error(`Stale artifact predates lane: ${source}`);
  }
  const relativeDestination = relativePath(destination, repositoryRoot);
  const output = path.join(destinationRoot, relativeDestination);
  if (fs.existsSync(output)) throw new Error(`Artifact collision: ${relativeDestination}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(absoluteSource, output, fs.constants.COPYFILE_EXCL);
  return true;
}

function copyTree(source, destinationRoot, options = {}) {
  const repositoryRoot = options.repositoryRoot ?? root;
  const absolute = path.resolve(repositoryRoot, relativePath(source, repositoryRoot));
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
  candidate: new Set([
    'qa:release-harness',
    'qa:checkpoint',
    'qa:closeout',
    'qa:release',
    'qa:audit',
  ]),
  release: new Set(['qa:release-harness', 'qa:release', 'qa:audit']),
  'release-audit': new Set(['qa:audit']),
  security: new Set(['qa:audit']),
  coverage: new Set(['qa:audit']),
};

function collectRunRecords(lane, startedAtMs, destinationRoot, repositoryRoot) {
  const recordsRoot = path.join(repositoryRoot, '.tmp/qa-observability/runs');
  if (!fs.existsSync(recordsRoot)) return [];
  const available = [];
  for (const day of fs.readdirSync(recordsRoot)) {
    const dayRoot = path.join(recordsRoot, day);
    if (!fs.statSync(dayRoot).isDirectory()) continue;
    for (const name of fs.readdirSync(dayRoot).filter((entry) => entry.endsWith('.json'))) {
      const source = path.join(dayRoot, name);
      const record = parseRunRecord(JSON.parse(fs.readFileSync(source, 'utf8')));
      if (Date.parse(record.startedAt) < startedAtMs) continue;
      const expectedRecord = `.tmp/qa-observability/runs/${record.startedAt.slice(0, 10)}/${record.runId}.json`;
      const relative = relativePath(source, repositoryRoot);
      if (relative !== expectedRecord)
        throw new Error(`Non-canonical run record path: ${relative}`);
      available.push({ record, relative });
    }
  }
  const topLevel = available.filter(
    ({ record }) => record.parentRunId === null && LANE_WRAPPERS[lane].has(record.wrapperId)
  );
  const selected = [...topLevel];
  if (lane === 'candidate') {
    for (const parent of topLevel.filter(({ record }) => record.wrapperId === 'qa:closeout')) {
      const evidence = parent.record.steps
        .filter((step) => step.stepId === 'qa.rule.full-build' && step.outcome === 'problems-found')
        .flatMap(
          (step) => step.diagnostic?.evidence.filter((item) => item.kind === 'child-run') ?? []
        );
      for (const childEvidence of evidence) {
        const matches = available.filter(
          ({ record, relative }) =>
            record.runId === childEvidence.runId &&
            record.wrapperId === 'qa:build' &&
            record.status === 'problems-found' &&
            record.exitCode !== null &&
            record.exitCode !== 0 &&
            record.parentRunId === parent.record.runId &&
            record.rootRunId === parent.record.rootRunId &&
            relative === childEvidence.recordPath &&
            record.log.path === childEvidence.logPath
        );
        if (matches.length !== 1) {
          throw new Error(
            `Expected exactly one canonical qa:build child for ${parent.record.runId}, found ${matches.length}.`
          );
        }
        if (!selected.some(({ record }) => record.runId === matches[0].record.runId)) {
          selected.push(matches[0]);
        }
      }
    }
  }
  const copied = [];
  for (const { record, relative } of selected) {
    copyFile(relative, destinationRoot, relative, { repositoryRoot });
    copied.push(relative);
    const absoluteLog = path.join(repositoryRoot, relativePath(record.log.path, repositoryRoot));
    if (!fs.existsSync(absoluteLog))
      throw new Error(`Canonical run log is missing: ${record.log.path}`);
    if (
      fs.statSync(absoluteLog).size !== record.log.byteCount ||
      sha256(absoluteLog) !== record.log.digest
    ) {
      throw new Error(`Canonical run log identity drifted: ${record.log.path}`);
    }
    copyFile(record.log.path, destinationRoot, record.log.path, { repositoryRoot });
  }
  return copied.sort();
}

function newestReleaseArchive(startedAtMs, repositoryRoot = root) {
  const candidates = fs
    .readdirSync(path.join(repositoryRoot, 'build'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^sniptale_.+\.zip$/u.test(entry.name))
    .map((entry) => `build/${entry.name}`)
    .filter((file) => fs.statSync(path.join(repositoryRoot, file)).mtimeMs >= startedAtMs - 1000);
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one fresh release ZIP, found ${candidates.length}.`);
  }
  return candidates[0];
}

function runSnapshotCommand(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${(result.stderr ?? '').trim() || 'unknown error'}`
    );
  }
}

function copySnapshotTree(source, destination) {
  const details = fs.lstatSync(source);
  if (details.isSymbolicLink()) throw new Error(`Unsafe candidate snapshot symlink: ${source}`);
  if (details.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    return;
  }
  if (!details.isDirectory()) throw new Error(`Unsafe candidate snapshot entry: ${source}`);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source)) {
    copySnapshotTree(path.join(source, entry), path.join(destination, entry));
  }
}

function assertSnapshotTreeSafe(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    const details = fs.lstatSync(child);
    if (details.isSymbolicLink()) throw new Error(`Unsafe tracked candidate symlink: ${child}`);
    if (details.isDirectory()) assertSnapshotTreeSafe(child);
    else if (!details.isFile()) throw new Error(`Unsafe tracked candidate entry: ${child}`);
  }
}

export async function finalizeCandidateReleaseArchive({
  candidateRoot = root,
  startedAtMs,
  archiveBuilder,
  temporaryParent = path.dirname(candidateRoot),
}) {
  const candidateArchive = newestReleaseArchive(startedAtMs, candidateRoot);
  const candidateArchivePath = path.join(candidateRoot, candidateArchive);
  const temporaryRoot = fs.mkdtempSync(path.join(temporaryParent, '.ci-finalize-'));
  const snapshotRoot = path.join(temporaryRoot, 'snapshot');
  try {
    fs.mkdirSync(snapshotRoot);
    const archivePath = path.join(temporaryRoot, 'candidate.tar');
    runSnapshotCommand(
      'git',
      ['archive', '--format=tar', '--output', archivePath, 'HEAD'],
      candidateRoot
    );
    runSnapshotCommand('tar', ['-xf', archivePath, '-C', snapshotRoot], candidateRoot);
    assertSnapshotTreeSafe(snapshotRoot);
    copySnapshotTree(path.join(candidateRoot, 'dist'), path.join(snapshotRoot, 'dist'));
    const trustedArchiveBuilder =
      archiveBuilder ?? (await import('../release/package-dist.mjs')).createReleaseArchive;
    const rebuiltArchivePath = await trustedArchiveBuilder({ repoRoot: snapshotRoot });
    if (sha256(candidateArchivePath) !== sha256(rebuiltArchivePath)) {
      throw new Error('Candidate release ZIP changed after canonical release validation.');
    }
    fs.copyFileSync(rebuiltArchivePath, candidateArchivePath);
    return candidateArchive;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const LANE_FILES = {
  candidate: [
    '.tmp/qa/unit-proof.json',
    '.tmp/qa/codeql-proof.json',
    '.tmp/coverage/canonical/coverage-final.json',
    '.tmp/coverage/canonical/coverage-summary.json',
    '.tmp/coverage/canonical/lcov.info',
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
  'release-audit': [
    '.tmp/qa/codeql-proof.json',
    '.tmp/coverage/canonical/coverage-final.json',
    '.tmp/coverage/canonical/coverage-summary.json',
    '.tmp/coverage/canonical/lcov.info',
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

function createArtifactDestination(lane, repositoryRoot) {
  const commit = safeSegment(
    process.env.SNIPTALE_CANDIDATE_SHA ??
      process.env.GITHUB_SHA ??
      process.env.SNIPTALE_PROOF_SHA ??
      'local',
    'commit'
  );
  const runId = safeSegment(process.env.GITHUB_RUN_ID ?? `${Date.now()}`, 'run id');
  const relativeOutput = `${OUTPUT_ROOT}/${lane}-${commit}-${runId}`;
  const destinationRoot = path.join(repositoryRoot, relativeOutput);
  fs.mkdirSync(path.dirname(destinationRoot), { recursive: true });
  fs.mkdirSync(destinationRoot, { recursive: false });
  return { commit, destinationRoot, relativeOutput };
}

function collectLaneReports({ lane, startedAtMs, status, destinationRoot, repositoryRoot }) {
  const required = status === 'passed';
  for (const file of LANE_FILES[lane] ?? []) {
    const copied = copyFile(file, destinationRoot, file, {
      notBeforeMs: startedAtMs,
      repositoryRoot,
    });
    if (required && !copied) throw new Error(`Required artifact is missing: ${file}`);
  }
  if (lane === 'coverage' || lane === 'candidate' || lane === 'release-audit') {
    const copied = copyTree('.tmp/coverage/canonical/html', destinationRoot, {
      notBeforeMs: startedAtMs,
      repositoryRoot,
    });
    if (required && !copied) throw new Error('Required coverage HTML is missing.');
  }
  if ((lane === 'release' || lane === 'candidate') && required) {
    copyFile(newestReleaseArchive(startedAtMs, repositoryRoot), destinationRoot, undefined, {
      repositoryRoot,
    });
    if (lane === 'release' && process.env.SNIPTALE_RELEASE_AUDIT === '1') {
      copyFile('.tmp/licenses/sbom.cdx.json', destinationRoot, undefined, { repositoryRoot });
    }
  }
  const runRecords = collectRunRecords(lane, startedAtMs, destinationRoot, repositoryRoot);
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

export function collectLaneArtifacts({
  lane,
  startedAtMs,
  status,
  command,
  phases = [],
  containerDigest,
  candidateTree = null,
  trustedControlSha = null,
  resourceProfiles = null,
  infrastructure = null,
  repositoryRoot = root,
}) {
  if (!['candidate', 'release', 'release-audit', 'security', 'coverage'].includes(lane)) {
    throw new Error(`Unknown lane: ${lane}`);
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(containerDigest ?? '')) {
    throw new Error('Unknown or malformed container digest.');
  }
  const resolvedRoot = path.resolve(repositoryRoot);
  const { commit, destinationRoot, relativeOutput } = createArtifactDestination(lane, resolvedRoot);
  collectLaneReports({
    lane,
    startedAtMs,
    status,
    destinationRoot,
    repositoryRoot: resolvedRoot,
  });
  const files = listArtifactFiles(destinationRoot);
  const manifest = {
    schemaVersion: 1,
    artifactKind: 'sniptale-ci-proof',
    lane,
    status,
    commit,
    baseSha: process.env.SNIPTALE_BASE_SHA ?? null,
    candidateTree,
    trustedControlSha,
    containerDigest,
    command,
    phases,
    resourceProfiles,
    infrastructure,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date().toISOString(),
    files: files.map((file) => ({ file, sha256: sha256(path.join(destinationRoot, file)) })),
  };
  writeProofManifest(destinationRoot, manifest);
  return relativeOutput;
}
