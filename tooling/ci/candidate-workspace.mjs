import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;

function assertCommit(value, label) {
  if (!COMMIT_PATTERN.test(value ?? '')) throw new Error(`${label} must be a full commit SHA.`);
}

function runGit(args, { cwd, env, input } = {}) {
  const result = spawnSync('git', args, { cwd, env, input, encoding: 'buffer' });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed: ${String(result.stderr ?? '').trim() || 'unknown error'}`
    );
  }
  return Buffer.from(result.stdout ?? Buffer.alloc(0));
}

function readGit(args, cwd) {
  return runGit(args, { cwd }).toString('utf8').trim();
}

export function resolveCandidateIdentity({ root, baseSha, candidateSha }) {
  assertCommit(baseSha, 'Base SHA');
  assertCommit(candidateSha, 'Candidate SHA');
  for (const [label, sha] of [
    ['base', baseSha],
    ['candidate', candidateSha],
  ]) {
    if (readGit(['cat-file', '-t', sha], root) !== 'commit') {
      throw new Error(`${label} SHA is not a commit.`);
    }
  }
  return {
    baseSha,
    candidateSha,
    candidateTree: readGit(['rev-parse', `${candidateSha}^{tree}`], root),
  };
}

export function materializeCandidateWorkspace({ root, baseSha, candidateSha }) {
  const identity = resolveCandidateIdentity({ root, baseSha, candidateSha });
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-ci-candidate-'));
  const workspace = path.join(temporaryRoot, 'workspace');
  const authorityWorkspace = path.join(temporaryRoot, 'authority');
  try {
    runGit(['clone', '--local', '--no-hardlinks', '--no-checkout', '--quiet', root, workspace]);
    runGit([
      'clone',
      '--local',
      '--no-hardlinks',
      '--no-checkout',
      '--quiet',
      root,
      authorityWorkspace,
    ]);
    runGit(['checkout', '--quiet', '--detach', baseSha], { cwd: workspace });
    runGit(['config', 'core.hooksPath', '/dev/null'], { cwd: workspace });
    runGit(['config', 'user.name', 'Sniptale CI'], { cwd: workspace });
    runGit(['config', 'user.email', 'ci@sniptale.invalid'], { cwd: workspace });
    runGit(['remote', 'remove', 'origin'], { cwd: workspace });
    if (baseSha !== candidateSha) {
      const patch = runGit(
        ['diff', '--binary', '--full-index', '--find-renames', baseSha, candidateSha],
        { cwd: root }
      );
      runGit(['apply', '--index', '--binary', '--whitespace=nowarn', '-'], {
        cwd: workspace,
        input: patch,
      });
    }
    const stagedTree = readGit(['write-tree'], workspace);
    if (stagedTree !== identity.candidateTree) {
      throw new Error('Materialized candidate tree does not match the exact candidate commit.');
    }
    return { ...identity, authorityWorkspace, temporaryRoot, workspace };
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

function authorityEnvironment({ authorityWorkspace, cwd, indexPath }) {
  return {
    ...process.env,
    GIT_DIR: path.join(authorityWorkspace, '.git'),
    GIT_INDEX_FILE: indexPath,
    GIT_WORK_TREE: cwd,
  };
}

function verifyWorkspaceTree({ authorityWorkspace, candidateSha, candidateTree, cwd }) {
  const indexPath = path.join(authorityWorkspace, '.git', 'sniptale-candidate-index');
  fs.rmSync(indexPath, { force: true });
  const env = authorityEnvironment({ authorityWorkspace, cwd, indexPath });
  try {
    runGit(['read-tree', candidateSha], { cwd, env });
    runGit(['add', '--all'], { cwd, env });
    const workspaceTree = runGit(['write-tree'], { cwd, env }).toString('utf8').trim();
    if (workspaceTree !== candidateTree) {
      throw new Error(
        `Candidate worktree ${workspaceTree} does not match expected tree ${candidateTree}.`
      );
    }
  } finally {
    fs.rmSync(indexPath, { force: true });
  }
}

function restoreAuthorityGitDirectory({ authorityWorkspace, cwd }) {
  const workspaceGitDirectory = path.join(cwd, '.git');
  fs.rmSync(workspaceGitDirectory, { recursive: true, force: true });
  fs.cpSync(path.join(authorityWorkspace, '.git'), workspaceGitDirectory, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  runGit(['config', 'core.hooksPath', '/dev/null'], { cwd });
  runGit(['config', 'user.name', 'Sniptale CI'], { cwd });
  runGit(['config', 'user.email', 'ci@sniptale.invalid'], { cwd });
  runGit(['remote', 'remove', 'origin'], { cwd });
}

export function restoreCandidateDiff({
  authorityWorkspace,
  baseSha,
  candidateSha,
  candidateTree,
  cwd = process.cwd(),
}) {
  assertCommit(baseSha, 'Base SHA');
  assertCommit(candidateSha, 'Candidate SHA');
  verifyWorkspaceTree({ authorityWorkspace, candidateSha, candidateTree, cwd });
  restoreAuthorityGitDirectory({ authorityWorkspace, cwd });
  runGit(['reset', '--mixed', baseSha], { cwd });
  runGit(['add', '--all'], { cwd });
  if (readGit(['write-tree'], cwd) !== candidateTree) {
    throw new Error('Restored candidate diff does not reproduce the exact candidate tree.');
  }
  return { baseSha, candidateSha, candidateTree };
}

export function verifyCandidateCloseout({
  baseSha,
  candidateSha,
  candidateTree,
  cwd = process.cwd(),
}) {
  assertCommit(baseSha, 'Base SHA');
  assertCommit(candidateSha, 'Candidate SHA');
  if (!/^[a-f0-9]{40}$/u.test(candidateTree ?? '')) {
    throw new Error('Candidate tree must be a full Git tree SHA.');
  }
  const committedTree = readGit(['rev-parse', 'HEAD^{tree}'], cwd);
  const committedParent = readGit(['rev-parse', 'HEAD^'], cwd);
  const status = readGit(['status', '--porcelain=v1', '--untracked-files=all'], cwd);
  if (committedTree !== candidateTree) {
    throw new Error(
      `qa:closeout committed tree ${committedTree}, expected candidate tree ${candidateTree}.`
    );
  }
  if (committedParent !== baseSha) {
    throw new Error(`qa:closeout parent ${committedParent}, expected base ${baseSha}.`);
  }
  if (status) throw new Error(`qa:closeout left a dirty candidate workspace:\n${status}`);
  return { baseSha, candidateSha, candidateTree, committedTree };
}

export function restoreCandidateCommit({
  authorityWorkspace,
  candidateSha,
  candidateTree,
  cwd = process.cwd(),
}) {
  assertCommit(candidateSha, 'Candidate SHA');
  if (!/^[a-f0-9]{40}$/u.test(candidateTree ?? '')) {
    throw new Error('Candidate tree must be a full Git tree SHA.');
  }
  if (readGit(['rev-parse', `${candidateSha}^{tree}`], authorityWorkspace) !== candidateTree) {
    throw new Error('Candidate commit tree changed before history restoration.');
  }
  verifyWorkspaceTree({ authorityWorkspace, candidateSha, candidateTree, cwd });
  restoreAuthorityGitDirectory({ authorityWorkspace, cwd });
  runGit(['reset', '--mixed', candidateSha], { cwd });
  return verifyCandidateFinalState({ candidateSha, candidateTree, cwd });
}

export function verifyCandidateFinalState({ candidateSha, candidateTree, cwd = process.cwd() }) {
  assertCommit(candidateSha, 'Candidate SHA');
  if (!/^[a-f0-9]{40}$/u.test(candidateTree ?? '')) {
    throw new Error('Candidate tree must be a full Git tree SHA.');
  }
  const committedSha = readGit(['rev-parse', 'HEAD'], cwd);
  const committedTree = readGit(['rev-parse', 'HEAD^{tree}'], cwd);
  const trackedDrift = readGit(['status', '--porcelain=v1', '--untracked-files=no'], cwd);
  if (committedSha !== candidateSha || committedTree !== candidateTree || trackedDrift) {
    throw new Error('Candidate tracked state drifted after canonical QA execution.');
  }
  return { candidateSha, candidateTree, committedSha, committedTree };
}
