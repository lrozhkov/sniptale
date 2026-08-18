import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { readCodeqlProofPolicy } from '../codeql/config.mjs';

const EXTERNAL_PROOF_ENV = 'SNIPTALE_CODEQL_PROOF_PATH';
const EXTERNAL_SARIF_ENV = 'SNIPTALE_CODEQL_SARIF_PATH';
const CANDIDATE_AUTHORITY_ENV = 'SNIPTALE_CODEQL_PROOF_AUTHORITY';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)])
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function readRegularFile(filePath, encoding = null) {
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error(`Unsafe CodeQL proof input: ${filePath}`);
    return fs.readFileSync(descriptor, encoding === null ? undefined : encoding);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function isCodeqlProductionSourcePath(relativePath, policy) {
  const normalized = relativePath.replaceAll(path.sep, '/');
  const parts = normalized.split('/');
  const basename = parts.at(-1) ?? '';
  return (
    policy.sourceExtensions.includes(path.posix.extname(normalized)) &&
    !parts.some((part) => policy.excludedDirectoryNames.includes(part)) &&
    !policy.excludedFileMarkers.some((marker) => basename.includes(marker))
  );
}

function collectTreeFiles(
  root,
  relativeRoot,
  predicate,
  output,
  { excludedDirectoryNames = new Set() } = {}
) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return;
  const rootStat = fs.lstatSync(absoluteRoot);
  if (rootStat.isSymbolicLink())
    throw new Error(`CodeQL proof root may not be a symlink: ${relativeRoot}`);
  if (rootStat.isFile()) {
    if (predicate(relativeRoot)) output.add(relativeRoot);
    return;
  }
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relative = path.posix.join(relativeRoot, entry.name);
    if (excludedDirectoryNames.has(entry.name)) continue;
    if (entry.isSymbolicLink())
      throw new Error(`CodeQL proof input may not be a symlink: ${relative}`);
    if (entry.isDirectory()) {
      collectTreeFiles(root, relative, predicate, output, { excludedDirectoryNames });
    } else if (entry.isFile() && predicate(relative)) output.add(relative);
  }
}

function fingerprint(root, files) {
  const entries = [...files]
    .sort()
    .map((file) => ({ file, sha256: sha256(readRegularFile(path.join(root, file))) }));
  return { count: entries.length, digest: sha256(stableStringify(entries)) };
}

function collectSourceFingerprint(cwd, policy) {
  const files = new Set();
  const excludedDirectoryNames = new Set(policy.excludedDirectoryNames);
  for (const root of policy.sourceRoots) {
    collectTreeFiles(cwd, root, (file) => isCodeqlProductionSourcePath(file, policy), files, {
      excludedDirectoryNames,
    });
  }
  return fingerprint(cwd, files);
}

function collectControlFingerprint(controlRoot, policy) {
  const files = new Set();
  for (const file of policy.controlFiles) {
    if (!fs.existsSync(path.join(controlRoot, file)))
      throw new Error(`CodeQL control is missing: ${file}`);
    files.add(file);
  }
  for (const root of policy.queryRoots) collectTreeFiles(controlRoot, root, () => true, files);
  return fingerprint(controlRoot, files);
}

function resolveContainerDigest() {
  const digest = process.env.SNIPTALE_CI_CONTAINER_DIGEST ?? null;
  if (digest !== null && !/^sha256:[a-f0-9]{64}$/u.test(digest)) {
    throw new Error('Malformed CodeQL proof container digest.');
  }
  return digest;
}

function resolveCommit(cwd) {
  const configured = process.env.SNIPTALE_PROOF_SHA;
  if (/^[a-f0-9]{40}$/u.test(configured ?? '')) return configured;
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  return result.status === 0 && /^[a-f0-9]{40}$/u.test(result.stdout.trim())
    ? result.stdout.trim()
    : null;
}

export function createCodeqlProofInputs({ cwd = process.cwd(), controlRoot } = {}) {
  const trustedRoot = controlRoot ?? process.env.SNIPTALE_TRUSTED_CI_ROOT ?? cwd;
  const policy = readCodeqlProofPolicy(trustedRoot);
  const source = collectSourceFingerprint(cwd, policy);
  const controls = collectControlFingerprint(trustedRoot, policy);
  const execution = { containerDigest: resolveContainerDigest() };
  const inputDigest = sha256(stableStringify({ controls, execution, source }));
  return { controls, execution, inputDigest, policy, source, trustedRoot };
}

