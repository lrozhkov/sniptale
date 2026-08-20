import fs from 'node:fs';
import path from 'node:path';

import {
  readProofInput as readRegularFile,
  resolveProofCommit as resolveCommit,
  sha256ProofInput as sha256Bytes,
  stableStringify,
} from './proof-input.mjs';

const POLICY_PATH = 'tooling/configs/qa/unit-proof-reuse.data.json';
const EXTERNAL_PROOF_ENV = 'SNIPTALE_UNIT_PROOF_PATH';
const CANDIDATE_AUTHORITY_ENV = 'SNIPTALE_UNIT_PROOF_AUTHORITY';
const TEST_FILE_PATTERN = /(?:\.test|\.spec)\.(?:ts|tsx)$/u;

function assertPathList(values, label) {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.some(
      (value) =>
        typeof value !== 'string' ||
        value.length === 0 ||
        path.isAbsolute(value) ||
        value === '..' ||
        value.startsWith('../')
    ) ||
    new Set(values).size !== values.length
  ) {
    throw new Error(`Malformed unit proof ${label}.`);
  }
}

function readPolicy(cwd) {
  const value = JSON.parse(fs.readFileSync(path.join(cwd, POLICY_PATH), 'utf8'));
  if (
    value?.schemaVersion !== 1 ||
    value.artifactKind !== 'sniptale-unit-proof-reuse-policy' ||
    !Array.isArray(value.excludedDirectoryNames) ||
    typeof value.proofPath !== 'string' ||
    value.proofPath !== '.tmp/qa/unit-proof.json' ||
    typeof value.owners !== 'object' ||
    value.owners === null ||
    typeof value.owners.decision !== 'string' ||
    typeof value.owners.execution !== 'string' ||
    typeof value.owners.ciTransport !== 'string' ||
    typeof value.owners.ciMount !== 'string' ||
    typeof value.modes !== 'object' ||
    value.modes === null ||
    !Array.isArray(value.digests) ||
    typeof value.proof !== 'string' ||
    typeof value.rollback !== 'string' ||
    typeof value.collisionCheck !== 'string'
  ) {
    throw new Error('Malformed unit proof reuse policy.');
  }
  assertPathList(value.inputRoots, 'input roots');
  assertPathList(value.testSupportRoots, 'test support roots');
  assertPathList(value.runnerRoots, 'runner roots');
  assertPathList(value.configFiles, 'config files');
  assertPathList(value.consumers, 'consumers');
  const roots = [...value.inputRoots, ...value.testSupportRoots, ...value.runnerRoots];
  if (
    roots.some((root, index) =>
      roots.some(
        (other, otherIndex) =>
          index !== otherIndex && (root === other || root.startsWith(`${other}/`))
      )
    )
  ) {
    throw new Error('Unit proof input roots overlap.');
  }
  return value;
}

