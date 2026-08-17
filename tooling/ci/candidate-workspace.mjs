import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;

function assertCommit(value, label) {
  if (!COMMIT_PATTERN.test(value ?? '')) throw new Error(`${label} must be a full commit SHA.`);
}

function runGit(args, { cwd, input } = {}) {
  const result = spawnSync('git', args, { cwd, input, encoding: 'buffer' });
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
  try {
    runGit(['clone', '--local', '--no-hardlinks', '--no-checkout', '--quiet', root, workspace]);
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
    return { ...identity, temporaryRoot, workspace };
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
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

export function verifyCandidateFinalState({
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
  const trackedDrift = readGit(['status', '--porcelain=v1', '--untracked-files=no'], cwd);
  if (committedTree !== candidateTree || committedParent !== baseSha || trackedDrift) {
    throw new Error('Candidate tracked state drifted after canonical QA execution.');
  }
  return { baseSha, candidateSha, candidateTree, committedTree };
}
