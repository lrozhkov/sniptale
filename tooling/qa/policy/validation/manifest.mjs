import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VALIDATION_MANIFEST_PATH = 'tooling/configs/qa/validation-manifest.json';
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const MANIFEST_KEYS = ['$comment', 'claims', 'schemaVersion'];
const COMMON_CLAIM_KEYS = ['claim', 'states', 'testFiles', 'validationMode'];
const VALIDATION_MODES = new Set([
  'argument-contract + live-smoke',
  'canonical-control-fixture',
  'fixture-test',
  'fixture-test + live-smoke',
  'injected-runner-test',
  'static-contract',
  'wrapper-contract + live-smoke',
]);
const VALIDATION_STATES = new Set(['fail', 'pass', 'skip']);
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]s|tsx)$/u;
const CONTROL_ID_PATTERN = /^qa\.rule\.[a-z0-9-]+$/u;

function assertExactKeys(value, expectedKeys, label) {
  const actualKeys = value && typeof value === 'object' ? Object.keys(value).sort() : [];
  if (JSON.stringify(actualKeys) !== JSON.stringify([...expectedKeys].sort())) {
    throw new Error(`${label} keys must be exactly: ${expectedKeys.join(', ')}`);
  }
}

function assertRepositoryPath(value, label, { test = false } = {}) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    path.isAbsolute(value) ||
    value !== path.posix.normalize(value) ||
    value.startsWith('../') ||
    value.includes('/../') ||
    (test && !TEST_FILE_PATTERN.test(value))
  ) {
    throw new Error(`${label} must be a normalized repository-relative ${test ? 'test ' : ''}path`);
  }
}

function assertUniqueStringArray(value, label, { allowed = null, paths = false } = {}) {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length) {
    throw new Error(`${label} must be a non-empty array of unique strings`);
  }
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || (allowed && !allowed.has(item))) {
      throw new Error(`${label} contains an unsupported value`);
    }
    if (paths) assertRepositoryPath(item, label, { test: true });
  }
}

export function validationClaimIdentity(claim) {
  return claim.claim === 'control' ? `control:${claim.controlId}` : `executable:${claim.source}`;
}

function parseClaim(entry, index, { controlExists, sourceExists, testExists }) {
  const label = `validation claim ${index}`;
  if (entry?.claim === 'control') {
    assertExactKeys(entry, [...COMMON_CLAIM_KEYS, 'controlId'], label);
    if (!CONTROL_ID_PATTERN.test(entry.controlId)) {
      throw new Error(`${label} controlId must be a canonical QA control id`);
    }
    if (!controlExists(entry.controlId)) {
      throw new Error(`${label} control does not exist: ${entry.controlId}`);
    }
  } else if (entry?.claim === 'executable') {
    assertExactKeys(entry, [...COMMON_CLAIM_KEYS, 'source'], label);
    assertRepositoryPath(entry.source, `${label} source`);
    if (!sourceExists(entry.source)) {
      throw new Error(`${label} executable source does not exist: ${entry.source}`);
    }
  } else {
    throw new Error(`${label} claim must be control or executable`);
  }
  if (!VALIDATION_MODES.has(entry.validationMode)) {
    throw new Error(`${label} validationMode is unsupported`);
  }
  assertUniqueStringArray(entry.testFiles, `${label} testFiles`, {
    paths: true,
  });
  assertUniqueStringArray(entry.states, `${label} states`, {
    allowed: VALIDATION_STATES,
  });
  if (!entry.states.includes('pass') || !entry.states.includes('fail')) {
    throw new Error(`${label} states must prove pass and fail`);
  }
  for (const testFile of entry.testFiles) {
    if (!testExists(testFile)) throw new Error(`${label} test does not exist: ${testFile}`);
  }
  return {
    claim: entry.claim,
    ...(entry.claim === 'control' ? { controlId: entry.controlId } : { source: entry.source }),
    validationMode: entry.validationMode,
    testFiles: [...entry.testFiles],
    states: [...entry.states],
  };
}

export function parseValidationManifest(
  value,
  { controlExists = () => true, sourceExists = () => true, testExists = () => true } = {}
) {
  assertExactKeys(value, MANIFEST_KEYS, 'validation manifest');
  if (value.schemaVersion !== 3 || !Array.isArray(value.claims)) {
    throw new Error('validation manifest requires schemaVersion 3 and a claims array');
  }
  const identities = new Set();
  return value.claims.map((entry, index) => {
    const claim = parseClaim(entry, index, {
      controlExists,
      sourceExists,
      testExists,
    });
    const identity = validationClaimIdentity(claim);
    if (identities.has(identity)) throw new Error(`duplicate validation claim: ${identity}`);
    identities.add(identity);
    return claim;
  });
}

export function loadValidationManifest({
  manifestPath = VALIDATION_MANIFEST_PATH,
  root = repositoryRoot,
  controlExists = () => true,
  executableExists = (source) => fs.existsSync(path.join(root, source)),
} = {}) {
  const value = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
  return parseValidationManifest(value, {
    controlExists,
    sourceExists: executableExists,
    testExists: (testFile) => fs.existsSync(path.join(root, testFile)),
  });
}