function collectRootFiles(cwd, root, excludedNames, output) {
  const absoluteRoot = path.join(cwd, root);
  if (!fs.existsSync(absoluteRoot)) return;
  const stat = fs.lstatSync(absoluteRoot);
  if (stat.isSymbolicLink()) throw new Error(`Unit proof input may not be a symlink: ${root}`);
  if (stat.isFile()) {
    output.add(root);
    return;
  }
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (excludedNames.has(entry.name)) continue;
    const relative = path.posix.join(root, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Unit proof input may not be a symlink: ${relative}`);
    if (entry.isDirectory()) collectRootFiles(cwd, relative, excludedNames, output);
    else if (entry.isFile()) output.add(relative);
  }
}

function collectInputFiles(cwd, policy) {
  const files = new Set();
  const productFiles = new Set();
  const excludedNames = new Set(policy.excludedDirectoryNames);
  for (const root of policy.inputRoots) {
    collectRootFiles(cwd, root, excludedNames, productFiles);
  }
  for (const file of productFiles) files.add(file);
  for (const root of policy.testSupportRoots) {
    collectRootFiles(cwd, root, excludedNames, files);
  }
  for (const root of policy.runnerRoots) {
    const runnerFiles = new Set();
    collectRootFiles(cwd, root, excludedNames, runnerFiles);
    for (const file of runnerFiles) {
      if (!TEST_FILE_PATTERN.test(file)) files.add(file);
    }
  }
  for (const file of policy.configFiles) {
    if (!fs.existsSync(path.join(cwd, file)))
      throw new Error(`Unit proof input is missing: ${file}`);
    files.add(file);
  }
  return { files: [...files].sort(), productFiles: [...productFiles].sort() };
}

function fingerprintFiles(cwd, files) {
  return files.map((file) => {
    const absolute = path.join(cwd, file);
    return { file, sha256: sha256Bytes(readRegularFile(absolute)) };
  });
}

function createExecutionIdentity({ maxWorkers, pool, suite }) {
  const containerDigest = process.env.SNIPTALE_CI_CONTAINER_DIGEST ?? null;
  if (containerDigest !== null && !/^sha256:[a-f0-9]{64}$/u.test(containerDigest)) {
    throw new Error('Malformed unit proof container digest.');
  }
  return {
    arch: process.arch,
    containerDigest,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    node: process.version,
    platform: process.platform,
    pool,
    requestedCpuTokens: process.env.SNIPTALE_QA_CPU_TOKENS ?? null,
    requestedMemoryMiB: process.env.SNIPTALE_QA_MEMORY_MIB ?? null,
    suite,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    vitestMaxWorkers: maxWorkers,
  };
}

export function createFullUnitProofInputs({
  cwd = process.cwd(),
  maxWorkers = null,
  pool = null,
  suite = 'product',
} = {}) {
  const policy = readPolicy(cwd);
  const { files, productFiles } = collectInputFiles(cwd, policy);
  const fileDigests = fingerprintFiles(cwd, files);
  const testFiles = productFiles.filter((file) => TEST_FILE_PATTERN.test(file));
  const execution = createExecutionIdentity({ maxWorkers, pool, suite });
  const inputDigest = sha256Bytes(stableStringify({ execution, fileDigests, testFiles }));
  return { execution, fileDigests, inputDigest, policy, testFiles };
}

function createProofDigest(proof) {
  const unsigned = { ...proof };
  delete unsigned.proofDigest;
  return sha256Bytes(stableStringify(unsigned));
}

function parseProof(value) {
  if (
    value?.schemaVersion !== 1 ||
    value.artifactKind !== 'sniptale-full-unit-proof' ||
    value.outcome !== 'passed' ||
    !/^[a-f0-9]{64}$/u.test(value.inputDigest ?? '') ||
    !/^[a-f0-9]{64}$/u.test(value.proofDigest ?? '') ||
    !Array.isArray(value.fileDigests) ||
    !Array.isArray(value.testFiles) ||
    typeof value.execution !== 'object' ||
    value.execution === null ||
    createProofDigest(value) !== value.proofDigest
  ) {
    throw new Error('Malformed or corrupted full unit proof.');
  }
  return value;
}

function readProof(proofPath) {
  try {
    return parseProof(JSON.parse(readRegularFile(proofPath, 'utf8')));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function resolveProofPath(cwd, policy) {
  const externalPath = process.env[EXTERNAL_PROOF_ENV];
  if (externalPath) return { path: path.resolve(externalPath), authority: 'external' };
  if (process.env[CANDIDATE_AUTHORITY_ENV] === 'external-only') return null;
  return { path: path.join(cwd, policy.proofPath), authority: 'local' };
}

export function resolveReusableFullUnitProof(options = {}) {
  const current = createFullUnitProofInputs(options);
  const source = resolveProofPath(options.cwd ?? process.cwd(), current.policy);
  if (!source) {
    return { matched: false, reason: 'no admissible full unit proof' };
  }
  const proof = readProof(source.path);
  if (proof.error) return { matched: false, reason: proof.error };
  if (proof.inputDigest !== current.inputDigest) {
    return { matched: false, reason: 'full unit proof inputs changed' };
  }
  return { matched: true, plan: { mode: 'full' }, proof, source: `${source.authority} proof` };
}

function writeProof(cwd, policy, proof) {
  const destination = path.join(cwd, policy.proofPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, destination);
  return destination;
}

export function recordSuccessfulFullUnitProof({
  cwd = process.cwd(),
  maxWorkers = null,
  pool = null,
  suite = 'product',
  source = 'unknown',
  reusedFrom = null,
} = {}) {
  const inputs = createFullUnitProofInputs({ cwd, maxWorkers, pool, suite });
  const proof = {
    schemaVersion: 1,
    artifactKind: 'sniptale-full-unit-proof',
    outcome: 'passed',
    inputDigest: inputs.inputDigest,
    execution: inputs.execution,
    fileDigests: inputs.fileDigests,
    testFiles: inputs.testFiles,
    producer: {
      commit: resolveCommit(cwd),
      trustedControlSha: process.env.SNIPTALE_TRUSTED_CONTROL_SHA ?? null,
      source,
    },
    reusedFrom,
    recordedAt: new Date().toISOString(),
  };
  const sealedProof = { ...proof, proofDigest: createProofDigest(proof) };
  writeProof(cwd, inputs.policy, sealedProof);
  return sealedProof;
}
