import { afterEach, expect, it, vi } from 'vitest';

import { runScopedRuleCli } from './scoped-rule-cli.mjs';

const MESSAGES = {
  blockingViolations: 'blocking violations:',
  repoWidePassed: 'repo passed\n',
  repoWideSkipped: 'repo skipped\n',
  reportViolations: 'report violations:',
  workspacePassed: 'workspace passed\n',
  workspaceSkipped: 'workspace skipped\n',
};

afterEach(() => {
  vi.restoreAllMocks();
});

it('passes normalized repo-wide files to the rule and prints success', () => {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const runCheck = vi.fn(() => ({ skipped: false, violations: [] }));

  expect(
    runScopedRuleCli({
      argv: ['--repo-wide', '--files', 'one.ts', '--ignored-switch'],
      messages: MESSAGES,
      runCheck,
    })
  ).toBe(0);
  expect(runCheck).toHaveBeenCalledWith({ files: ['one.ts'], scope: 'repo-wide' });
  expect(stdout).toHaveBeenCalledWith('repo passed\n');
});

it('keeps report-only findings non-blocking', () => {
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const runCheck = vi.fn(() => ({
    skipped: false,
    violations: [{ file: 'one.ts', line: 2, message: 'problem' }],
  }));

  expect(
    runScopedRuleCli({
      argv: ['--report-only'],
      messages: MESSAGES,
      runCheck,
    })
  ).toBe(0);
  expect(stderr).toHaveBeenCalledWith('report violations:\n\n');
});

it('returns a blocking exit code for normal findings', () => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const runCheck = vi.fn(() => ({
    skipped: false,
    violations: [{ file: 'one.ts', message: 'problem' }],
  }));

  expect(runScopedRuleCli({ argv: [], messages: MESSAGES, runCheck })).toBe(1);
});
