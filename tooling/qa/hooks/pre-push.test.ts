import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { expect, it, vi } from 'vitest';

import {
  collectPushedFiles,
  parsePrePushUpdates,
  resolvePrePushCommands,
  runPrePushProof,
  withPushedRangeWorkspace,
} from './pre-push.mjs';
import { createTempRoot, initGitRepo, runGit, writeFile } from '../core/test-helpers';

const LOCAL_SHA = '1234567890123456789012345678901234567890';
const REMOTE_SHA = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
const ZERO_SHA = '0000000000000000000000000000000000000000';

function gitOutput(root: string, ...args: string[]) {
  return execFileSync(process.platform === 'win32' ? 'git.exe' : 'git', args, {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

it('parses pre-push ref updates from stdin', () => {
  expect(
    parsePrePushUpdates(`refs/heads/main ${LOCAL_SHA} refs/heads/main ${REMOTE_SHA}\n`)
  ).toEqual([
    {
      localRef: 'refs/heads/main',
      localSha: LOCAL_SHA,
      remoteRef: 'refs/heads/main',
      remoteSha: REMOTE_SHA,
    },
  ]);
});

it('collects changed files from pushed commit ranges', () => {
  const calls: string[][] = [];
  const files = collectPushedFiles(
    `refs/heads/main ${LOCAL_SHA} refs/heads/main ${REMOTE_SHA}\n`,
    (args) => {
      calls.push(args);
      return { stdout: 'tooling/qa/hooks/pre-push.mjs\nsrc/shared/example.ts\n' };
    }
  );

  expect(calls).toEqual([['diff', '--name-only', REMOTE_SHA, LOCAL_SHA]]);
  expect(files).toEqual(['src/shared/example.ts', 'tooling/qa/hooks/pre-push.mjs']);
});

it('uses the empty tree as the base for new branch pushes', () => {
  const calls: string[][] = [];
  collectPushedFiles(`refs/heads/feature ${LOCAL_SHA} refs/heads/feature ${ZERO_SHA}\n`, (args) => {
    calls.push(args);
    return { stdout: 'tooling/qa/hooks/pre-push.mjs\n' };
  });

  expect(calls[0]).toEqual([
    'diff',
    '--name-only',
    '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    LOCAL_SHA,
  ]);
});

it('runs release harness when pushed commits include tooling changes from a clean tree', () => {
  const commands = resolvePrePushCommands({
    prePushInput: `refs/heads/main ${LOCAL_SHA} refs/heads/main ${REMOTE_SHA}\n`,
    gitRunner: () => ({ stdout: 'tooling/qa/hooks/pre-push.mjs\n' }),
  });

  expect(commands).toEqual(['qa:release-harness', 'qa:checkpoint', 'qa:build']);
});

it('runs release harness for shared controls that affect product and harness authority', () => {
  const commands = resolvePrePushCommands({
    prePushInput: `refs/heads/main ${LOCAL_SHA} refs/heads/main ${REMOTE_SHA}\n`,
    gitRunner: () => ({ stdout: 'package.json\n.husky/pre-push\n' }),
  });

  expect(commands).toEqual(['qa:release-harness', 'qa:checkpoint', 'qa:build']);
});

it('rejects malformed hook input instead of silently weakening pushed-range proof', () => {
  expect(() => parsePrePushUpdates('refs/heads/main missing-fields')).toThrow(
    /expected four fields/u
  );
  expect(() =>
    parsePrePushUpdates(`refs/heads/main not-an-object refs/heads/main ${REMOTE_SHA}`)
  ).toThrow(/Invalid local object id/u);
});

it('skips deleted refs and visits every non-deletion update independently', () => {
  const workspaceRunner = vi.fn(() => 0);
  const secondLocalSha = '2345678901234567890123456789012345678901';
  const secondRemoteSha = 'bcdefabcdefabcdefabcdefabcdefabcdefabcde';
  const input = [
    `refs/heads/deleted ${ZERO_SHA} refs/heads/deleted ${REMOTE_SHA}`,
    `refs/heads/main ${LOCAL_SHA} refs/heads/main ${REMOTE_SHA}`,
    `refs/heads/feature ${secondLocalSha} refs/heads/feature ${secondRemoteSha}`,
  ].join('\n');

  expect(
    runPrePushProof({
      prePushInput: `${input}\n`,
      gitRunner: () => ({ stdout: 'src/example.ts\n' }),
      workspaceRunner,
    })
  ).toBe(0);
  expect(workspaceRunner).toHaveBeenCalledTimes(2);
  expect(workspaceRunner.mock.calls.map(([update]) => update.localSha)).toEqual([
    LOCAL_SHA,
    secondLocalSha,
  ]);
});

it('materializes the immutable pushed tree as a diff from the remote object', () => {
  const root = createTempRoot('pre-push-range-');
  initGitRepo(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'base');
  const baseSha = gitOutput(root, 'rev-parse', 'HEAD');
  writeFile(root, 'src/example.ts', 'export const value = broken;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'bad pushed commit');
  const localSha = gitOutput(root, 'rev-parse', 'HEAD');

  expect(gitOutput(root, 'status', '--porcelain')).toBe('');
  withPushedRangeWorkspace(
    {
      localRef: 'refs/heads/main',
      localSha,
      remoteRef: 'refs/heads/main',
      remoteSha: baseSha,
    },
    (workspaceRoot) => {
      expect(workspaceRoot).not.toBeNull();
      expect(gitOutput(workspaceRoot!, 'rev-parse', 'HEAD')).toBe(baseSha);
      expect(fs.readFileSync(path.join(workspaceRoot!, 'src/example.ts'), 'utf8')).toContain(
        'broken'
      );
      expect(gitOutput(workspaceRoot!, 'status', '--porcelain')).toContain('src/example.ts');
    },
    { linkInstalledDependencies: false, repositoryRoot: root }
  );
  expect(gitOutput(root, 'status', '--porcelain')).toBe('');
});

it('materializes the merged candidate when the base diverged from the branch head', () => {
  const root = createTempRoot('pre-push-merge-candidate-');
  initGitRepo(root);
  writeFile(root, 'src/base.ts', 'export const base = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'base');
  const baseBranch = gitOutput(root, 'branch', '--show-current');
  runGit(root, 'checkout', '-b', 'feature');
  writeFile(root, 'src/feature.ts', 'export const feature = true;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'feature');
  const branchHeadSha = gitOutput(root, 'rev-parse', 'HEAD');
  runGit(root, 'checkout', baseBranch);
  writeFile(root, 'src/advanced-base.ts', 'export const advanced = true;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'advance base');
  const baseSha = gitOutput(root, 'rev-parse', 'HEAD');
  runGit(root, 'merge', '--no-ff', 'feature', '-m', 'merge candidate');
  const mergeSha = gitOutput(root, 'rev-parse', 'HEAD');

  expect(mergeSha).not.toBe(branchHeadSha);
  withPushedRangeWorkspace(
    {
      localRef: 'refs/pull/1/merge',
      localSha: mergeSha,
      remoteRef: 'refs/heads/main',
      remoteSha: baseSha,
    },
    (workspaceRoot) => {
      const readSource = (file: string) => fs.readFileSync(path.join(workspaceRoot!, file), 'utf8');
      expect([readSource('src/advanced-base.ts'), readSource('src/feature.ts')]).toEqual([
        'export const advanced = true;\n',
        'export const feature = true;\n',
      ]);
    },
    { linkInstalledDependencies: false, repositoryRoot: root }
  );
});

it('materializes an initial ref as the clean local commit tree', () => {
  const root = createTempRoot('pre-push-new-branch-');
  initGitRepo(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'root candidate');
  const localSha = gitOutput(root, 'rev-parse', 'HEAD');

  withPushedRangeWorkspace(
    {
      localRef: 'refs/heads/new-branch',
      localSha,
      remoteRef: 'refs/heads/new-branch',
      remoteSha: ZERO_SHA,
    },
    (workspaceRoot) => {
      expect(gitOutput(workspaceRoot!, 'rev-parse', 'HEAD')).toBe(localSha);
      expect(gitOutput(workspaceRoot!, 'status', '--porcelain')).toBe('');
    },
    { linkInstalledDependencies: false, repositoryRoot: root }
  );
});

it('rejects a bad pushed commit even when the source worktree is clean', () => {
  const root = createTempRoot('pre-push-clean-bad-commit-');
  initGitRepo(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'base');
  const baseSha = gitOutput(root, 'rev-parse', 'HEAD');
  writeFile(root, 'src/example.ts', 'export const value = broken;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'bad pushed commit');
  const localSha = gitOutput(root, 'rev-parse', 'HEAD');
  const commands: string[] = [];

  const status = runPrePushProof({
    prePushInput: `refs/heads/main ${localSha} refs/heads/main ${baseSha}\n`,
    gitRunner: (args) => ({ stdout: `${gitOutput(root, ...args)}\n` }),
    commandRunner: (command, workspaceRoot) => {
      commands.push(command);
      expect(fs.readFileSync(path.join(workspaceRoot, 'src/example.ts'), 'utf8')).toContain(
        'broken'
      );
      return { status: command === 'qa:checkpoint' ? 23 : 0 };
    },
    workspaceOptions: { linkInstalledDependencies: false, repositoryRoot: root },
  });

  expect(gitOutput(root, 'status', '--porcelain')).toBe('');
  expect(commands).toEqual(['qa:checkpoint']);
  expect(status).toBe(23);
});

it('rejects formatter mutations because they are not part of the pushed object', () => {
  const root = createTempRoot('pre-push-mutated-candidate-');
  initGitRepo(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'base');
  const baseSha = gitOutput(root, 'rev-parse', 'HEAD');
  writeFile(root, 'src/example.ts', 'export const value = 2;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'candidate');
  const localSha = gitOutput(root, 'rev-parse', 'HEAD');

  expect(() =>
    runPrePushProof({
      prePushInput: `refs/heads/main ${localSha} refs/heads/main ${baseSha}\n`,
      gitRunner: (args) => ({ stdout: `${gitOutput(root, ...args)}\n` }),
      commandRunner: (command, workspaceRoot) => {
        if (command === 'qa:checkpoint') {
          fs.appendFileSync(path.join(workspaceRoot, 'src/example.ts'), '// formatted\n');
        }
        return { status: 0 };
      },
      workspaceOptions: { linkInstalledDependencies: false, repositoryRoot: root },
    })
  ).toThrow(/commit the deterministic fixes before pushing/u);
  expect(gitOutput(root, 'status', '--porcelain')).toBe('');
});

it('rejects non-ignored untracked inputs created during pushed-object proof', () => {
  const root = createTempRoot('pre-push-untracked-input-');
  initGitRepo(root);
  writeFile(root, '.gitignore', 'build/\nnode_modules/\n');
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'base');
  const baseSha = gitOutput(root, 'rev-parse', 'HEAD');
  writeFile(root, 'src/example.ts', 'export const value = 2;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'candidate');
  const localSha = gitOutput(root, 'rev-parse', 'HEAD');

  expect(() =>
    runPrePushProof({
      prePushInput: `refs/heads/main ${localSha} refs/heads/main ${baseSha}\n`,
      gitRunner: (args) => ({ stdout: `${gitOutput(root, ...args)}\n` }),
      commandRunner: (_command, workspaceRoot) => {
        writeFile(workspaceRoot, 'src/injected-config.ts', 'export const injected = true;\n');
        writeFile(workspaceRoot, 'build/expected-output.txt', 'ignored\n');
        return { status: 0 };
      },
      workspaceOptions: { linkInstalledDependencies: false, repositoryRoot: root },
    })
  ).toThrow(/inputs absent.*src\/injected-config\.ts/u);
});
