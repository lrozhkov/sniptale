import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const POLICY_PATH = 'tooling/configs/ci/fast-gate-inputs.json';

function visit(cwd, relative, policy, output) {
  const normalized = relative.replaceAll(path.sep, '/');
  if (policy.excludedRoots.includes(normalized)) return;
  const absolute = path.join(cwd, relative);
  if (!fs.existsSync(absolute)) throw new Error(`Fast gate input is missing: ${normalized}`);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Fast gate input may not be a symlink: ${normalized}`);
  if (stat.isFile()) {
    output.add(normalized);
    return;
  }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (policy.excludedDirectoryNames.includes(entry.name)) continue;
    visit(cwd, path.join(relative, entry.name), policy, output);
  }
}

function readPolicy(cwd) {
  const policy = JSON.parse(fs.readFileSync(path.join(cwd, POLICY_PATH), 'utf8'));
  if (
    policy?.schemaVersion !== 1 ||
    policy.artifactKind !== 'sniptale-fast-gate-input-policy' ||
    !Array.isArray(policy.roots) ||
    !Array.isArray(policy.files) ||
    !Array.isArray(policy.excludedDirectoryNames) ||
    !Array.isArray(policy.excludedRoots) ||
    !Array.isArray(policy.nonGateOnlyRoots) ||
    !Array.isArray(policy.nonGateOnlyFiles) ||
    !Array.isArray(policy.ownerClosures) ||
    typeof policy.proof !== 'string' ||
    typeof policy.rollback !== 'string'
  ) {
    throw new Error('Malformed fast gate input policy.');
  }
  return policy;
}

function isUnderRoot(file, root) {
  return file === root || file.startsWith(`${root}/`);
}

export function classifyChangedPaths({ baseCommit, candidateCommit, candidateRoot, policyRoot }) {
  const policy = readPolicy(policyRoot);
  const result = spawnSync(
    'git',
    ['-C', candidateRoot, 'diff', '--name-only', '-z', baseCommit, candidateCommit, '--'],
    { encoding: 'utf8' }
  );
  if (result.status !== 0)
    throw new Error('Unable to enumerate candidate paths with trusted base.');
  const changedPaths = result.stdout.split('\0').filter(Boolean).sort();
  const unknownPaths = changedPaths.filter(
    (file) =>
      !policy.nonGateOnlyFiles.includes(file) &&
      !policy.nonGateOnlyRoots.some((root) => isUnderRoot(file, root))
  );
  return {
    changedPaths,
    nonGateOnly: changedPaths.length > 0 && unknownPaths.length === 0,
    unknownPaths,
  };
}

export function collectFastGateInputFiles({ cwd = process.cwd(), policyRoot = cwd } = {}) {
  const policy = readPolicy(policyRoot);
  const files = new Set();
  for (const root of policy.roots) visit(cwd, root, policy, files);
  for (const file of policy.files) visit(cwd, file, policy, files);
  return { files: [...files].sort(), policy };
}

export function createFastGateInputDigest({ cwd = process.cwd(), policyRoot = cwd } = {}) {
  const { files } = collectFastGateInputFiles({ cwd, policyRoot });
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(cwd, file));
    hash.update(`${file}\0${bytes.length}\0`);
    hash.update(bytes);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

export { POLICY_PATH as FAST_GATE_INPUT_POLICY_PATH };
