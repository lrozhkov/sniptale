import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { admitCandidateProof } from './admit-candidate-proof.mjs';

export const LOCAL_FAST_PROOF_ADMISSION = '.tmp/ci/fast-proof-admission.json';

function git(args, environment = process.env) {
  const result = spawnSync('git', args, { encoding: 'utf8', env: environment });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed.`);
  return result.stdout.trim();
}

export function materializeWorkspaceTree() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-fast-proof-index-'));
  const environment = { ...process.env, GIT_INDEX_FILE: path.join(temporaryRoot, 'index') };
  try {
    git(['read-tree', 'HEAD'], environment);
    git(['add', '--all', '--', '.'], environment);
    return git(['write-tree'], environment);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function listProofRoots(artifactParent = 'build/ci-artifacts') {
  if (!fs.existsSync(artifactParent)) return [];
  return fs
    .readdirSync(artifactParent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('proof-'))
    .map((entry) => path.resolve(artifactParent, entry.name))
    .filter((root) => fs.existsSync(path.join(root, 'proof-manifest.json')));
}

function readManifest(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'proof-manifest.json'), 'utf8'));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, file);
}

export function findLocalFastProofRoot({
  candidateTree,
  executionEnvironmentKind,
  workspaceMode = 'local-workspace',
} = {}) {
  return (
    listProofRoots()
      .map((root) => ({ root, manifest: readManifest(root) }))
      .filter(
        ({ manifest }) =>
          manifest.lane === 'proof' &&
          manifest.status === 'passed' &&
          manifest.candidateTree === candidateTree &&
          manifest.workspaceMode === workspaceMode &&
          manifest.executionEnvironment?.kind === executionEnvironmentKind
      )
      .sort((left, right) => right.root.localeCompare(left.root))[0]?.root ?? null
  );
}

export function prepareLocalFastProofAdmission({
  candidateTree = materializeWorkspaceTree(),
  executionEnvironmentKind = 'host-wsl',
  expectedExecutionEnvironmentDigest,
  workspaceMode = 'local-workspace',
} = {}) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(expectedExecutionEnvironmentDigest ?? '')) {
    throw new Error('Local Fast proof admission requires the current host environment digest.');
  }
  const commit = git(['rev-parse', 'HEAD']);
  const candidates = listProofRoots()
    .map((root) => ({ root, manifest: readManifest(root) }))
    .filter(
      ({ manifest }) =>
        manifest.lane === 'proof' &&
        manifest.status === 'passed' &&
        manifest.commit === commit &&
        manifest.candidateTree === candidateTree &&
        manifest.workspaceMode === workspaceMode &&
        manifest.executionEnvironment?.kind === executionEnvironmentKind
    )
    .sort((left, right) => right.root.localeCompare(left.root));
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const admission = admitCandidateProof({
        artifactRoot: candidate.root,
        baseSha: candidate.manifest.baseSha,
        candidateRoot: process.cwd(),
        commit,
        expectedCandidateTree: candidateTree,
        expectedContainerDigest: candidate.manifest.containerDigest,
        expectedExecutionEnvironmentDigest,
        expectedExecutionEnvironmentKind: executionEnvironmentKind,
        expectedTrustedControlSha: commit,
        expectedWorkspaceMode: workspaceMode,
        lane: 'proof',
      });
      writeJsonAtomic(LOCAL_FAST_PROOF_ADMISSION, admission);
      return { admission, admissionPath: path.resolve(LOCAL_FAST_PROOF_ADMISSION) };
    } catch (error) {
      lastError = error;
    }
  }
  const proofCommand =
    executionEnvironmentKind === 'locked-container'
      ? 'npm run ci:proof:container'
      : 'npm run ci:proof';
  throw new Error(
    `CI release prerequisite failed: no exact ${executionEnvironmentKind} Fast proof ` +
      `for candidate tree ${candidateTree}. Run ${proofCommand}.` +
      (lastError instanceof Error ? ` Last rejected proof: ${lastError.message}` : '')
  );
}