function createProofDigest(proof) {
  const unsigned = { ...proof };
  delete unsigned.proofDigest;
  return sha256(stableStringify(unsigned));
}

function parseProof(value) {
  if (
    value?.schemaVersion !== 1 ||
    value.artifactKind !== 'sniptale-codeql-proof' ||
    value.outcome !== 'passed' ||
    !/^[a-f0-9]{64}$/u.test(value.inputDigest ?? '') ||
    !/^[a-f0-9]{64}$/u.test(value.sarifSha256 ?? '') ||
    !/^[a-f0-9]{64}$/u.test(value.proofDigest ?? '') ||
    createProofDigest(value) !== value.proofDigest
  ) {
    throw new Error('Malformed or corrupted CodeQL proof.');
  }
  return value;
}

function resolveProofSource(cwd, policy) {
  const externalProof = process.env[EXTERNAL_PROOF_ENV];
  const externalSarif = process.env[EXTERNAL_SARIF_ENV];
  if (externalProof || externalSarif) {
    if (!externalProof || !externalSarif) return { error: 'incomplete external CodeQL proof' };
    return {
      authority: 'external',
      proofPath: path.resolve(externalProof),
      sarifPath: path.resolve(externalSarif),
    };
  }
  if (process.env[CANDIDATE_AUTHORITY_ENV] === 'external-only') return null;
  return {
    authority: 'local',
    proofPath: path.join(cwd, policy.proofPath),
    sarifPath: path.join(cwd, policy.sarifPath),
  };
}

export function resolveReusableCodeqlProof(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const current = createCodeqlProofInputs(options);
  const source = resolveProofSource(cwd, current.policy);
  if (!source) return { matched: false, reason: 'no admissible CodeQL proof' };
  if (source.error) return { matched: false, reason: source.error };
  try {
    const proof = parseProof(JSON.parse(readRegularFile(source.proofPath, 'utf8')));
    const sarif = readRegularFile(source.sarifPath);
    if (proof.inputDigest !== current.inputDigest) {
      return { matched: false, reason: 'CodeQL proof inputs changed' };
    }
    if (sha256(sarif) !== proof.sarifSha256) {
      return { matched: false, reason: 'CodeQL proof SARIF changed' };
    }
    return { matched: true, proof, sarif, source: `${source.authority} proof` };
  } catch (error) {
    return { matched: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function writeAtomic(destination, bytes) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes, { flag: 'wx' });
  fs.renameSync(temporary, destination);
}

export function materializeReusableCodeqlSarif(reusable, { cwd = process.cwd(), policy } = {}) {
  const resolvedPolicy =
    policy ?? readCodeqlProofPolicy(process.env.SNIPTALE_TRUSTED_CI_ROOT ?? cwd);
  const destination = path.join(cwd, resolvedPolicy.sarifPath);
  if (path.resolve(destination) !== path.resolve(process.env[EXTERNAL_SARIF_ENV] ?? '')) {
    fs.rmSync(destination, { force: true });
    writeAtomic(destination, reusable.sarif);
  }
  return destination;
}

export function removeLocalCodeqlProof({ cwd = process.cwd(), policy } = {}) {
  const resolvedPolicy =
    policy ?? readCodeqlProofPolicy(process.env.SNIPTALE_TRUSTED_CI_ROOT ?? cwd);
  fs.rmSync(path.join(cwd, resolvedPolicy.proofPath), { force: true });
}

export function recordSuccessfulCodeqlProof({
  cwd = process.cwd(),
  sarifPath,
  source = 'qa:audit',
  reusedFrom = null,
} = {}) {
  const inputs = createCodeqlProofInputs({ cwd });
  const sarif = readRegularFile(sarifPath);
  const proof = {
    schemaVersion: 1,
    artifactKind: 'sniptale-codeql-proof',
    outcome: 'passed',
    inputDigest: inputs.inputDigest,
    source: inputs.source,
    controls: inputs.controls,
    execution: inputs.execution,
    sarifSha256: sha256(sarif),
    producer: {
      commit: resolveCommit(cwd),
      trustedControlSha: process.env.SNIPTALE_TRUSTED_CONTROL_SHA ?? null,
      source,
    },
    reusedFrom,
    recordedAt: new Date().toISOString(),
  };
  const sealed = { ...proof, proofDigest: createProofDigest(proof) };
  writeAtomic(path.join(cwd, inputs.policy.proofPath), `${JSON.stringify(sealed, null, 2)}\n`);
  return sealed;
}
