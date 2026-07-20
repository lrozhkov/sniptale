import { execFileSync } from 'node:child_process';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from '../core/test-helpers';

export { createTempRoot, importFresh, initGitRepo, runGit, withCwd, writeFile };

export function readGit(root: string, ...args: string[]) {
  const executable = process.platform === 'win32' ? 'git.exe' : 'git';
  try {
    return execFileSync(executable, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      'status' in error &&
      'stdout' in error &&
      error.code === 'EPERM' &&
      error.status === 0 &&
      typeof error.stdout === 'string'
    ) {
      return error.stdout.trim();
    }

    throw error;
  }
}

export function createBuildContext() {
  return {
    targetFiles: ['tracked.ts'],
    existingTargetFiles: ['tracked.ts'],
    codeFiles: ['tracked.ts'],
    jsLikeFiles: ['tracked.ts'],
    fingerprint: 'build-fingerprint',
  };
}

function createOkBuildStep() {
  return {
    label: 'Build',
    status: 'ok' as const,
    detail: '',
    durationMs: 0,
  };
}

export function createGreenBuildValidationSteps() {
  return [
    { label: 'Naming', status: 'ok' as const, detail: '', durationMs: 0 },
    { label: 'Security', status: 'ok' as const, detail: '', durationMs: 0 },
    { label: 'Architecture guardrails', status: 'ok' as const, detail: '', durationMs: 0 },
    { label: 'Dependency boundaries', status: 'ok' as const, detail: '', durationMs: 0 },
    { label: 'Cycles', status: 'ok' as const, detail: '', durationMs: 0 },
    { label: 'Canonical facades', status: 'ok' as const, detail: '', durationMs: 0 },
    { label: 'Root side effects', status: 'ok' as const, detail: '', durationMs: 0 },
    { label: 'Typecheck', status: 'ok' as const, detail: '', durationMs: 0 },
    { label: 'Unit tests', status: 'ok' as const, detail: '', durationMs: 0 },
    { label: 'Test coverage', status: 'ok' as const, detail: '', durationMs: 0 },
    createOkBuildStep(),
  ];
}

export function createGreenBuildCloseoutResult() {
  return {
    scopeDetail: 'broader related tests (1 related file)',
    steps: createGreenBuildValidationSteps(),
  };
}

export async function seedFreshCheckpointState() {
  const diffHelpers = await importFresh<typeof import('../runtime/current-diff.helpers.mjs')>(
    '../runtime/current-diff.helpers.mjs',
    import.meta.url
  );
  const checkpointHelpers = await importFresh<
    typeof import('../core/verify-checkpoint.state.helpers.mjs')
  >('../core/verify-checkpoint.state.helpers.mjs', import.meta.url);
  const context = diffHelpers.collectCurrentDiffContext();
  checkpointHelpers.writeCheckpointState(
    checkpointHelpers.createCheckpointState({
      context,
      success: true,
      producerRunId: 'checkpoint-seed-run',
    })
  );
}
