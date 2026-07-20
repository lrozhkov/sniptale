import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { repoRoot, runCommand } from '../core/shared.mjs';

export const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const ZERO_SHA_PATTERN = /^0+$/u;

function splitOutput(stdout) {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function runRequiredCommand(command, args, options = {}) {
  const result = runCommand(command, args, options);
  if ((result.status ?? 1) !== 0) {
    const detail = result.stderr || result.stdout || `${command} ${args.join(' ')} failed`;
    throw Object.assign(new Error(detail.trim()), { status: result.status ?? 1 });
  }
  return result;
}

function runRepositoryGit(repositoryRoot, args) {
  const executable = process.platform === 'win32' ? 'git.exe' : 'git';
  return runRequiredCommand(executable, ['-C', repositoryRoot, ...args]);
}

function linkDependencyEntry(source, target, type) {
  fs.symlinkSync(source, target, type === 'directory' ? 'junction' : 'file');
}

function linkWorkspaceScope(sourceRoot, targetRoot, workspaceRoot, repositoryRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const source = path.join(sourceRoot, entry.name);
    const resolvedSource = fs.realpathSync(source);
    const repositoryRelative = path.relative(repositoryRoot, resolvedSource);
    const targetSource =
      repositoryRelative !== '' && !repositoryRelative.startsWith(`..${path.sep}`)
        ? path.join(workspaceRoot, repositoryRelative)
        : source;
    linkDependencyEntry(targetSource, path.join(targetRoot, entry.name), 'directory');
  }
}

function linkDependencies(repositoryRoot, workspaceRoot) {
  const sourceRoot = path.join(repositoryRoot, 'node_modules');
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(
      'Pre-push pushed-range proof requires the repository node_modules; run npm install first'
    );
  }

  const targetRoot = path.join(workspaceRoot, 'node_modules');
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const source = path.join(sourceRoot, entry.name);
    const target = path.join(targetRoot, entry.name);
    if (entry.name === '@sniptale' && entry.isDirectory()) {
      linkWorkspaceScope(source, target, workspaceRoot, repositoryRoot);
      continue;
    }
    linkDependencyEntry(source, target, entry.isDirectory() ? 'directory' : 'file');
  }
}

function resolveRangeBase(update, repositoryRoot) {
  if (!ZERO_SHA_PATTERN.test(update.remoteSha)) {
    return update.remoteSha;
  }

  return splitOutput(
    runRepositoryGit(repositoryRoot, [
      '-c',
      'user.name=Sniptale QA',
      '-c',
      'user.email=qa@sniptale.invalid',
      'commit-tree',
      EMPTY_TREE_SHA,
      '-m',
      'temporary pre-push empty base',
    ]).stdout
  )[0];
}

export function withPushedRangeWorkspace(
  update,
  callback,
  { linkInstalledDependencies = true, repositoryRoot = repoRoot } = {}
) {
  if (ZERO_SHA_PATTERN.test(update.localSha)) {
    return callback(null);
  }

  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-pre-push-'));
  const workspaceRoot = path.join(container, 'range');
  let worktreeCreated = false;

  try {
    runRepositoryGit(repositoryRoot, [
      'worktree',
      'add',
      '--detach',
      workspaceRoot,
      update.localSha,
    ]);
    worktreeCreated = true;
    const baseSha = resolveRangeBase(update, repositoryRoot);
    runRepositoryGit(workspaceRoot, ['reset', '--mixed', baseSha]);
    runRepositoryGit(workspaceRoot, ['add', '--all']);
    if (linkInstalledDependencies) {
      linkDependencies(repositoryRoot, workspaceRoot);
    }
    return callback(workspaceRoot);
  } finally {
    if (worktreeCreated) {
      runRepositoryGit(repositoryRoot, ['worktree', 'remove', '--force', workspaceRoot]);
    }
    fs.rmSync(container, { recursive: true, force: true });
  }
}

export function assertWorkspaceMatchesPushedTree(workspaceRoot, update) {
  const executable = process.platform === 'win32' ? 'git.exe' : 'git';
  const result = runCommand(executable, [
    '-C',
    workspaceRoot,
    'diff',
    '--quiet',
    update.localSha,
    '--',
  ]);
  if (result.status === 1) {
    throw Object.assign(
      new Error(
        `QA modified the pushed candidate for ${update.localRef}; commit the deterministic fixes before pushing`
      ),
      { status: 1 }
    );
  }
  if ((result.status ?? 1) !== 0) {
    throw Object.assign(new Error(result.stderr || 'Unable to compare the pushed candidate'), {
      status: result.status ?? 1,
    });
  }
  const untracked = runRequiredCommand(executable, [
    '-C',
    workspaceRoot,
    'ls-files',
    '--others',
    '--exclude-standard',
  ]);
  const untrackedFiles = splitOutput(untracked.stdout);
  if (untrackedFiles.length > 0) {
    throw Object.assign(
      new Error(`QA created inputs absent from ${update.localRef}: ${untrackedFiles.join(', ')}`),
      { status: 1 }
    );
  }
}
