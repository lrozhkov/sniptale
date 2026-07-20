import fs from 'node:fs';

import {
  collectCodeFiles,
  fromRelativePath,
  isExecutedAsScript,
  repoRoot,
  runCommand,
} from '../core/shared.mjs';
import { createScopedQaContext, hasHarnessQaTargets } from '../core/qa-scope.mjs';
import { runGit } from '../runtime/git-command.helpers.mjs';
import {
  assertWorkspaceMatchesPushedTree,
  EMPTY_TREE_SHA,
  withPushedRangeWorkspace,
} from './pre-push-workspace.mjs';

const ZERO_SHA_PATTERN = /^0+$/u;
const OBJECT_ID_PATTERN = /^[0-9a-f]{40,64}$/iu;
const JS_LIKE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;
const FULL_CHECKPOINT_NODE_OPTIONS = '--max-old-space-size=8192';

function splitOutput(stdout) {
  return stdout
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean);
}

function assertObjectId(value, label) {
  if (!OBJECT_ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} object id in pre-push input`);
  }
}

export function parsePrePushUpdates(input = '') {
  return input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const fields = line.split(/\s+/u);
      if (fields.length !== 4) {
        throw new Error('Invalid pre-push input: expected four fields per ref update');
      }

      const [localRef, localSha, remoteRef, remoteSha] = fields;
      assertObjectId(localSha, 'local');
      assertObjectId(remoteSha, 'remote');
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

function collectPushedFilesForUpdate(update, gitRunner) {
  if (ZERO_SHA_PATTERN.test(update.localSha)) {
    return [];
  }

  const baseSha = ZERO_SHA_PATTERN.test(update.remoteSha) ? EMPTY_TREE_SHA : update.remoteSha;
  return splitOutput(gitRunner(['diff', '--name-only', baseSha, update.localSha]).stdout);
}

export function collectPushedFiles(input = '', gitRunner = runGit) {
  return [
    ...new Set(
      parsePrePushUpdates(input).flatMap((update) => collectPushedFilesForUpdate(update, gitRunner))
    ),
  ].sort();
}

function readPrePushInput() {
  if (process.stdin.isTTY) {
    return '';
  }

  return fs.readFileSync(0, 'utf8');
}

function createEmptyContext() {
  return {
    targetFiles: [],
    existingTargetFiles: [],
    addedFiles: [],
    untrackedFiles: [],
  };
}

export function createPrePushContext({
  baseContext = createEmptyContext(),
  pushedFiles = [],
} = {}) {
  const targetFiles = [
    ...new Set([...(baseContext.allTargetFiles ?? baseContext.targetFiles ?? []), ...pushedFiles]),
  ].sort();
  const existingTargetFiles = targetFiles.filter((file) => fs.existsSync(fromRelativePath(file)));

  return createScopedQaContext({
    ...baseContext,
    targetFiles,
    existingTargetFiles,
    codeFiles: collectCodeFiles(existingTargetFiles),
    jsLikeFiles: existingTargetFiles.filter((file) => JS_LIKE_FILE_PATTERN.test(file)),
  });
}

export function resolvePrePushCommands({ prePushInput = '', gitRunner = runGit } = {}) {
  const updates = parsePrePushUpdates(prePushInput).filter(
    (update) => !ZERO_SHA_PATTERN.test(update.localSha)
  );
  const context = createPrePushContext({
    pushedFiles: collectPushedFiles(prePushInput, gitRunner),
  });
  const initialPush = updates.some((update) => ZERO_SHA_PATTERN.test(update.remoteSha));

  return [
    ...(hasHarnessQaTargets(context) ? ['qa:release-harness'] : []),
    ...(initialPush ? ['qa:release', 'build:release'] : ['qa:checkpoint', 'qa:build']),
  ];
}

export function resolvePrePushNodeOptions(
  command,
  inheritedNodeOptions = process.env.NODE_OPTIONS
) {
  return command === 'qa:checkpoint' ? FULL_CHECKPOINT_NODE_OPTIONS : inheritedNodeOptions;
}

function runNpmProof(command, workspaceRoot, update) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return runCommand(executable, ['run', command], {
    cwd: workspaceRoot,
    env: {
      NODE_OPTIONS: resolvePrePushNodeOptions(command),
      SNIPTALE_QA_OBSERVABILITY_ROOT: repoRoot,
      SNIPTALE_QA_PUSH_LOCAL_REF: update.localRef,
      SNIPTALE_QA_PUSH_LOCAL_SHA: update.localSha,
      SNIPTALE_QA_PUSH_REMOTE_REF: update.remoteRef,
      SNIPTALE_QA_PUSH_REMOTE_SHA: update.remoteSha,
      SNIPTALE_QA_WORKFLOW_ID: update.localSha,
    },
    stdio: 'inherit',
  });
}

export function runPrePushProof({
  commandRunner = runNpmProof,
  gitRunner = runGit,
  prePushInput = '',
  workspaceOptions,
  workspaceRunner = withPushedRangeWorkspace,
} = {}) {
  const updates = parsePrePushUpdates(prePushInput).filter(
    (update) => !ZERO_SHA_PATTERN.test(update.localSha)
  );

  for (const update of updates) {
    const updateInput = `${update.localRef} ${update.localSha} ${update.remoteRef} ${update.remoteSha}`;
    const commands = resolvePrePushCommands({ prePushInput: updateInput, gitRunner });
    const status = workspaceRunner(
      update,
      (workspaceRoot) => {
        for (const command of commands) {
          const result = commandRunner(command, workspaceRoot, update);
          if ((result.status ?? 1) !== 0) {
            return result.status ?? 1;
          }
        }
        assertWorkspaceMatchesPushedTree(workspaceRoot, update);
        return 0;
      },
      workspaceOptions
    );
    if (status !== 0) {
      return status;
    }
  }

  return 0;
}

if (isExecutedAsScript(import.meta.url)) {
  process.exitCode = runPrePushProof({ prePushInput: readPrePushInput() });
}

export { withPushedRangeWorkspace } from './pre-push-workspace.mjs';
