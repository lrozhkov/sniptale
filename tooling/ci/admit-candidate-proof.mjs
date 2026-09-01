import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { createProofSemanticDigest } from './artifacts.mjs';
import { createCandidateControlDigest } from './control-digest.mjs';
import { createFastGateInputDigest } from './fast-gate-inputs.mjs';
import { validateTrustedControlResults } from './trusted-control-matrix.mjs';
import { stableStringify } from '../qa/proof/contracts/proof-input.mjs';
import { listRegularProofFiles } from './proof-file-inventory.mjs';
import { parseFullUnitProof } from '../qa/proof/unit/unit-test-proof.mjs';

const POLICY_PATH = 'tooling/configs/ci/trusted-admission-policy.json';
const SEMANTICS_POLICY_PATH = 'tooling/configs/ci/proof-semantics.json';
const CODEQL_PROOF_POLICY_PATH = 'tooling/configs/qa/codeql-proof-reuse.data.json';
const COVERAGE_PROOF_POLICY_PATH = 'tooling/configs/qa/coverage-proof-reuse.data.json';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed for candidate.`);
  return result.stdout.trim();
}

function readPolicy(trustedRoot) {
  const policy = JSON.parse(fs.readFileSync(path.join(trustedRoot, POLICY_PATH), 'utf8'));
  if (
    policy?.schemaVersion !== 1 ||
    policy.artifactKind !== 'sniptale-trusted-admission-policy' ||
    !policy.lanes?.proof ||
    !policy.lanes?.release ||
    typeof policy.proof !== 'string' ||
    typeof policy.rollback !== 'string'
  ) {
    throw new Error('Malformed trusted admission policy.');
  }
  return policy;
}

function validateExecutionCompatibility(manifest, lane, lanePolicy, trustedRoot) {
  const profile = manifest.executionProfile;
  const semantics = JSON.parse(
    fs.readFileSync(path.join(trustedRoot, SEMANTICS_POLICY_PATH), 'utf8')
  );
  if (
    manifest.reuseCompatibility?.outcome !== 'compatible' ||
    manifest.reuseCompatibility?.authority !== semantics.reuseCompatibility?.authority ||
    semantics.reuseCompatibility?.authority !== 'environment-profile' ||
    !profile ||
    manifest.gateClaim !== lanePolicy.claim ||
    manifest.fullVitest !== lanePolicy.fullVitest ||
    manifest.releaseReady !== lanePolicy.releaseReady
  ) {
    throw new Error('Candidate proof capability or execution profile is not admissible.');
  }
}

function validateFileInventory(root, manifest, lane, lanePolicy) {
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('Candidate proof file inventory is missing.');
  }
  const declared = new Map();
  for (const entry of manifest.files) {
    const file = entry?.file;
    if (
      typeof file !== 'string' ||
      file.length === 0 ||
      file === '..' ||
      file.startsWith('../') ||
      path.posix.isAbsolute(file) ||
      path.posix.normalize(file) !== file ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '') ||
      declared.has(file)
    ) {
      throw new Error(`Malformed candidate proof file identity: ${String(file)}`);
    }
    const absolute = path.join(root, file);
    if (
      !fs.existsSync(absolute) ||
      !fs.statSync(absolute).isFile() ||
      sha256(absolute) !== entry.sha256
    ) {
      throw new Error(`Candidate proof file digest mismatch: ${file}`);
    }
    declared.set(file, entry.sha256);
  }
  for (const file of lanePolicy.requiredFiles) {
    if (!declared.has(file))
      throw new Error(`Candidate proof is missing required evidence: ${file}`);
  }
  for (const prefix of lanePolicy.requiredPrefixes) {
    if (![...declared.keys()].some((file) => file.startsWith(prefix))) {
      throw new Error(`Candidate proof is missing required evidence family: ${prefix}`);
    }
  }
  const archives = [...declared.keys()].filter((file) => /^build\/sniptale_.+\.zip$/u.test(file));
  const expectedArchiveCount = lane === 'release' ? 1 : 0;
  if (archives.length !== expectedArchiveCount) {
    throw new Error(
      lane === 'release'
        ? 'Candidate release proof must contain exactly one release ZIP.'
        : 'Fast proof must not contain a release ZIP.'
    );
  }
  const physical = listRegularProofFiles(root, 'Candidate proof');
  const expectedPhysical = [...declared.keys(), 'SHA256SUMS', 'proof-manifest.json'].sort();
  if (JSON.stringify(physical) !== JSON.stringify(expectedPhysical)) {
    throw new Error('Candidate proof physical inventory is not exact.');
  }
  const manifestPath = path.join(root, 'proof-manifest.json');
  const expectedSums = [
    ...manifest.files.map(({ file, sha256: digest }) => `${digest}  ${file}`),
    `${sha256(manifestPath)}  proof-manifest.json`,
  ].join('\n');
  if (fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8') !== `${expectedSums}\n`) {
    throw new Error('Candidate proof checksum inventory drifted.');
  }
  return { archives, declared };
}

function validateReceipt(root, relative, artifactKind) {
  const receipt = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const unsigned = { ...receipt };
  delete unsigned.proofDigest;
  if (
    receipt?.schemaVersion !== 1 ||
    receipt.artifactKind !== artifactKind ||
    receipt.outcome !== 'passed' ||
    !/^[a-f0-9]{64}$/u.test(receipt.inputDigest ?? '') ||
    !/^[a-f0-9]{64}$/u.test(receipt.proofDigest ?? '') ||
    crypto.createHash('sha256').update(stableStringify(unsigned)).digest('hex') !==
      receipt.proofDigest
  ) {
    throw new Error(`Malformed candidate receipt: ${relative}`);
  }
  return receipt;
}

function validateUnitReceipt(root) {
  const relative = '.tmp/qa/unit-proof.json';
  try {
    return parseFullUnitProof(JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')));
  } catch {
    throw new Error(`Malformed candidate receipt: ${relative}`);
  }
}

function validateReceiptReuse(manifest, name, receipt) {
  if (manifest.proofReuse?.[name] === 'inherited') return;
  const observed = receipt.reusedFrom ? 'reused' : 'fresh';
  if (manifest.proofReuse?.[name] !== observed) {
    throw new Error(`Candidate proof ${name} reuse status does not match its receipt.`);
  }
}

function readReleaseProofPolicy(trustedRoot, relative, artifactKind) {
  const policy = JSON.parse(fs.readFileSync(path.join(trustedRoot, relative), 'utf8'));
  if (policy?.schemaVersion !== 1 || policy.artifactKind !== artifactKind) {
    throw new Error(`Malformed release proof policy: ${relative}`);
  }
  return policy;
}

function validateCodeqlEvidence(root, manifest, declared, trustedRoot) {
  const policy = readReleaseProofPolicy(
    trustedRoot,
    CODEQL_PROOF_POLICY_PATH,
    'sniptale-codeql-proof-reuse-policy'
  );
  if (
    policy.proofPath !== '.tmp/qa/codeql-proof.json' ||
    policy.sarifPath !== '.tmp/codeql/results.filtered.sarif'
  ) {
    throw new Error(`Malformed release proof policy: ${CODEQL_PROOF_POLICY_PATH}`);
  }
  const receipt = validateReceipt(root, policy.proofPath, 'sniptale-codeql-proof');
  if (
    receipt.producer?.controlDigest !== manifest.controlDigest ||
    !/^[a-f0-9]{64}$/u.test(receipt.sarifSha256 ?? '') ||
    receipt.sarifSha256 !== declared.get(policy.sarifPath)
  ) {
    throw new Error('Candidate CodeQL receipt does not bind the admitted SARIF.');
  }
  validateReceiptReuse(manifest, 'codeql', receipt);
}

function parseCoverageReportInventory(receipt) {
  if (!Array.isArray(receipt.reports) || receipt.reports.length === 0) {
    throw new Error('Candidate coverage receipt report inventory is missing.');
  }
  const reports = new Map();
  for (const entry of receipt.reports) {
    const file = entry?.file;
    if (
      Object.keys(entry ?? {})
        .sort()
        .join(',') !== 'file,sha256' ||
      typeof file !== 'string' ||
      file.length === 0 ||
      file === '..' ||
      file.startsWith('../') ||
      path.posix.isAbsolute(file) ||
      path.posix.normalize(file) !== file ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '') ||
      reports.has(file)
    ) {
      throw new Error(`Malformed candidate coverage report identity: ${String(file)}`);
    }
    reports.set(file, entry.sha256);
  }
  return reports;
}

function validateCoverageEvidence(root, manifest, declared, trustedRoot) {
  const policy = readReleaseProofPolicy(
    trustedRoot,
    COVERAGE_PROOF_POLICY_PATH,
    'sniptale-coverage-proof-reuse-policy'
  );
  if (
    policy.proofPath !== '.tmp/qa/coverage-proof.json' ||
    policy.reportDirectory !== '.tmp/coverage/canonical' ||
    !Array.isArray(policy.reportFiles)
  ) {
    throw new Error(`Malformed release proof policy: ${COVERAGE_PROOF_POLICY_PATH}`);
  }
  const receipt = validateReceipt(root, policy.proofPath, 'sniptale-coverage-proof');
  if (receipt.producer?.controlDigest !== manifest.controlDigest) {
    throw new Error('Candidate coverage receipt crosses QA control digests.');
  }
  const receiptReports = parseCoverageReportInventory(receipt);
  const reportPrefix = `${policy.reportDirectory}/`;
  const admittedReports = new Map(
    [...declared.entries()]
      .filter(([file]) => file.startsWith(reportPrefix))
      .map(([file, digest]) => [file.slice(reportPrefix.length), digest])
  );
  for (const file of policy.reportFiles) {
    if (!receiptReports.has(file)) {
      throw new Error(`Candidate coverage receipt is missing required report: ${file}`);
    }
  }
  if (
    stableStringify([...receiptReports.entries()].sort()) !==
    stableStringify([...admittedReports.entries()].sort())
  ) {
    throw new Error('Candidate coverage receipt does not bind the admitted report inventory.');
  }
  validateReceiptReuse(manifest, 'coverage', receipt);
}

function validateRunRecord(root, manifest, lane, derived, trustedRoot) {
  const records = manifest.files
    .map(({ file }) => file)
    .filter((file) => file.startsWith('.tmp/qa-observability/runs/') && file.endsWith('.json'));
  if (records.length !== 1)
    throw new Error('Candidate proof must contain one top-level run record.');
  const record = JSON.parse(fs.readFileSync(path.join(root, records[0]), 'utf8'));
  if (
    record?.schemaVersion !== 4 ||
    record.wrapperId !== `ci:${lane}` ||
    record.status !== 'all-passed' ||
    record.exitCode !== 0 ||
    record.parentRunId !== null ||
    typeof record.log?.path !== 'string' ||
    !manifest.files.some(({ file }) => file === record.log.path)
  ) {
    throw new Error('Candidate proof run record is incomplete or has unexpected ownership.');
  }
  if (!derived && record.repository?.head !== manifest.commit) {
    throw new Error('Candidate proof run record is not bound to the candidate commit.');
  }
  if (!derived) {
    let inheritanceContext = null;
    if (lane === 'release') {
      const admission = JSON.parse(
        fs.readFileSync(path.join(root, '.tmp/ci/fast-proof-admission.json'), 'utf8')
      );
      const sourceRecord = JSON.parse(
        fs.readFileSync(path.join(root, 'fast-proof', admission.sourceRunRecord), 'utf8')
      );
      inheritanceContext = { admission, sourceRecord };
    }
    validateTrustedControlResults(record, lane, trustedRoot, inheritanceContext);
  }
}

function validateDerivedReuse(root, manifest, expected) {
  const receiptPath = path.join(root, '.tmp/ci/non-gate-reuse.json');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  if (
    receipt?.schemaVersion !== 1 ||
    receipt.artifactKind !== 'sniptale-non-gate-input-reuse' ||
    receipt.outcome !== 'passed' ||
    receipt.baseCommit !== expected.baseSha ||
    receipt.candidateCommit !== expected.commit ||
    receipt.gateInputDigest !== manifest.gateInputDigest ||
    receipt.sourceProofSemanticDigest !== manifest.derivation?.sourceProofSemanticDigest ||
    manifest.derivation?.baseCommit !== expected.baseSha
  ) {
    throw new Error('Candidate non-gate reuse receipt is incomplete or stale.');
  }
}

function validateManifestIdentity(manifest, expected) {
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.artifactKind !== 'sniptale-ci-proof' ||
    manifest.lane !== expected.lane ||
    manifest.status !== 'passed' ||
    manifest.workspaceMode !== expected.workspaceMode ||
    manifest.commit !== expected.commit ||
    manifest.baseSha !== expected.baseSha ||
    manifest.candidateTree !== expected.candidateTree ||
    manifest.trustedControlSha !== expected.trustedControlSha ||
    manifest.controlAuthority !== 'trusted-base' ||
    manifest.controlsChanged !== expected.controlsChanged ||
    manifest.controlDisposition !== expected.controlDisposition
  ) {
    throw new Error('Candidate proof identity does not match trusted admission inputs.');
  }
}

function validateManifestDigests(manifest, expected) {
  if (
    manifest.controlDigest !== expected.controlDigest ||
    manifest.trustedControlDigest !== expected.trustedControlDigest ||
    manifest.gateInputDigest !== expected.gateInputDigest ||
    manifest.executionEnvironment?.kind !== expected.executionEnvironmentKind ||
    !/^sha256:[a-f0-9]{64}$/u.test(manifest.executionEnvironment?.digest ?? '') ||
    (expected.executionEnvironmentDigest !== null &&
      manifest.executionEnvironment.digest !== expected.executionEnvironmentDigest) ||
    (expected.executionEnvironmentKind === 'locked-container' &&
      (manifest.containerDigest !== manifest.executionEnvironment.digest ||
        !/^sha256:[a-f0-9]{64}$/u.test(manifest.containerDigest ?? '') ||
        (expected.containerDigest !== null &&
          manifest.containerDigest !== expected.containerDigest))) ||
    (expected.executionEnvironmentKind === 'host-wsl' && manifest.containerDigest !== null)
  ) {
    throw new Error('Candidate proof digests do not match trusted admission inputs.');
  }
  const semanticDigest = createProofSemanticDigest({
    lane: expected.lane,
    commit: expected.commit,
    candidateTree: expected.candidateTree,
    trustedControlSha: expected.trustedControlSha,
    trustedControlDigest: expected.trustedControlDigest,
    controlDigest: expected.controlDigest,
    gateInputDigest: expected.gateInputDigest,
    executionEnvironment: manifest.executionEnvironment,
  });
  if (manifest.proofSemanticDigest !== semanticDigest) {
    throw new Error('Candidate proof semantic digest drifted.');
  }
}

function validateMandatoryPhases(manifest, lanePolicy, executionEnvironmentKind) {
  const phaseIds = manifest.phases?.map(({ id, status }) => {
    if (status !== 'passed') throw new Error(`Candidate proof phase did not pass: ${String(id)}`);
    return id;
  });
  const derived = JSON.stringify(phaseIds) === JSON.stringify(lanePolicy.derivedPhases);
  const expectedDisposition = derived ? 'derived-reuse' : 'executed';
  if (manifest.evidenceDisposition !== expectedDisposition) {
    throw new Error('Candidate proof evidence disposition is ambiguous.');
  }
  const freshPhases =
    executionEnvironmentKind === 'host-wsl' ? lanePolicy.hostFreshPhases : lanePolicy.freshPhases;
  if (!derived && JSON.stringify(phaseIds) !== JSON.stringify(freshPhases)) {
    throw new Error('Candidate proof mandatory phase sequence is incomplete.');
  }
  return derived;
}

function validateReuseReceipts(root, manifest, lane, archives, declared, lanePolicy, trustedRoot) {
  for (const [name, allowed] of Object.entries(lanePolicy.reuse)) {
    if (!allowed.includes(manifest.proofReuse?.[name])) {
      throw new Error(`Candidate proof has inadmissible ${name} reuse status.`);
    }
  }
  if (lane === 'release') {
    const build = validateReceipt(root, '.tmp/qa/build-proof.json', 'sniptale-build-zip-proof');
    if (
      build.producer?.id !== 'qa-release-archive-owner' ||
      build.producer.controlDigest !== manifest.controlDigest ||
      build.archive.file !== path.basename(archives[0]) ||
      build.archive.sha256 !== sha256(path.join(root, archives[0]))
    ) {
      throw new Error('Candidate build receipt does not bind the admitted ZIP.');
    }
    validateReceiptReuse(manifest, 'build', build);
  }
  if (lane === 'proof') {
    const unit = validateUnitReceipt(root);
    if (unit.producer?.controlDigest !== manifest.controlDigest) {
      throw new Error('Candidate receipt crosses QA control digests: .tmp/qa/unit-proof.json');
    }
    validateReceiptReuse(manifest, 'unit', unit);
  }
  if (lane !== 'release') return;
  const admission = JSON.parse(
    fs.readFileSync(path.join(root, '.tmp/ci/fast-proof-admission.json'), 'utf8')
  );
  const sourceManifest = JSON.parse(
    fs.readFileSync(path.join(root, 'fast-proof/proof-manifest.json'), 'utf8')
  );
  const sourceManifestDigest = `sha256:${crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'fast-proof/proof-manifest.json')))
    .digest('hex')}`;
  if (
    admission?.artifactKind !== 'sniptale-fast-proof-admission' ||
    admission.outcome !== 'admitted' ||
    admission.lane !== 'proof' ||
    admission.commit !== manifest.commit ||
    admission.candidateTree !== manifest.candidateTree ||
    admission.controlDigest !== manifest.controlDigest ||
    admission.workspaceMode !== sourceManifest.workspaceMode ||
    admission.workspaceMode !== manifest.workspaceMode ||
    admission.executionEnvironment?.kind !== sourceManifest.executionEnvironment?.kind ||
    admission.executionEnvironment?.kind !== manifest.executionEnvironment?.kind ||
    admission.executionEnvironment?.digest !== sourceManifest.executionEnvironment?.digest ||
    admission.executionEnvironment?.digest !== manifest.executionEnvironment?.digest ||
    admission.proofSemanticDigest !== sourceManifest.proofSemanticDigest ||
    admission.proofManifestDigest !== sourceManifestDigest ||
    sourceManifest.lane !== 'proof' ||
    sourceManifest.status !== 'passed'
  ) {
    throw new Error('Release proof is not bound to its admitted Fast proof source.');
  }
  const sourceFiles = new Map(
    (sourceManifest.files ?? []).map(({ file, sha256: digest }) => [file, digest])
  );
  for (const relative of [admission.sourceRunRecord, admission.sourceRunLog]) {
    if (
      typeof relative !== 'string' ||
      !relative.startsWith('.tmp/') ||
      declared.get(`fast-proof/${relative}`) !== sourceFiles.get(relative)
    ) {
      throw new Error('Inherited Fast proof observability evidence drifted.');
    }
  }
  for (const file of [
    '.tmp/qa/unit-proof.json',
    '.tmp/qa/coverage-proof.json',
    '.tmp/coverage/canonical/coverage-final.json',
    '.tmp/coverage/canonical/coverage-summary.json',
    '.tmp/coverage/canonical/lcov.info',
  ]) {
    if (declared.get(file) !== sourceFiles.get(file)) {
      throw new Error(`Inherited Fast proof evidence drifted: ${file}`);
    }
  }
  const sourceCoverage = [...sourceFiles.entries()]
    .filter(([file]) => file.startsWith('.tmp/coverage/canonical/html/'))
    .sort();
  const inheritedCoverage = [...declared.entries()]
    .filter(([file]) => file.startsWith('.tmp/coverage/canonical/html/'))
    .sort();
  if (stableStringify(sourceCoverage) !== stableStringify(inheritedCoverage)) {
    throw new Error('Inherited Fast proof coverage HTML inventory drifted.');
  }
  validateCodeqlEvidence(root, manifest, declared, trustedRoot);
  validateCoverageEvidence(root, manifest, declared, trustedRoot);
}

export function admitCandidateProof({
  artifactRoot,
  baseSha,
  candidateRoot,
  commit,
  expectedContainerDigest = null,
  expectedCandidateTree = null,
  expectedExecutionEnvironmentDigest = null,
  expectedExecutionEnvironmentKind = 'locked-container',
  expectedTrustedControlSha,
  expectedWorkspaceMode = 'committed',
  lane,
  trustedRoot = process.cwd(),
}) {
  if (!['proof', 'release'].includes(lane)) throw new Error(`Unsupported proof lane: ${lane}`);
  if (!/^[a-f0-9]{40}$/u.test(expectedTrustedControlSha ?? '')) {
    throw new Error('Trusted admission requires the exact base control SHA.');
  }
  const root = path.resolve(artifactRoot);
  const resolvedCandidate = path.resolve(candidateRoot);
  const policy = readPolicy(trustedRoot);
  const lanePolicy = policy.lanes[lane];
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'proof-manifest.json'), 'utf8'));
  const candidateTree =
    expectedCandidateTree ?? git(resolvedCandidate, ['rev-parse', `${commit}^{tree}`]);
  const controlDigest = createCandidateControlDigest({
    cwd: resolvedCandidate,
  });
  const trustedControlDigest = createCandidateControlDigest({
    cwd: trustedRoot,
  });
  const controlsChanged = controlDigest !== trustedControlDigest;
  const controlDisposition = controlsChanged ? 'candidate-controls' : 'trusted-controls';
  const gateInputDigest = createFastGateInputDigest({
    cwd: resolvedCandidate,
    policyRoot: trustedRoot,
  });
  const expected = {
    lane,
    commit,
    baseSha,
    candidateTree,
    trustedControlSha: expectedTrustedControlSha,
    trustedControlDigest,
    controlDigest,
    controlsChanged,
    controlDisposition,
    gateInputDigest,
    containerDigest: expectedContainerDigest,
    executionEnvironmentDigest: expectedExecutionEnvironmentDigest,
    executionEnvironmentKind: expectedExecutionEnvironmentKind,
    workspaceMode: expectedWorkspaceMode,
  };
  validateManifestIdentity(manifest, expected);
  validateManifestDigests(manifest, expected);
  const derived = validateMandatoryPhases(manifest, lanePolicy, expectedExecutionEnvironmentKind);
  if (derived && controlsChanged) {
    throw new Error('Derived proof cannot cross candidate control digests.');
  }
  if (lane === 'release' && (controlsChanged || expectedTrustedControlSha !== commit)) {
    throw new Error('Release proof requires QA controls already trusted by the main commit.');
  }
  const { archives, declared } = validateFileInventory(root, manifest, lane, lanePolicy);
  validateExecutionCompatibility(manifest, lane, lanePolicy, trustedRoot);
  validateReuseReceipts(root, manifest, lane, archives, declared, lanePolicy, trustedRoot);
  if (lane === 'proof' && (manifest.fullVitest !== true || manifest.releaseReady !== false)) {
    throw new Error('Fast proof must prove full Vitest without claiming release readiness.');
  }
  validateRunRecord(root, manifest, lane, derived, trustedRoot);
  if (derived) validateDerivedReuse(root, manifest, { baseSha, commit });
  return {
    schemaVersion: 1,
    artifactKind: 'sniptale-fast-proof-admission',
    outcome: 'admitted',
    lane,
    commit,
    trustedControlSha: expectedTrustedControlSha,
    trustedControlDigest,
    candidateTree,
    controlDigest,
    controlsChanged,
    controlDisposition,
    gateInputDigest,
    proofSemanticDigest: manifest.proofSemanticDigest,
    proofManifestDigest: `sha256:${sha256(path.join(root, 'proof-manifest.json'))}`,
    proofRoot: root,
    sourceRunRecord:
      manifest.files.find(({ file }) => file.startsWith('.tmp/qa-observability/runs/'))?.file ??
      null,
    sourceRunLog: manifest.files.find(({ file }) => file.startsWith('.tmp/qa-logs/'))?.file ?? null,
    workspaceMode: expectedWorkspaceMode,
    executionEnvironment: { ...manifest.executionEnvironment },
    derived,
    executionProfile: manifest.executionProfile,
    reuseCompatibility: manifest.reuseCompatibility,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [
    lane,
    artifactRoot,
    candidateRoot,
    commit,
    baseSha,
    expectedContainerDigest,
    expectedTrustedControlSha,
  ] = process.argv.slice(2);
  if (
    !lane ||
    !artifactRoot ||
    !candidateRoot ||
    !commit ||
    !baseSha ||
    !expectedTrustedControlSha
  ) {
    throw new Error(
      'Usage: admit-candidate-proof.mjs <proof|release> <artifact-root> <candidate-root> <commit> <base-sha> <container-digest-or-empty> <trusted-control-sha>'
    );
  }
  const admission = admitCandidateProof({
    artifactRoot,
    baseSha,
    candidateRoot,
    commit,
    expectedContainerDigest: expectedContainerDigest || null,
    expectedTrustedControlSha,
    lane,
  });
  process.stdout.write(`${JSON.stringify(admission)}\n`);
}
