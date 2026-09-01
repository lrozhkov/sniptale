import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    if (allowFailure) return '';
    throw new Error(`git ${args.join(' ')} failed.`);
  }
  return result.stdout.trim();
}

function nulPaths(args) {
  return git(args, { allowFailure: true }).split('\0').filter(Boolean);
}

function comparisonRevision(environment) {
  const requested = environment.SNIPTALE_BASE_SHA;
  if (/^[0-9a-f]{40}$/u.test(requested ?? '')) {
    return git(['merge-base', requested, 'HEAD'], { allowFailure: true }) || null;
  }
  const originMain = git(['rev-parse', '--verify', 'origin/main'], { allowFailure: true });
  const mergeBase = originMain
    ? git(['merge-base', originMain, 'HEAD'], { allowFailure: true })
    : '';
  if (mergeBase && mergeBase !== git(['rev-parse', 'HEAD'])) return mergeBase;
  return git(['rev-parse', '--verify', 'HEAD^'], { allowFailure: true }) || null;
}

export function collectLocalCandidateFiles(environment = process.env) {
  const comparison = comparisonRevision(environment);
  return [
    ...new Set([
      ...(comparison ? nulPaths(['diff', '--name-only', '-z', `${comparison}..HEAD`]) : []),
      ...nulPaths(['diff', '--name-only', '-z', 'HEAD']),
      ...nulPaths(['diff', '--cached', '--name-only', '-z', 'HEAD']),
      ...nulPaths(['ls-files', '--others', '--exclude-standard', '-z']),
    ]),
  ].sort();
}

export function requiresLocalWorkflowValidation(files) {
  return files.some(
    (file) =>
      file.startsWith('.github/workflows/') ||
      file.startsWith('.github/actions/') ||
      file.startsWith('tooling/ci/fixtures/actionlint/') ||
      file === 'tooling/ci/validate-workflows.mjs' ||
      file === 'tooling/ci/local-workflow-validation.mjs' ||
      file === 'tooling/configs/ci/toolchain.lock.json' ||
      file === 'tooling/configs/ci/github-policy.json' ||
      file === 'tooling/configs/ci/trusted-admission-policy.json'
  );
}

if (isExecutedAsScript(import.meta.url)) {
  if (process.env.SNIPTALE_LOCAL_CI_LANE === 'release') {
    process.stdout.write('Workflow validation inherited from exact local proof.\n');
  } else {
    const files = collectLocalCandidateFiles();
    if (!requiresLocalWorkflowValidation(files)) {
      process.stdout.write(
        'Workflow validation skipped: candidate does not affect workflow policy.\n'
      );
    } else {
      const result = spawnSync(
        process.execPath,
        [path.join(process.cwd(), 'tooling/ci/validate-workflows.mjs'), 'actionlint'],
        { env: process.env, stdio: 'inherit' }
      );
      process.exitCode = result.status ?? 1;
    }
  }
}
