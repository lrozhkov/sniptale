import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OWNER_ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.join(OWNER_ROOT, 'fixtures/actionlint');

export function discoverWorkflowFiles(repositoryRoot = process.cwd()) {
  const workflowRoot = path.join(repositoryRoot, '.github/workflows');
  const files = fs
    .readdirSync(workflowRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .map((entry) => path.relative(repositoryRoot, path.join(workflowRoot, entry.name)))
    .sort();
  if (files.length === 0) throw new Error('No GitHub Actions workflows were discovered.');
  return files;
}

function executeActionlint({ actionlint, args, repositoryRoot, run }) {
  return run(actionlint, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

export function validateWorkflows({
  actionlint = 'actionlint',
  repositoryRoot = process.cwd(),
  run = spawnSync,
} = {}) {
  const validFixture = path.join(FIXTURE_ROOT, 'valid.yml');
  const invalidFixture = path.join(FIXTURE_ROOT, 'invalid.yml');
  const valid = executeActionlint({
    actionlint,
    args: [validFixture],
    repositoryRoot,
    run,
  });
  if (valid.status !== 0) {
    throw new Error(`actionlint rejected its valid fixture: ${valid.stderr?.trim() ?? ''}`);
  }
  const invalid = executeActionlint({
    actionlint,
    args: [invalidFixture],
    repositoryRoot,
    run,
  });
  if (invalid.status === 0) {
    throw new Error('actionlint accepted its invalid workflow fixture.');
  }
  const workflows = discoverWorkflowFiles(repositoryRoot);
  const result = executeActionlint({ actionlint, args: workflows, repositoryRoot, run });
  if (result.status !== 0) {
    const detail = result.stderr?.trim();
    throw new Error(
      `actionlint rejected the repository workflows (exit ${result.status ?? 1})${
        detail ? `: ${detail}` : '.'
      }`
    );
  }
  return workflows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateWorkflows({ actionlint: process.argv[2] ?? 'actionlint' });
}
