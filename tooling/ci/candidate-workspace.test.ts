import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/core/test-helpers';
import {
  materializeCandidateWorkspace,
  restoreCandidateCommit,
  restoreCandidateDiff,
  verifyCandidateCloseout,
  verifyCandidateFinalState,
} from './candidate-workspace.mjs';

function git(cwd: string, args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function createCandidateRepository() {
  const root = createTempRoot('ci-candidate-source-');
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'CI Test']);
  git(root, ['config', 'user.email', 'ci@example.test']);
  writeFile(root, 'renamed.txt', 'before\n');
  writeFile(root, 'deleted.txt', 'delete me\n');
  writeFile(root, 'script.sh', '#!/bin/sh\nexit 0\n');
  fs.chmodSync(path.join(root, 'script.sh'), 0o644);
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  const baseSha = git(root, ['rev-parse', 'HEAD']);

  fs.renameSync(path.join(root, 'renamed.txt'), path.join(root, 'moved.txt'));
  fs.rmSync(path.join(root, 'deleted.txt'));
  fs.chmodSync(path.join(root, 'script.sh'), 0o755);
  fs.writeFileSync(path.join(root, 'binary.bin'), Buffer.from([0, 1, 2, 255]));
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'candidate']);
  return { root, baseSha, candidateSha: git(root, ['rev-parse', 'HEAD']) };
}

function looseObjectPath(root: string, objectSha: string) {
  return path.join(root, '.git', 'objects', objectSha.slice(0, 2), objectSha.slice(2));
}

it('materializes the exact candidate tree as a staged diff over its base', () => {
  const source = createCandidateRepository();
  const candidate = materializeCandidateWorkspace(source);
  try {
    expect(git(candidate.workspace, ['rev-parse', 'HEAD'])).toBe(source.baseSha);
    expect(git(candidate.workspace, ['write-tree'])).toBe(candidate.candidateTree);
    expect(git(candidate.workspace, ['diff', '--cached', '--name-status'])).toContain('binary.bin');
    expect(fs.readFileSync(path.join(candidate.workspace, 'binary.bin'))).toEqual(
      Buffer.from([0, 1, 2, 255])
    );
    expect(fs.statSync(path.join(candidate.workspace, 'script.sh')).mode & 0o111).not.toBe(0);
  } finally {
    fs.rmSync(candidate.temporaryRoot, { recursive: true, force: true });
  }
});

it('copies local Git objects instead of hardlinking them to the source repository', () => {
  const source = createCandidateRepository();
  const candidate = materializeCandidateWorkspace(source);
  try {
    const sourceObject = fs.statSync(looseObjectPath(source.root, source.baseSha));
    const candidateObject = fs.statSync(looseObjectPath(candidate.workspace, source.baseSha));
    expect({ device: candidateObject.dev, inode: candidateObject.ino }).not.toEqual({
      device: sourceObject.dev,
      inode: sourceObject.ino,
    });
  } finally {
    fs.rmSync(candidate.temporaryRoot, { recursive: true, force: true });
  }
});

it('accepts only a clean closeout commit with the candidate tree and base parent', () => {
  const source = createCandidateRepository();
  const candidate = materializeCandidateWorkspace(source);
  try {
    git(candidate.workspace, ['commit', '--quiet', '-m', 'candidate closeout']);
    expect(() => verifyCandidateCloseout({ ...candidate, cwd: candidate.workspace })).not.toThrow();
    writeFile(candidate.workspace, 'drift.txt', 'drift\n');
    expect(() => verifyCandidateCloseout({ ...candidate, cwd: candidate.workspace })).toThrow(
      'left a dirty candidate workspace'
    );
  } finally {
    fs.rmSync(candidate.temporaryRoot, { recursive: true, force: true });
  }
});

it('restores the exact candidate commit before history-sensitive phases', () => {
  const source = createCandidateRepository();
  const candidate = materializeCandidateWorkspace(source);
  try {
    git(candidate.workspace, ['commit', '--quiet', '-m', 'candidate closeout']);
    expect(git(candidate.workspace, ['rev-parse', 'HEAD'])).not.toBe(candidate.candidateSha);
    writeFile(candidate.workspace, '.git/info/grafts', `${candidate.candidateSha}\n`);
    writeFile(candidate.workspace, '.git/refs/replace/forged', candidate.baseSha);
    restoreCandidateCommit({ ...candidate, cwd: candidate.workspace });
    expect(git(candidate.workspace, ['rev-parse', 'HEAD'])).toBe(candidate.candidateSha);
    expect(fs.existsSync(path.join(candidate.workspace, '.git/info/grafts'))).toBe(false);
    expect(fs.existsSync(path.join(candidate.workspace, '.git/refs/replace/forged'))).toBe(false);
    writeFile(candidate.workspace, 'build/generated.txt', 'generated\n');
    expect(() =>
      verifyCandidateFinalState({ ...candidate, cwd: candidate.workspace })
    ).not.toThrow();
    fs.appendFileSync(path.join(candidate.workspace, 'moved.txt'), 'tracked drift\n');
    expect(() => verifyCandidateFinalState({ ...candidate, cwd: candidate.workspace })).toThrow(
      'tracked state drifted'
    );
  } finally {
    fs.rmSync(candidate.temporaryRoot, { recursive: true, force: true });
  }
});

it('reconstructs the staged candidate diff from authority outside the candidate workspace', () => {
  const source = createCandidateRepository();
  const candidate = materializeCandidateWorkspace(source);
  try {
    writeFile(candidate.workspace, '.git/shallow', `${candidate.baseSha}\n`);
    restoreCandidateDiff({ ...candidate, cwd: candidate.workspace });
    expect(git(candidate.workspace, ['rev-parse', 'HEAD'])).toBe(candidate.baseSha);
    expect(git(candidate.workspace, ['write-tree'])).toBe(candidate.candidateTree);
    expect(fs.existsSync(path.join(candidate.workspace, '.git/shallow'))).toBe(false);
  } finally {
    fs.rmSync(candidate.temporaryRoot, { recursive: true, force: true });
  }
});

it('fails closed when a candidate phase changes the tracked worktree', () => {
  const source = createCandidateRepository();
  const candidate = materializeCandidateWorkspace(source);
  try {
    fs.appendFileSync(path.join(candidate.workspace, 'moved.txt'), 'hostile drift\n');
    expect(() => restoreCandidateDiff({ ...candidate, cwd: candidate.workspace })).toThrow(
      'does not match expected tree'
    );
  } finally {
    fs.rmSync(candidate.temporaryRoot, { recursive: true, force: true });
  }
});

it('rejects candidate identity restoration when the expected tree is forged', () => {
  const source = createCandidateRepository();
  const candidate = materializeCandidateWorkspace(source);
  try {
    git(candidate.workspace, ['commit', '--quiet', '-m', 'candidate closeout']);
    expect(() =>
      restoreCandidateCommit({
        ...candidate,
        candidateTree: source.baseSha,
        cwd: candidate.workspace,
      })
    ).toThrow('Candidate commit tree changed');
  } finally {
    fs.rmSync(candidate.temporaryRoot, { recursive: true, force: true });
  }
});
