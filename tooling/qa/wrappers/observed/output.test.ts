import { expect, it } from 'vitest';

import { formatObservedRunSummary, normalizeObservedStep } from './output.mjs';

it('normalizes a failure into stable control/problem IDs with remediation detail', () => {
  const normalized = normalizeObservedStep({
    label: 'Oxlint',
    status: 'failed',
    summary: 'two violations',
    violations: [{ file: 'src/a.ts', line: 4, message: 'bad import' }],
  });

  expect(normalized.observation).toMatchObject({
    controlIds: ['qa.rule.oxlint'],
    outcome: 'problems-found',
    problemIds: ['qa.rule.oxlint.violations'],
    stepId: 'qa.rule.oxlint',
  });
  expect(normalized.observation.log).toContain('src/a.ts:4 bad import');
  expect(normalized.observation.log).toContain('repository remediation:');
  expect(normalized.observation.log).toContain('rule:');
  expect(normalized.observation.diagnostic).toMatchObject({
    summary: 'two violations',
    locations: [{ file: 'src/a.ts', line: 4, message: 'bad import' }],
    ruleDoc: expect.stringContaining('.md'),
  });
});

it('classifies prerequisite blocking as a distinct blocked outcome', () => {
  expect(
    normalizeObservedStep({
      label: 'Playwright',
      status: 'blocked',
      detail: 'blocked by E2E build failure',
    }).observation
  ).toMatchObject({ outcome: 'blocked', skipReasonId: null });
  expect(
    normalizeObservedStep({
      label: 'Playwright',
      status: 'blocked',
      detail: 'blocked by E2E build failure',
    }).observation.problemIds
  ).toEqual(['qa.rule.playwright.blocked']);
});

it('preserves a profile-authorized structured skip reason', () => {
  expect(
    normalizeObservedStep({
      label: 'CodeQL',
      status: 'skipped',
      detail: 'optional engine unavailable',
      skipReasonId: 'audit.optional-engine-unavailable',
    }).observation
  ).toMatchObject({
    outcome: 'skipped',
    skipReasonId: 'audit.optional-engine-unavailable',
  });
});

it('prints both the structured run record and the wrapper diagnostic log', () => {
  expect(
    formatObservedRunSummary({
      label: 'QA checkpoint',
      runPath: '.tmp/qa-observability/runs/2026-07-14/id.json',
      record: {
        durationMs: 116_000,
        log: { path: '.tmp/qa-logs/2026-07-14/id.log' },
        steps: [],
        summary: { problemIds: ['qa.rule.oxlint.failed'] },
      },
    })
  ).toBe(
    [
      'QA checkpoint: problems found in 1m 56s',
      'Problems: 1 — qa.rule.oxlint.failed',
      'Run record: .tmp/qa-observability/runs/2026-07-14/id.json',
      'Run log: .tmp/qa-logs/2026-07-14/id.log',
      '',
    ].join('\n')
  );
});

it('prints the child execution log for a nested wrapper failure', () => {
  expect(
    formatObservedRunSummary({
      label: 'QA closeout',
      runPath: '.tmp/qa-observability/runs/2026-07-14/parent.json',
      record: {
        durationMs: 1_016_000,
        log: { path: '.tmp/qa-logs/2026-07-14/parent.log' },
        status: 'problems-found',
        steps: [
          {
            diagnostic: {
              evidence: [
                {
                  kind: 'child-run',
                  logPath: '.tmp/qa-logs/2026-07-14/child.log',
                  recordPath: '.tmp/qa-observability/runs/2026-07-14/child.json',
                  runId: 'child',
                },
              ],
            },
          },
        ],
        summary: { problemIds: ['qa.rule.full-build.process-exit'] },
      },
    })
  ).toBe(
    [
      'QA closeout: problems found in 16m 56s',
      'Problems: 1 — qa.rule.full-build.process-exit',
      'Run record: .tmp/qa-observability/runs/2026-07-14/parent.json',
      'Run log: .tmp/qa-logs/2026-07-14/parent.log',
      'Child run log: .tmp/qa-logs/2026-07-14/child.log',
      '',
    ].join('\n')
  );
});

it('keeps a successful parent summary concise when child evidence is present', () => {
  const summary = formatObservedRunSummary({
    label: 'QA closeout',
    runPath: '.tmp/qa-observability/runs/2026-07-14/parent.json',
    record: {
      durationMs: 1_000,
      log: { path: '.tmp/qa-logs/2026-07-14/parent.log' },
      status: 'all-passed',
      steps: [
        {
          diagnostic: {
            evidence: [
              {
                kind: 'child-run',
                logPath: '.tmp/qa-logs/2026-07-14/child.log',
              },
            ],
          },
        },
      ],
      summary: { problemIds: [] },
    },
  });

  expect(summary).toContain('Run log: .tmp/qa-logs/2026-07-14/parent.log');
  expect(summary).not.toContain('Child run log:');
});

it('renders string violations without discarding their diagnostic text', () => {
  const normalized = normalizeObservedStep({
    label: 'Oxlint',
    status: 'failed',
    violations: ['tooling/qa/file.mjs:17 concrete guard failure'],
  });
  expect(normalized.observation.log).toContain('tooling/qa/file.mjs:17 concrete guard failure');
});

it('retains structured child-run evidence for a failed closeout build', () => {
  const normalized = normalizeObservedStep({
    label: 'Full build',
    status: 'failed',
    evidence: [
      {
        kind: 'child-run',
        runId: 'child-run-17',
        recordPath: '.tmp/qa-observability/runs/2026-07-14/child-run-17.json',
        logPath: '.tmp/qa-logs/2026-07-14/child-run-17.log',
      },
    ],
  });
  expect(normalized.observation.diagnostic?.evidence).toHaveLength(1);
});

it('persists successful advisory findings as diagnostic locations', () => {
  const normalized = normalizeObservedStep({
    label: 'Advisory report',
    status: 'ok',
    detail: 'attention=0, watch=1',
    advisories: [
      {
        id: 'advisory.structural-function',
        file: 'apps/extension/src/example.ts',
        line: 17,
        reason: 'score=5',
      },
    ],
  });
  expect(normalized.observation).toMatchObject({
    outcome: 'passed',
    diagnostic: {
      locations: [
        {
          file: 'apps/extension/src/example.ts',
          line: 17,
          message: 'advisory.structural-function: score=5',
        },
      ],
    },
  });
});
