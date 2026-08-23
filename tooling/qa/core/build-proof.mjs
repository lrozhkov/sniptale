import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  proofControlDigestMatches,
  resolveProofCommit,
  resolveProofControlDigest,
  stableStringify,
} from './proof-input.mjs';

const POLICY_PATH = 'tooling/configs/qa/build-proof-reuse.data.json';
const EXTERNAL_PROOF_ENV = 'SNIPTALE_BUILD_PROOF_PATH';
const EXTERNAL_ARCHIVE_ENV = 'SNIPTALE_BUILD_ARCHIVE_PATH';
const CANDIDATE_AUTHORITY_ENV = 'SNIPTALE_BUILD_PROOF_AUTHORITY';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function readRegularFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe build proof input: ${file}`);
  return fs.readFileSync(file);
}

function readPolicy(cwd) {
  const policy = JSON.parse(fs.readFileSync(path.join(cwd, POLICY_PATH), 'utf8'));
  if (
    policy?.schemaVersion !== 1 ||
    policy.artifactKind !== 'sniptale-build-proof-reuse-policy' ||
    policy.proofPath !== '.tmp/qa/build-proof.json' ||
    !Array.isArray(policy.inputRoots) ||
    !Array.isArray(policy.configFiles) ||
    !Array.isArray(policy.productionEnvironment) ||
    !Array.isArray(policy.canonicalProducerIds) ||
    !Array.isArray(policy.excludedDirectoryNames) ||
    typeof policy.proof !== 'string' ||
    typeof policy.rollback !== 'string' ||
    typeof policy.collisionCheck !== 'string'
  ) {
    throw new Error('Malformed build proof reuse policy.');
  }
  return policy;
}

function visit(cwd, relative, excludedNames, output) {
  const absolute = path.join(cwd, relative);
  if (!fs.existsSync(absolute)) throw new Error(`Build proof input is missing: ${relative}`);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Build proof input may not be a symlink: ${relative}`);
  if (stat.isFile()) {
    output.add(relative.replaceAll(path.sep, '/'));
    return;
  }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (excludedNames.has(entry.name)) continue;
    visit(cwd, path.join(relative, entry.name), excludedNames, output);
  }
}

export function createBuildProofInputs({ cwd = process.cwd() } = {}) {
  const policy = readPolicy(cwd);
  const files = new Set();
  const excludedNames = new Set(policy.excludedDirectoryNames);
  for (const root of policy.inputRoots) visit(cwd, root, excludedNames, files);
  for (const file of policy.configFiles) visit(cwd, file, excludedNames, files);
  const fileDigests = [...files].sort().map((file) => ({
    file,
    sha256: sha256(readRegularFile(path.join(cwd, file))),
  }));
  const execution = {
    architecture: process.arch,
    node: process.version,
    platform: process.platform,
    productionEnvironment: Object.fromEntries(
      policy.productionEnvironment.map((name) => [name, process.env[name] ?? null])
    ),
  };
  return {
    execution,
    fileDigests,
    inputDigest: sha256(stableStringify({ execution, fileDigests })),
    policy,
  };
}

function proofDigest(proof) {
  const unsigned = { ...proof };
  delete unsigned.proofDigest;
  return sha256(stableStringify(unsigned));
}

function parseProof(file) {
  const proof = JSON.parse(readRegularFile(file).toString('utf8'));
  if (
    proof?.schemaVersion !== 1 ||
    proof.artifactKind !== 'sniptale-build-zip-proof' ||
    proof.outcome !== 'passed' ||
    !/^[a-f0-9]{64}$/u.test(proof.inputDigest ?? '') ||
    !/^[a-f0-9]{64}$/u.test(proof.archive?.sha256 ?? '') ||
    !/^sniptale_[A-Za-z0-9._-]+\.zip$/u.test(proof.archive?.file ?? '') ||
    proofDigest(proof) !== proof.proofDigest
  ) {
    throw new Error('Malformed or corrupted build proof.');
  }
  return proof;
}

function resolveSource(cwd, policy) {
  const externalProof = process.env[EXTERNAL_PROOF_ENV];
  const externalArchive = process.env[EXTERNAL_ARCHIVE_ENV];
  if (externalProof || externalArchive) {
    if (!externalProof || !externalArchive) return { error: 'incomplete external build proof' };
    return { authority: 'external', archivePath: externalArchive, proofPath: externalProof };
  }
  if (process.env[CANDIDATE_AUTHORITY_ENV] === 'external-only') return null;
  const proofPath = path.join(cwd, policy.proofPath);
  if (!fs.existsSync(proofPath)) return null;
  const proof = parseProof(proofPath);
  return {
    authority: 'local',
    archivePath: path.join(cwd, 'build', proof.archive.file),
    proofPath,
  };
}

export function resolveReusableBuildProof({ cwd = process.cwd() } = {}) {
  const current = createBuildProofInputs({ cwd });
  const controlDigest = resolveProofControlDigest({ cwd });
  try {
    const source = resolveSource(cwd, current.policy);
    if (!source) return { matched: false, reason: 'no admissible build proof' };
    if (source.error) return { matched: false, reason: source.error };
    const proof = parseProof(source.proofPath);
    if (!proofControlDigestMatches(proof, controlDigest)) {
      return { matched: false, reason: 'build proof control digest changed' };
    }
    if (proof.inputDigest !== current.inputDigest) {
      return { matched: false, reason: 'build proof inputs changed' };
    }
    if (sha256(readRegularFile(source.archivePath)) !== proof.archive.sha256) {
      return { matched: false, reason: 'build proof archive changed' };
    }
    return { matched: true, ...source, proof, policy: current.policy };
  } catch (error) {
    return { matched: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function materializeReusableBuildArchive(reusable, { cwd = process.cwd() } = {}) {
  const destination = path.join(cwd, 'build', reusable.proof.archive.file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.reuse`;
  fs.copyFileSync(reusable.archivePath, temporary, fs.constants.COPYFILE_EXCL);
  fs.renameSync(temporary, destination);
  return destination;
}

export function recordSuccessfulBuildProof({
  archivePath,
  cwd = process.cwd(),
  producerId,
  reusedFrom = null,
} = {}) {
  const inputs = createBuildProofInputs({ cwd });
  const controlDigest = resolveProofControlDigest({ cwd });
  if (!inputs.policy.canonicalProducerIds.includes(producerId)) {
    throw new Error('Only the canonical release-archive owner may record build provenance.');
  }
  const absoluteArchive = path.resolve(cwd, archivePath);
  const archiveFile = path.basename(absoluteArchive);
  const proof = {
    schemaVersion: 1,
    artifactKind: 'sniptale-build-zip-proof',
    outcome: 'passed',
    inputDigest: inputs.inputDigest,
    execution: inputs.execution,
    fileDigests: inputs.fileDigests,
    archive: { file: archiveFile, sha256: sha256(readRegularFile(absoluteArchive)) },
    producer: {
      id: producerId,
      commit: resolveProofCommit(cwd),
      controlSha: process.env.SNIPTALE_TRUSTED_CONTROL_SHA ?? null,
      controlDigest,
    },
    reusedFrom,
    recordedAt: new Date().toISOString(),
  };
  const sealed = { ...proof, proofDigest: proofDigest(proof) };
  const destination = path.join(cwd, inputs.policy.proofPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(sealed, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, destination);
  return sealed;
}
