import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { createProofSemanticDigest } from './artifacts.mjs';
import { createCandidateControlDigest } from './control-digest.mjs';
import { createFastGateInputDigest } from './fast-gate-inputs.mjs';
import { validateTrustedControlResults } from './trusted-control-matrix.mjs';
import { stableStringify } from '../qa/core/proof-input.mjs';

const POLICY_PATH = 'tooling/configs/ci/trusted-admission-policy.json';
const SEMANTICS_POLICY_PATH = 'tooling/configs/ci/proof-semantics.json';

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
  const minimum = semantics.reuseCompatibility?.[lane]?.minimumExecutionProfile;
  if (
    manifest.reuseCompatibility?.outcome !== 'compatible' ||
    !profile ||
    !minimum ||
    JSON.stringify(manifest.reuseCompatibility.minimumExecutionProfile) !==
      JSON.stringify(minimum) ||
    Object.entries(minimum).some(([name, value]) => profile[name] < value) ||
    manifest.gateClaim !== lanePolicy.claim ||
    manifest.fullVitest !== lanePolicy.fullVitest ||
    manifest.releaseReady !== lanePolicy.releaseReady
  ) {
    throw new Error('Candidate proof capability or execution profile is not admissible.');
  }
}

function listPhysicalFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Candidate proof contains a symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll(path.sep, '/'));
      else throw new Error(`Candidate proof contains an unsupported entry: ${absolute}`);
    }
  }
  visit(root);
  return files.sort();
}

function validateFileInventory(root, manifest, lanePolicy) {
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
  if (archives.length !== 1)
    throw new Error('Candidate proof must contain exactly one release ZIP.');
  const physical = listPhysicalFiles(root);
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

function validateRunRecord(root, manifest, lane, derived, trustedRoot) {
  const records = manifest.files
    .map(({ file }) => file)
    .filter((file) => file.startsWith('.tmp/qa-observability/runs/') && file.endsWith('.json'));
  if (records.length !== 1)
    throw new Error('Candidate proof must contain one top-level run record.');
  const record = JSON.parse(fs.readFileSync(path.join(root, records[0]), 'utf8'));
  if (
    record?.schemaVersion !== 3 ||
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
  if (!derived) validateTrustedControlResults(record, lane, trustedRoot);
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
    manifest.workspaceMode !== 'committed' ||
    manifest.commit !== expected.commit ||
    manifest.baseSha !== expected.baseSha ||
    manifest.candidateTree !== expected.candidateTree ||
    manifest.trustedControlSha !== expected.trustedControlSha ||
    manifest.controlAuthority !== 'trusted-base'
  ) {
    throw new Error('Candidate proof identity does not match trusted admission inputs.');
  }
}

function validateManifestDigests(manifest, expected) {
  if (
    manifest.controlDigest !== expected.controlDigest ||
    manifest.trustedControlDigest !== expected.trustedControlDigest ||
    manifest.gateInputDigest !== expected.gateInputDigest ||
    manifest.executionEnvironment?.kind !== 'locked-container' ||
    manifest.containerDigest !== manifest.executionEnvironment.digest ||
    !/^sha256:[a-f0-9]{64}$/u.test(manifest.containerDigest ?? '') ||
    (expected.containerDigest !== null && manifest.containerDigest !== expected.containerDigest)
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

function validateMandatoryPhases(manifest, lanePolicy) {
  const phaseIds = manifest.phases?.map(({ id, status }) => {
    if (status !== 'passed') throw new Error(`Candidate proof phase did not pass: ${String(id)}`);
    return id;
  });
  const derived = JSON.stringify(phaseIds) === JSON.stringify(lanePolicy.derivedPhases);
  const expectedDisposition = derived ? 'derived-reuse' : 'executed';
  if (manifest.evidenceDisposition !== expectedDisposition) {
    throw new Error('Candidate proof evidence disposition is ambiguous.');
  }
  if (!derived && JSON.stringify(phaseIds) !== JSON.stringify(lanePolicy.freshPhases)) {
    throw new Error('Candidate proof mandatory phase sequence is incomplete.');
  }
  return derived;
}

function validateReuseReceipts(root, manifest, lane, archives, lanePolicy) {
  for (const [name, allowed] of Object.entries(lanePolicy.reuse)) {
    if (!allowed.includes(manifest.proofReuse?.[name])) {
      throw new Error(`Candidate proof has inadmissible ${name} reuse status.`);
    }
  }
  const build = validateReceipt(root, '.tmp/qa/build-proof.json', 'sniptale-build-zip-proof');
  if (
    build.producer?.id !== 'qa-release-archive-owner' ||
    build.archive.file !== path.basename(archives[0]) ||
    build.archive.sha256 !== sha256(path.join(root, archives[0]))
  ) {
    throw new Error('Candidate build receipt does not bind the admitted ZIP.');
  }
  if (lane !== 'release') return;
  validateReceipt(root, '.tmp/qa/unit-proof.json', 'sniptale-full-unit-proof');
  validateReceipt(root, '.tmp/qa/codeql-proof.json', 'sniptale-codeql-proof');
  validateReceipt(root, '.tmp/qa/coverage-proof.json', 'sniptale-coverage-proof');
}

export function admitCandidateProof({
  artifactRoot,
  baseSha,
  candidateRoot,
  commit,
  expectedContainerDigest = null,
  expectedTrustedControlSha,
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
  const candidateTree = git(resolvedCandidate, ['rev-parse', `${commit}^{tree}`]);
  const controlDigest = createCandidateControlDigest({ cwd: resolvedCandidate });
  const trustedControlDigest = createCandidateControlDigest({ cwd: trustedRoot });
  if (controlDigest !== trustedControlDigest) {
    throw new Error('Candidate controls differ from trusted base and require bootstrap bypass.');
  }
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
    gateInputDigest,
    containerDigest: expectedContainerDigest,
  };
  validateManifestIdentity(manifest, expected);
  validateManifestDigests(manifest, expected);
  const derived = validateMandatoryPhases(manifest, lanePolicy);
  const { archives } = validateFileInventory(root, manifest, lanePolicy);
  validateExecutionCompatibility(manifest, lane, lanePolicy, trustedRoot);
  validateReuseReceipts(root, manifest, lane, archives, lanePolicy);
  if (lane === 'proof' && manifest.fullVitest !== false) {
    throw new Error('Fast proof must not claim full Vitest or release readiness.');
  }
  validateRunRecord(root, manifest, lane, derived, trustedRoot);
  if (derived) validateDerivedReuse(root, manifest, { baseSha, commit });
  return {
    schemaVersion: 1,
    artifactKind: 'sniptale-trusted-proof-admission',
    outcome: 'passed',
    lane,
    commit,
    trustedControlSha: expectedTrustedControlSha,
    trustedControlDigest,
    candidateTree,
    controlDigest,
    gateInputDigest,
    proofSemanticDigest: manifest.proofSemanticDigest,
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
