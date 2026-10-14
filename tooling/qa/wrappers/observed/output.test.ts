import { expect, it } from 'vitest';

import {
  formatObservedRunSummary,
  formatObservedBlocker,
  normalizeObservedStep,
} from './output.mjs';

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

it.each([
  [
    'Oxlint',
    'src/a.ts:4:2: Missing error cause. [Error/eslint(preserve-caught-error)]',
    'src/a.ts',
    4,
  ],
  ['Typecheck', 'src/b.ts(12,8): error TS2322: Type mismatch.', 'src/b.ts', 12],
  ['Typecheck', 'src/c.ts:9:3 - error TS2345: Invalid argument.', 'src/c.ts', 9],
  [
    'Unit tests',
    ' FAIL  src/start.test.ts > start failures\nError: Test timed out in 10000ms.',
    'src/start.test.ts',
    null,
  ],
])('preserves %s process diagnostics and fallback remediation', (label, stdout, file, line) => {
  const normalized = normalizeObservedStep({
    label,
    status: 'failed',
    summary: 'failed',
    stdout,
    advice: '',
  });
  expect(normalized.observation.diagnostic).toMatchObject({
    locations: [expect.objectContaining({ file, line, message: expect.any(String) })],
    remediation: expect.stringContaining('reported tool'),
  });
});

it('keeps unlocated tool failures without a fabricated source location', () => {
  const normalized = normalizeObservedStep({
    label: 'Unit tests',
    status: 'failed',
    stderr: 'Process exited unexpectedly.',
  });
  expect(normalized.observation.diagnostic?.locations).toEqual([]);
});

it.each(['Advisory report', 'QA checkpoint'])(
  'renders canonical %s without repeating its locations',
  (label) => {
    const normalized = normalizeObservedStep({
      label,
      status: 'ok',
      advisories: [{ id: 'advisory.structural-file', file: 'src/a.ts', reason: 'unique advisory' }],
      stdout: 'Advisory log:\n- src/a.ts unique advisory\n',
    });
    expect(normalized.observation.log.match(/unique advisory/gu)).toHaveLength(1);
    expect(normalized.observation.diagnostic?.locations).toHaveLength(1);
  }
);

it('retains suite import failures after long output from either stream', () => {
  const failure =
    ' FAIL  src/suite.test.ts [ src/suite.test.ts ]\nError: Cannot find module missing-owner.';
  const normalized = normalizeObservedStep({
    label: 'Unit tests',
    status: 'failed',
    stdout: 'passing output\n'.repeat(50_000),
    stderr: 'progress\n'.repeat(50_000) + failure,
  });
  expect(normalized.observation.diagnostic?.locations).toEqual([
    {
      file: 'src/suite.test.ts',
      line: null,
      message: 'Test suite failed: Error: Cannot find module missing-owner.',
    },
  ]);
});

it('bounds locations and rejects invalid line numbers without losing the final test reason', () => {
  const stdout =
    'src/invalid.ts:0:1: invalid\n' +
    'src/invalid.ts:999999999999999999999:1: invalid\n' +
    Array.from({ length: 101 }, (_, index) => `src/a.ts:${index + 1}:2: issue`).join('\n');
  const normalized = normalizeObservedStep({ label: 'Oxlint', status: 'failed', stdout });
  expect(normalized.observation.diagnostic?.locations).toHaveLength(100);
  expect(normalized.observation.diagnostic?.locations[0]).toMatchObject({
    file: 'src/a.ts',
    line: 1,
  });
});

it('shows the failed invariant, scenario, test file and reproduction command in the blocker', () => {
  const file = 'apps/extension/src/workflows/video-review/session.project-purge.test.ts';
  const text = formatObservedBlocker({
    label: 'Unit tests',
    status: 'failed',
    summary: 'failed',
    stdout:
      ` FAIL  ${file} > no deleted text returns: delayed writer, purge and recreation\n` +
      'AssertionError: Deleted project text must not return: expected draft to be null',
  });
  expect(text).toContain('no deleted text returns: delayed writer, purge and recreation');
  expect(text).toContain('Deleted project text must not return');
  expect(text).toContain(file);
  expect(text).toContain(`npm exec vitest run -- --maxWorkers=1 '${file}'`);
});

