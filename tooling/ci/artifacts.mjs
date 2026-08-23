import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseRunRecord } from '../qa/runtime/observability/schema.mjs';
import { createFastGateInputDigest, FAST_GATE_INPUT_POLICY_PATH } from './fast-gate-inputs.mjs';

const root = process.cwd();
const OUTPUT_ROOT = 'build/ci-artifacts';
const PROOF_SEMANTICS_POLICY = 'tooling/configs/ci/proof-semantics.json';

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

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function readProofSemanticsPolicy(repositoryRoot) {
  const policy = JSON.parse(fs.readFileSync(path.join(repositoryRoot, PROOF_SEMANTICS_POLICY)));
  if (
    policy?.schemaVersion !== 1 ||
    policy.artifactKind !== 'sniptale-proof-semantics-policy' ||
    policy.controlAuthority !== 'trusted-base' ||
    JSON.stringify(policy.controlDispositions) !==
      JSON.stringify(['trusted-controls', 'candidate-controls']) ||
    policy.invariants?.resourceProfileDoesNotChangeControlSemantics !== true ||
    policy.invariants?.resourceProfileExcludedFromSemanticDigest !== true ||
    policy.invariants?.resourceProfileAffectsReuseCompatibility !== true ||
    policy.invariants?.fastGateNeverClaimsReleaseReadiness !== true ||
    policy.invariants?.fullVitestIsReleaseOnly !== true ||
    JSON.stringify(policy.invariants?.diffAwareWrappersExactly) !==
      JSON.stringify(['qa:release-harness', 'qa:checkpoint', 'qa:closeout']) ||
    policy.invariants?.ciGatesAreRepositoryWide !== true ||
    policy.gateCapabilities?.proof?.scope !== 'repository-wide' ||
    policy.gateCapabilities?.proof?.fullVitest !== false ||
    policy.gateCapabilities?.proof?.releaseReady !== false ||
    policy.gateCapabilities?.release?.scope !== 'repository-wide' ||
    policy.gateCapabilities?.release?.fullVitest !== true ||
    policy.gateCapabilities?.release?.releaseReady !== true ||
    policy.environmentAdmissibility?.releaseProvenanceRequires !== 'locked-container' ||
    policy.invariants?.ciBuildIsNonProof !== true ||
    policy.invariants?.ciBuildArtifactAdmissibleForProvenance !== false
  ) {
    throw new Error('Malformed proof semantics policy.');
  }
  return policy;
}

export function createProofSemanticDigest(identity) {
  return `sha256:${crypto.createHash('sha256').update(stableStringify(identity)).digest('hex')}`;
}

function normalizeExecutionProfile(lane, resourceProfiles, infrastructure) {
  const profile =
    infrastructure?.resourceProfile ??
    resourceProfiles?.[lane === 'release' ? 'release' : 'bounded'];
  if (!profile) return null;
  return {
    cpuTokens: profile.cpuTokens,
    memoryMiB: profile.memoryMiB,
    vitestWorkers: profile.vitestWorkers ?? profile.vitestMaxWorkers,
    playwrightWorkers:
      profile.playwrightWorkers ?? Number(process.env.SNIPTALE_QA_PLAYWRIGHT_WORKERS || 1),
    securityWorkers:
      profile.securityWorkers ?? Number(process.env.SNIPTALE_QA_SECURITY_WORKERS || 1),
  };
}

function reuseCompatibility(lane, executionProfile, semanticsPolicy) {
  const minimum = semanticsPolicy.reuseCompatibility?.[lane]?.minimumExecutionProfile;
  if (!minimum || !executionProfile) {
    return { outcome: 'diagnostic-only', reason: 'no canonical execution profile' };
  }
  const belowMinimum = Object.entries(minimum)
    .filter(([name, value]) => executionProfile[name] < value)
    .map(([name, value]) => ({ name, minimum: value, actual: executionProfile[name] }));
  return belowMinimum.length === 0
    ? { outcome: 'compatible', minimumExecutionProfile: minimum }
    : { outcome: 'incompatible', minimumExecutionProfile: minimum, belowMinimum };
}

