import fs from 'node:fs';

import { expect, it } from 'vitest';

import {
  createAuditToolStep,
  createProfileExcludedAuditStep,
  MAX_AUDIT_FAILURE_PREVIEW,
} from './audit-tool-step.mjs';
import { normalizeObservedStep } from './observed/output.mjs';

function createViolations(count) {
  return Array.from({ length: count }, (_, index) => ({
    file: `src/example-${index + 1}.ts`,
    line: index + 1,
    message: `finding ${index + 1}`,
  }));
}

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

it('allows only an explicit profile-authorized optional engine skip', () => {
  const step = createAuditToolStep(
    'Semgrep',
    {
      skipped: true,
      violations: [],
      skipReasonId: 'audit.bootstrap-failed',
      reason: 'Semgrep bootstrap failed: Could not parse HTTP_PROXY as a URL',
    },
    18,
    { profileId: 'repository', requirement: 'optional' }
  );

  expect(step.status).toBe('skipped');
  expect(step.detail).toContain('Semgrep bootstrap failed');
  expect(normalizeObservedStep(step).observation.skipReasonId).toBe(
    'audit.optional-engine-bootstrap-failed'
  );
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

it('keeps OSV and Gitleaks as required audit tools', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/audit.steps.mjs', 'utf8');

  expect(source).toContain("createToolCollector(profile, 'osv-scanner'");
  expect(source).toMatch(/createToolCollector\(\s*profile,\s*'gitleaks'/u);
  expect(source).toContain("'License inventory'");
  expect(source).toContain('runLicenseCheck');
  expect(source).toContain('scopes: profile.gitleaksScopes');
});

it('keeps full product coverage in qa:audit only', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/audit.steps.mjs', 'utf8');
  const coverageSource = fs.readFileSync('tooling/qa/core/audit-coverage-step.mjs', 'utf8');
  const releaseSource = fs.readFileSync('tooling/qa/core/verify-all.execution.mjs', 'utf8');
  const buildSource = fs.readFileSync('tooling/qa/core/verify-build.execution.mjs', 'utf8');

  expect(source).toContain('collectFullCoverageAuditStep');
  expect(coverageSource).toContain("createOkStep('Full product coverage'");
  expect(coverageSource).toContain("coverageMode: 'manual'");
  expect(coverageSource).toContain('formatCoverageAuditReport');
  expect(releaseSource).toContain('coverageEnabled: false');
  expect(buildSource).toContain('coverageEnabled: false');
});

it('keeps qa:audit under the shared blocking-wrapper lock', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/audit.mjs', 'utf8');

  expect(source).toContain("wrapperId: 'qa:audit'");
  expect(source).toContain('runObservedWrapper({');
  expect(source).toContain('blocking: true');
  expect(source).toContain('process.exitCode = outcome.exitCode');
});
