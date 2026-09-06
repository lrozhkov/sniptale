import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import {
  createAuditToolStep,
  createProfileExcludedAuditStep,
  MAX_AUDIT_FAILURE_PREVIEW,
} from './audit/audit-tool-step.mjs';
import { normalizeObservedStep } from './observed/output.mjs';
import { collectAuditProfileResult } from './audit.mjs';

function createViolations(count) {
  return Array.from({ length: count }, (_, index) => ({
    file: `src/example-${index + 1}.ts`,
    line: index + 1,
    message: `finding ${index + 1}`,
  }));
}

it('collects the internal audit profile with repository context and progress', async () => {
  const attachRepositoryContext = vi.fn();
  const onProgress = vi.fn();
  const progressReporter = vi.fn(() => onProgress);
  const stepCollector = vi.fn(async () => [{ label: 'Audit control', status: 'ok' }]);

  const result = await collectAuditProfileResult({
    profileId: 'repository',
    session: { attachRepositoryContext },
    progressReporter,
    stepCollector,
  });

  expect(result).toEqual({
    context: { mode: 'profile:repository', scope: 'workspace' },
    steps: [{ label: 'Audit control', status: 'ok' }],
  });
  expect(attachRepositoryContext).toHaveBeenCalledWith(result.context);
  expect(progressReporter).toHaveBeenCalledOnce();
  expect(stepCollector).toHaveBeenCalledWith({
    profile: expect.objectContaining({ id: 'repository', reusedControlIds: new Set() }),
    onProgress,
  });
});

it('fails when a required audit engine is unavailable', () => {
  const step = createAuditToolStep(
    'CodeQL',
    {
      skipped: true,
      violations: [],
      skipReasonId: 'audit.tool-unavailable',
      reason: 'tool unavailable',
    },
    12,
    { profileId: 'security', requirement: 'required' }
  );

  expect(step.status).toBe('failed');
  expect(step.summary).toBe('required audit control did not run');
  expect(step.stderr).toContain('tool unavailable');
  expect(step.durationMs).toBe(12);
});

it.each([
  ['audit.tool-unavailable', 'audit.optional-engine-unavailable'],
  ['audit.bootstrap-failed', 'audit.optional-engine-bootstrap-failed'],
  ['audit.no-applicable-targets', 'audit.optional-no-applicable-targets'],
])('maps optional adapter skip %s to stable profile reason %s', (adapterReason, expectedReason) => {
  const step = createAuditToolStep(
    'CodeQL',
    {
      skipped: true,
      violations: [],
      skipReasonId: adapterReason,
      reason: 'optional control did not run',
    },
    18,
    { profileId: 'repository', requirement: 'optional' }
  );

  expect(step.status).toBe('skipped');
  expect(step.detail).toContain('optional control did not run');
  expect(normalizeObservedStep(step).observation.skipReasonId).toBe(expectedReason);
  expect(step.durationMs).toBe(18);
});

it('rejects an unregistered optional engine skip reason', () => {
  const step = createAuditToolStep(
    'CodeQL',
    {
      skipped: true,
      violations: [],
      skipReasonId: 'audit.unknown-skip',
      reason: 'unknown',
    },
    3,
    { profileId: 'repository', requirement: 'optional' }
  );

  expect(step.status).toBe('failed');
  expect(step.summary).toBe('invalid optional audit skip');
});

it('records a stable reason when a profile excludes a canonical control', () => {
  const step = createProfileExcludedAuditStep('Full product coverage', 'security');

  expect(step.status).toBe('skipped');
  expect(normalizeObservedStep(step).observation.skipReasonId).toBe('audit.profile-not-selected');
});

