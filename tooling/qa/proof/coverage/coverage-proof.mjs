import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { collectProductionCoverageFiles } from './coverage-audit-report.mjs';
import {
  createProofDigest,
  proofControlDigestMatches,
  resolveProofControlDigest,
  stableStringify,
  writeSealedProofJson,
} from '../contracts/proof-input.mjs';

const POLICY_PATH = 'tooling/configs/qa/coverage-proof-reuse.data.json';
const EXTERNAL_PROOF_ENV = 'SNIPTALE_COVERAGE_PROOF_PATH';
const EXTERNAL_REPORTS_ENV = 'SNIPTALE_COVERAGE_REPORTS_PATH';
const CANDIDATE_AUTHORITY_ENV = 'SNIPTALE_COVERAGE_PROOF_AUTHORITY';
const TEST_PATTERN = /(?:\.test|\.spec)\.(?:[cm]?[jt]sx?)$/u;
const EXECUTABLE_TEST_SUPPORT_PATTERN = /\.(?:[cm]?[jt]sx?)$/u;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function regularBytes(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Unsafe coverage proof input: ${file}`);
  return fs.readFileSync(file);
}

function readPolicy(cwd) {
  const policy = JSON.parse(fs.readFileSync(path.join(cwd, POLICY_PATH), 'utf8'));
  if (
    policy?.schemaVersion !== 1 ||
    policy.artifactKind !== 'sniptale-coverage-proof-reuse-policy' ||
    policy.proofPath !== '.tmp/qa/coverage-proof.json' ||
    policy.reportDirectory !== '.tmp/coverage/canonical' ||
    !Array.isArray(policy.productionRoots) ||
    !Array.isArray(policy.testRoots) ||
    !Array.isArray(policy.testSupportRoots) ||
    !Array.isArray(policy.configFiles) ||
    !Array.isArray(policy.reportFiles) ||
    !Array.isArray(policy.consumers) ||
    !Array.isArray(policy.digests) ||
    typeof policy.modes !== 'object' ||
    typeof policy.proof !== 'string' ||
    typeof policy.rollback !== 'string' ||
    typeof policy.collisionCheck !== 'string'
  )
    throw new Error('Malformed coverage proof reuse policy.');
  return policy;
}

function walk(cwd, relative, predicate, output) {
  const absolute = path.join(cwd, relative);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink())
    throw new Error(`Coverage proof input may not be a symlink: ${relative}`);
  if (stat.isFile()) {
    if (predicate(relative)) output.add(relative);
    return;
  }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (['.git', '.tmp', 'build', 'dist', 'node_modules'].includes(entry.name)) continue;
    walk(cwd, path.posix.join(relative, entry.name), predicate, output);
  }
}

function fingerprint(cwd, files) {
  const entries = [...files]
    .sort()
    .map((file) => ({ file, sha256: sha256(regularBytes(path.join(cwd, file))) }));
  return { count: entries.length, digest: sha256(stableStringify(entries)) };
}

export function createCoverageProofInputs({ cwd = process.cwd() } = {}) {
  const policy = readPolicy(cwd);
  const productionFiles = collectProductionCoverageFiles({ root: cwd });
  const tests = new Set();
  for (const root of policy.testRoots) walk(cwd, root, (file) => TEST_PATTERN.test(file), tests);
  for (const root of policy.testSupportRoots) {
    walk(cwd, root, (file) => EXECUTABLE_TEST_SUPPORT_PATTERN.test(file), tests);
  }
  const configs = new Set(policy.configFiles);
  for (const file of configs)
    if (!fs.existsSync(path.join(cwd, file)))
      throw new Error(`Coverage proof input is missing: ${file}`);
  const containerDigest = process.env.SNIPTALE_CI_CONTAINER_DIGEST ?? null;
  if (containerDigest !== null && !/^sha256:[a-f0-9]{64}$/u.test(containerDigest))
    throw new Error('Malformed coverage proof image digest.');
  const inputs = {
    production: fingerprint(cwd, productionFiles),
    tests: fingerprint(cwd, tests),
    configuration: fingerprint(cwd, configs),
    dependency: fingerprint(cwd, new Set(['package.json', 'package-lock.json'])),
    image: containerDigest,
  };
  return { ...inputs, inputDigest: sha256(stableStringify(inputs)), policy };
}

function reportDigests(root, policy) {
  for (const file of policy.reportFiles) regularBytes(path.join(root, file));
  const files = new Set();
  walk(root, '.', () => true, files);
  return [...files]
    .map((file) => file.replace(/^\.\//u, ''))
    .sort()
    .map((file) => ({ file, sha256: sha256(regularBytes(path.join(root, file))) }));
}

function parseProof(file) {
  const proof = JSON.parse(regularBytes(file).toString('utf8'));
  if (
    proof?.schemaVersion !== 1 ||
    proof.artifactKind !== 'sniptale-coverage-proof' ||
    proof.outcome !== 'passed' ||
    !/^[a-f0-9]{64}$/u.test(proof.inputDigest ?? '') ||
    !Array.isArray(proof.reports) ||
    createProofDigest(proof) !== proof.proofDigest
  )
    throw new Error('Malformed or corrupted coverage proof.');
  return proof;
}

export function resolveReusableCoverageProof({ cwd = process.cwd() } = {}) {
  const current = createCoverageProofInputs({ cwd });
  const controlDigest = resolveProofControlDigest({ cwd });
  const externalProof = process.env[EXTERNAL_PROOF_ENV];
  const externalReports = process.env[EXTERNAL_REPORTS_ENV];
  const localAllowed = process.env[CANDIDATE_AUTHORITY_ENV] !== 'external-only';
  const proofPath =
    externalProof ?? (localAllowed ? path.join(cwd, current.policy.proofPath) : null);
  const reportsRoot =
    externalReports ?? (localAllowed ? path.join(cwd, current.policy.reportDirectory) : null);
  if (!proofPath || !reportsRoot) return { matched: false, reason: 'no admissible coverage proof' };
  try {
    const proof = parseProof(proofPath);
    if (!proofControlDigestMatches(proof, controlDigest))
      return { matched: false, reason: 'coverage proof control digest changed' };
    if (proof.inputDigest !== current.inputDigest)
      return { matched: false, reason: 'coverage proof inputs changed' };
    if (
      stableStringify(reportDigests(reportsRoot, current.policy)) !== stableStringify(proof.reports)
    )
      return { matched: false, reason: 'coverage proof reports changed' };
    return {
      matched: true,
      proof,
      reportsRoot,
      policy: current.policy,
      source: externalProof ? 'external proof' : 'local proof',
    };
  } catch (error) {
    return { matched: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function materializeReusableCoverageProof(reusable, { cwd = process.cwd() } = {}) {
  const destination = path.join(cwd, reusable.policy.reportDirectory);
  if (path.resolve(destination) !== path.resolve(reusable.reportsRoot)) {
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(reusable.reportsRoot, destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  return destination;
}

export function recordSuccessfulCoverageProof({ cwd = process.cwd(), reusedFrom = null } = {}) {
  const inputs = createCoverageProofInputs({ cwd });
  const controlDigest = resolveProofControlDigest({ cwd });
  const reportsRoot = path.join(cwd, inputs.policy.reportDirectory);
  const proof = {
    schemaVersion: 1,
    artifactKind: 'sniptale-coverage-proof',
    outcome: 'passed',
    inputDigest: inputs.inputDigest,
    production: inputs.production,
    tests: inputs.tests,
    configuration: inputs.configuration,
    dependency: inputs.dependency,
    image: inputs.image,
    reports: reportDigests(reportsRoot, inputs.policy),
    producer: {
      commit: process.env.SNIPTALE_PROOF_SHA ?? null,
      trustedControlSha: process.env.SNIPTALE_TRUSTED_CONTROL_SHA ?? null,
      controlDigest,
    },
    reusedFrom,
    recordedAt: new Date().toISOString(),
  };
  const destination = path.join(cwd, inputs.policy.proofPath);
  return writeSealedProofJson(destination, proof);
}
