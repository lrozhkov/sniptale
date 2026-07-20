/**
 * Staged task-artifact guardrail.
 * Blocks commit-time staging of local planning artifacts under tasks/**.
 */

import { spawnSync } from 'node:child_process';

import { readGitIndexEntries, readHeadTreeMap } from './git-object-store.mjs';
import { isExecutedAsScript, printViolations } from './shared.mjs';

const TASK_ARTIFACT_PREFIXES = ['tasks/'];

function collectSandboxStagedTaskArtifacts(root) {
  const indexEntries = new Map(readGitIndexEntries(root).map((entry) => [entry.path, entry.oid]));
  const headEntries = readHeadTreeMap(root);
  const paths = new Set([...indexEntries.keys(), ...headEntries.keys()]);

  return [...paths]
    .filter((file) => TASK_ARTIFACT_PREFIXES.some((prefix) => file.startsWith(prefix)))
    .filter((file) => indexEntries.get(file) !== headEntries.get(file)?.oid)
    .sort();
}

function runGit(
  args,
  { spawnSyncImpl = spawnSync, sandboxFallback = collectSandboxStagedTaskArtifacts } = {}
) {
  const executable = process.platform === 'win32' ? 'git.exe' : 'git';
  const result = spawnSyncImpl(executable, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.error?.code === 'EPERM') {
    return sandboxFallback(process.cwd()).join('\n');
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  }

  return result.stdout;
}

export function collectTaskArtifactViolations(files) {
  return files
    .filter((file) => TASK_ARTIFACT_PREFIXES.some((prefix) => file.startsWith(prefix)))
    .sort()
    .map((file) => ({
      rule: 'task-artifacts-staged',
      file,
      message: 'tasks/** is workspace-only planning input/output and must not be committed.',
    }));
}

export function runTaskArtifactCommitCheck({ files = [], sandboxFallback, spawnSyncImpl } = {}) {
  const stagedFiles =
    files.length > 0
      ? files
      : runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMRD'], {
          sandboxFallback,
          spawnSyncImpl,
        })
          .split(/\r?\n/u)
          .map((file) => file.trim())
          .filter(Boolean);

  return {
    files: stagedFiles,
    violations: collectTaskArtifactViolations(stagedFiles),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runTaskArtifactCommitCheck();

  if (result.violations.length > 0) {
    printViolations('Staged task-artifact violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Task artifact staging passed\n');
}