it('caps audit finding previews and keeps the report path', () => {
  const step = createAuditToolStep(
    'CodeQL',
    {
      skipped: false,
      sarifPath: '.tmp/codeql/results.sarif',
      violations: createViolations(MAX_AUDIT_FAILURE_PREVIEW + 2),
    },
    30
  );

  expect(step.status).toBe('failed');
  expect(step.summary).toBe(`findings (${MAX_AUDIT_FAILURE_PREVIEW + 2})`);
  expect(step.stderr).toContain('Report: .tmp/codeql/results.sarif');
  expect(step.stderr).toContain(
    `src/example-${MAX_AUDIT_FAILURE_PREVIEW}.ts:${MAX_AUDIT_FAILURE_PREVIEW}`
  );
  expect(step.stderr).not.toContain(
    `src/example-${MAX_AUDIT_FAILURE_PREVIEW + 1}.ts:${MAX_AUDIT_FAILURE_PREVIEW + 1}`
  );
  expect(step.stderr).toContain('- ... and 2 more');
  expect(step.durationMs).toBe(30);
});

it('preserves non-blocking audit advisories in observed release output', () => {
  const advisory = {
    rule: 'jscpd-baseline-stale',
    file: 'apps/example.ts:12',
    message: 'Reviewed tool noise exact-id is absent; remove the stale allowance',
  };
  const step = createAuditToolStep(
    'jscpd',
    {
      skipped: false,
      reportPath: '.tmp/jscpd/report.json',
      summaryText: 'Baseline: 1 clone(s); advisories=1',
      violations: [],
      advisories: [advisory],
    },
    24
  );

  expect(step.status).toBe('ok');
  expect(step.advisories).toEqual([advisory]);
  const observed = normalizeObservedStep(step).observation;
  expect(observed.diagnostic?.locations).toEqual([
    {
      file: advisory.file,
      line: null,
      message: `${advisory.rule}: ${advisory.message}`,
    },
  ]);
  expect(observed.log).toContain(
    `- advisory ${advisory.rule}: ${advisory.file} ${advisory.message}`
  );
});

it('preserves audit advisories when another finding blocks the release', () => {
  const advisory = {
    rule: 'jscpd-baseline-stale',
    file: 'apps/old-location.ts:12',
    message: 'Reviewed tool noise exact-id is absent; remove the stale allowance',
  };
  const step = createAuditToolStep(
    'jscpd',
    {
      skipped: false,
      reportPath: '.tmp/jscpd/report.json',
      summaryText: 'Baseline violations: 1; advisories=1',
      violations: createViolations(1),
      advisories: [advisory],
    },
    25
  );

  expect(step.status).toBe('failed');
  expect(step.advisories).toEqual([advisory]);
  const observed = normalizeObservedStep(step).observation;
  expect(observed.diagnostic?.locations).toEqual([
    {
      file: advisory.file,
      line: null,
      message: `${advisory.rule}: ${advisory.message}`,
    },
  ]);
  expect(observed.log).toContain(
    `- advisory ${advisory.rule}: ${advisory.file} ${advisory.message}`
  );
});

it('keeps OSV and Gitleaks as required audit tools', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/audit/execution/steps.mjs', 'utf8');

  expect(source).toContain("createToolCollector(profile, 'osv-scanner'");
  expect(source).toMatch(/createToolCollector\(\s*profile,\s*'gitleaks'/u);
  expect(source).toContain("'License inventory'");
  expect(source).toContain('runLicenseCheck');
  expect(source).toContain('scopes: profile.gitleaksScopes');
});

it('keeps full product coverage in the audit profile only', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/audit/execution/steps.mjs', 'utf8');
  const coverageSource = fs.readFileSync(
    'tooling/qa/proof/coverage/audit-coverage-step.mjs',
    'utf8'
  );
  expect(coverageSource).toContain('resolveQaResourceProfile().vitestMaxWorkers');
  const releaseSource = fs.readFileSync(
    'tooling/qa/composition/repository/full-verification/execution.mjs',
    'utf8'
  );

  expect(source).toContain('collectFullCoverageAuditStep');
  expect(coverageSource).toContain("createOkStep('Full product coverage'");
  expect(coverageSource).toContain("coverageMode: 'manual'");
  expect(coverageSource).toContain('formatCoverageAuditReport');
  expect(releaseSource).toContain('coverageEnabled: false');
});

it('keeps the audit profile as an internal collector without a wrapper CLI', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/audit.mjs', 'utf8');

  expect(source).toContain('export async function collectAuditProfileResult');
  expect(source).not.toContain('isExecutedAsScript');
  expect(source).not.toContain('runObservedWrapper');
  expect(source).not.toContain('process.exitCode');
});