it('bounds blocker detail and quotes reproduction paths without creating shell substitutions', () => {
  const file = "src/it's $(secret).test.ts";
  const text = formatObservedBlocker({
    label: 'Unit tests',
    status: 'failed',
    stdout: Array.from(
      { length: 9 },
      (_, i) => ` FAIL  ${file} > case ${i}\nAssertionError: invariant ${i}`
    ).join('\n'),
  });
  expect(text).toContain('case 0');
  expect(text).not.toContain('case 8');
  expect(text).toContain("'src/it'\"'\"'s $(secret).test.ts'");
  expect(text.match(/npm exec vitest/gu)).toHaveLength(1);
});

it('keeps unlocated failures honest and includes located non-test blockers', () => {
  expect(
    formatObservedBlocker({ label: 'Unit tests', status: 'failed', stderr: 'crashed' })
  ).not.toContain('Reproduce:');
  expect(
    formatObservedBlocker({
      label: 'Test coverage',
      status: 'failed',
      violations: [{ file: 'src/store.ts', line: 4, message: 'Branch coverage below threshold' }],
    })
  ).toContain('src/store.ts:4: Branch coverage below threshold');
});

it('sanitizes a complete secret before shortening diagnostic text', () => {
  const secret = 'private-complete-value';
  const text = formatObservedBlocker(
    {
      label: 'Unit tests',
      status: 'failed',
      stdout: ` FAIL  src/store.test.ts > ${'a'.repeat(790)}${secret}\nAssertionError: invariant`,
    },
    (value) => value.replaceAll(secret, '<redacted>')
  );
  expect(text).not.toContain('private-');
  expect(text).toContain('<redacted>');
});

it('redacts complete sensitive paths before shell quoting reproduction commands', () => {
  const secret = "private'complete-value";
  const sanitize = (value: string) => value.replaceAll(secret, '<redacted>');
  const text = sanitize(
    formatObservedBlocker(
      {
        label: 'Unit tests',
        status: 'failed',
        stdout: ` FAIL  src/${secret}.test.ts > invariant\nAssertionError: preserved`,
      },
      sanitize
    )
  );
  expect(text).toContain(
    "Reproduce: npm exec vitest run -- --maxWorkers=1 'src/<redacted>.test.ts'"
  );
  expect(text).not.toContain('private');
  expect(text).not.toContain('complete-value');
});

it('omits reproduction commands when configured redaction changes shell syntax', () => {
  const sanitize = (value: string) => value.replaceAll("'\"'", '<redacted>');
  const text = sanitize(
    formatObservedBlocker(
      {
        label: 'Unit tests',
        status: 'failed',
        stdout:
          " FAIL  src/a'$(printf injected)'b'c.test.ts > invariant\nAssertionError: preserved",
      },
      sanitize
    )
  );
  expect(text).not.toContain('Reproduce: npm exec');
  expect(text).toContain('Reproduction command omitted because redaction changes shell syntax.');
});

it.each(['failed', 'blocked'])(
  'keeps advisory findings out of %s blocker counts and failure locations',
  (status) => {
    const step = {
      label: 'Structural risk',
      status,
      violations: Array.from({ length: 6 }, (_, index) => ({
        file: `src/blocker-${index}.ts`,
        message: 'owner violation',
      })),
      advisories: Array.from({ length: 43 }, (_, index) => ({
        file: `src/watch-${index}.ts`,
        reason: 'watch only',
      })),
    };
    const summary = formatObservedBlocker(step);
    expect(summary).toContain('src/blocker-5.ts');
    expect(summary).not.toContain('more in the run log');
    expect(summary).not.toContain('watch only');
    const normalized = normalizeObservedStep(step).observation;
    expect(normalized.diagnostic?.locations).toHaveLength(6);
    expect(normalized.log).toContain('src/watch-42.ts');
    expect(
      normalizeObservedStep({ ...step, status: 'ok', violations: [] }).observation.diagnostic
        ?.locations
    ).toHaveLength(43);
  }
);