function copyFile(
  source,
  destinationRoot,
  destination = source,
  { ignoreStale = false, notBeforeMs = null, repositoryRoot = root } = {}
) {
  const relativeSource = relativePath(source, repositoryRoot);
  const absoluteSource = path.join(repositoryRoot, relativeSource);
  if (!fs.existsSync(absoluteSource)) return false;
  const details = fs.lstatSync(absoluteSource);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error(`Unsafe artifact: ${source}`);
  if (notBeforeMs !== null && details.mtimeMs < notBeforeMs - 1000) {
    if (ignoreStale) return false;
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
  let copied = false;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(source, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unsafe artifact symlink: ${child}`);
    if (entry.isDirectory()) copied = copyTree(child, destinationRoot, options) || copied;
    else if (entry.isFile()) copied = copyFile(child, destinationRoot, child, options) || copied;
  }
  return copied;
}

function copyExternalFile(source, destinationRoot, destination) {
  const details = fs.lstatSync(source);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error(`Unsafe artifact: ${source}`);
  const output = path.join(destinationRoot, destination);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(source, output, fs.constants.COPYFILE_EXCL);
}

const LANE_WRAPPERS = {
  proof: new Set(['ci:proof']),
  release: new Set(['ci:release']),
};

function collectRunRecords(lane, startedAtMs, destinationRoot, repositoryRoot, beforeCopyRecords) {
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
  const selected = [...topLevel].map(({ record, relative }) => {
    const absoluteLog = path.join(repositoryRoot, relativePath(record.log.path, repositoryRoot));
    if (!fs.existsSync(absoluteLog))
      throw new Error(`Canonical run log is missing: ${record.log.path}`);
    if (
      fs.statSync(absoluteLog).size !== record.log.byteCount ||
      sha256(absoluteLog) !== record.log.digest
    ) {
      throw new Error(`Canonical run log identity drifted: ${record.log.path}`);
    }
    return { record, relative };
  });
  beforeCopyRecords?.();
  const copied = [];
  for (const { record, relative } of selected) {
    copyFile(relative, destinationRoot, relative, { repositoryRoot });
    copied.push(relative);
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

const LANE_FILES = {
  proof: [
    '.tmp/qa/build-proof.json',
    '.tmp/semgrep/results.json',
    '.tmp/semgrep/results.sarif',
    '.tmp/osv/results.json',
    '.tmp/gitleaks/report.json',
    '.tmp/npm-audit/results.json',
    '.tmp/npm-audit/signatures.json',
  ],
  release: [
    '.tmp/qa/build-proof.json',
    '.tmp/qa/unit-proof.json',
    '.tmp/qa/codeql-proof.json',
    '.tmp/qa/coverage-proof.json',
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
};

function createArtifactDestination(lane, repositoryRoot) {
  const commit = safeSegment(
    process.env.SNIPTALE_CANDIDATE_SHA ??
      process.env.GITHUB_SHA ??
      process.env.SNIPTALE_PROOF_SHA ??
      'local',
    'commit'
  );
  const runIdentity = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
    : `${Date.now()}`;
  const runId = safeSegment(runIdentity, 'run id');
  const relativeOutput = `${OUTPUT_ROOT}/${lane}-${commit}-${runId}`;
  const destinationRoot = path.join(repositoryRoot, relativeOutput);
  fs.mkdirSync(path.dirname(destinationRoot), { recursive: true });
  fs.mkdirSync(destinationRoot, { recursive: false });
  return { commit, destinationRoot, relativeOutput };
}

function collectLaneReports({
  lane,
  startedAtMs,
  status,
  destinationRoot,
  repositoryRoot,
  beforeCollectRunRecords,
}) {
  const required = status === 'passed';
  for (const file of LANE_FILES[lane] ?? []) {
    const copied = copyFile(file, destinationRoot, file, {
      ignoreStale: !required,
      notBeforeMs: startedAtMs,
      repositoryRoot,
    });
    if (required && !copied) {
      throw new Error(`Required artifact is missing: ${file}`);
    }
  }
  if (lane === 'release') {
    const copied = copyTree('.tmp/coverage/canonical/html', destinationRoot, {
      ignoreStale: !required,
      notBeforeMs: startedAtMs,
      repositoryRoot,
    });
    if (required && !copied) {
      throw new Error('Required coverage HTML is missing.');
    }
    const mutationCopied = copyTree('.tmp/mutation', destinationRoot, {
      ignoreStale: !required,
      notBeforeMs: startedAtMs,
      repositoryRoot,
    });
    if (required && !mutationCopied) throw new Error('Required mutation evidence is missing.');
    if (process.env.SNIPTALE_REUSE_FAST_PROOF === '1') {
      const proofPath = path.join(
        process.env.SNIPTALE_FAST_PROOF_PATH ?? '',
        'proof-manifest.json'
      );
      if (!fs.existsSync(proofPath)) throw new Error('Verified fast proof receipt is missing.');
      copyExternalFile(proofPath, destinationRoot, 'fast-proof/proof-manifest.json');
    }
  }
  if ((lane === 'release' || lane === 'proof') && required) {
    copyFile(newestReleaseArchive(startedAtMs, repositoryRoot), destinationRoot, undefined, {
      repositoryRoot,
    });
  }
  const runRecords = collectRunRecords(
    lane,
    startedAtMs,
    destinationRoot,
    repositoryRoot,
    beforeCollectRunRecords
  );
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

function proofReuseStatus(destinationRoot, relativePath) {
  const proofPath = path.join(destinationRoot, relativePath);
  if (!fs.existsSync(proofPath)) return 'unavailable';
  const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
  return proof.reusedFrom ? 'reused' : 'fresh';
}

export function selectelInfrastructureFromEnvironment(env = process.env) {
  if (env.SNIPTALE_SELECTEL_ATTEMPT === undefined) return null;
  return {
    provider: 'selectel',
    selectedProfileIndex: Number(env.SNIPTALE_SELECTEL_ATTEMPT),
    profilesDigest: env.SNIPTALE_SELECTEL_PROFILES_DIGEST,
    serverId: env.SNIPTALE_SELECTEL_SERVER_ID,
    availabilityZone: env.SNIPTALE_SELECTEL_AVAILABILITY_ZONE,
    imageReference: env.SNIPTALE_CI_IMAGE,
    resourceProfile: {
      cpuTokens: Number(env.SNIPTALE_QA_CPU_TOKENS),
      memoryMiB: Number(env.SNIPTALE_QA_MEMORY_MIB),
      vitestWorkers: Number(env.SNIPTALE_QA_VITEST_MAX_WORKERS),
      playwrightWorkers: Number(env.SNIPTALE_QA_PLAYWRIGHT_WORKERS),
      securityWorkers: Number(env.SNIPTALE_QA_SECURITY_WORKERS),
    },
  };
}

export function collectLaneArtifacts({
  lane,
  startedAtMs,
  status,
  command,
  phases = [],
  containerDigest,
  executionEnvironment = containerDigest
    ? { kind: 'locked-container', digest: containerDigest }
    : null,
  candidateTree = null,
  workspaceMode = 'committed',
  trustedControlSha = null,
  trustedControlDigest = null,
  controlDigest = null,
  gateInputDigest = null,
  resourceProfiles = null,
  infrastructure = null,
  repositoryRoot = root,
  beforeCollectRunRecords,
}) {
  if (!['proof', 'release'].includes(lane)) {
    throw new Error(`Unknown lane: ${lane}`);
  }
  if (
    !['locked-container', 'host-wsl'].includes(executionEnvironment?.kind) ||
    !/^sha256:[a-f0-9]{64}$/u.test(executionEnvironment?.digest ?? '')
  ) {
    throw new Error('Unknown or malformed execution environment identity.');
  }
  const resolvedRoot = path.resolve(repositoryRoot);
  const semanticsPolicy = readProofSemanticsPolicy(resolvedRoot);
  const { commit, destinationRoot, relativeOutput } = createArtifactDestination(lane, resolvedRoot);
  collectLaneReports({
    lane,
    startedAtMs,
    status,
    destinationRoot,
    repositoryRoot: resolvedRoot,
    beforeCollectRunRecords,
  });
  const files = listArtifactFiles(destinationRoot);
  if (!/^sha256:[a-f0-9]{64}$/u.test(controlDigest ?? '')) {
    throw new Error('Canonical proof requires a candidate control digest.');
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(trustedControlDigest ?? '')) {
    throw new Error('Canonical proof requires a trusted-base control digest.');
  }
  const resolvedGateInputDigest =
    gateInputDigest ?? createFastGateInputDigest({ cwd: resolvedRoot });
  if (!/^sha256:[a-f0-9]{64}$/u.test(resolvedGateInputDigest)) {
    throw new Error('Canonical proof requires a fast gate input digest.');
  }
  const semanticIdentity = {
    lane,
    commit,
    candidateTree,
    trustedControlSha,
    trustedControlDigest,
    controlDigest,
    gateInputDigest: resolvedGateInputDigest,
    executionEnvironment,
  };
  const controlsChanged = controlDigest !== trustedControlDigest;
  const controlDisposition = controlsChanged ? 'candidate-controls' : 'trusted-controls';
  const capability = semanticsPolicy.gateCapabilities[lane];
  const executionProfile = normalizeExecutionProfile(lane, resourceProfiles, infrastructure);
  const manifest = {
    schemaVersion: 1,
    artifactKind: 'sniptale-ci-proof',
    lane,
    status,
    evidenceDisposition: 'executed',
    commit,
    baseSha: process.env.SNIPTALE_BASE_SHA ?? null,
    candidateTree,
    workspaceMode,
    trustedControlSha,
    trustedControlDigest,
    controlAuthority: semanticsPolicy.controlAuthority,
    controlsChanged,
    controlDisposition,
    gateClaim: capability.claim,
    fullVitest: capability.fullVitest,
    releaseReady: capability.releaseReady,
    controlDigest,
    proofSemanticDigest: createProofSemanticDigest(semanticIdentity),
    proofSemanticsPolicy: PROOF_SEMANTICS_POLICY,
    gateInputDigest: resolvedGateInputDigest,
    gateInputPolicy: FAST_GATE_INPUT_POLICY_PATH,
    executionEnvironment,
    containerDigest:
      executionEnvironment.kind === 'locked-container' ? executionEnvironment.digest : null,
    command,
    phases,
    resourceProfiles,
    executionProfile,
    reuseCompatibility: reuseCompatibility(lane, executionProfile, semanticsPolicy),
    infrastructure,
    proofReuse: {
      build: proofReuseStatus(destinationRoot, '.tmp/qa/build-proof.json'),
      unit: proofReuseStatus(destinationRoot, '.tmp/qa/unit-proof.json'),
      codeql: proofReuseStatus(destinationRoot, '.tmp/qa/codeql-proof.json'),
      coverage: proofReuseStatus(destinationRoot, '.tmp/qa/coverage-proof.json'),
    },
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date().toISOString(),
    files: files.map((file) => ({ file, sha256: sha256(path.join(destinationRoot, file)) })),
  };
  writeProofManifest(destinationRoot, manifest);
  return relativeOutput;
}
