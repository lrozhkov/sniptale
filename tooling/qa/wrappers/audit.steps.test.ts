import { expect, it } from 'vitest';

import { AuditExecutionError } from '../audits/execution-error.mjs';
import { resolveAuditProfile } from '../audits/profiles/index.mjs';
import { collectEvidenceStep, collectTopologyStep } from './audit-inventory-steps.mjs';
import {
  collectProfiledAsyncStep,
  collectProfiledSyncStep,
  createAuditCollectionFailureStep,
} from './audit-step-collection.mjs';

it('projects typed audit failures with real duration and complete bounded evidence', () => {
  const error = new AuditExecutionError('environment-network', 'registry DNS failed', {
    result: {
      status: 1,
      stdout: '{"error":"EAI_AGAIN"}',
      stderr: 'getaddrinfo EAI_AGAIN registry.npmjs.org',
    },
  });

  expect(createAuditCollectionFailureStep('npm audit', error, 412)).toEqual({
    label: 'npm audit',
    status: 'failed',
    summary: 'environment-network',
    exitCode: 1,
    stdout: '{"error":"EAI_AGAIN"}',
    stderr: '[environment-network] registry DNS failed\ngetaddrinfo EAI_AGAIN registry.npmjs.org',
    durationMs: 412,
  });
});

it('reports real manual lanes and the persisted evidence inventory path', () => {
  const profile = resolveAuditProfile('repository');
  const evidence = {
    smellFindings: [
      { family: 'Hidden state', file: 'src/first.ts' },
      { family: 'Hidden state', file: 'src/second.ts' },
      { family: 'Hidden state', file: 'src/third.ts' },
    ],
    smellFamilies: [{ family: 'Hidden state', count: 3, examples: [] }],
    loopholes: [{ kind: 'focused-blind-spot' }],
    verification: {
      manualAuditSteps: [{ id: 'first' }, { id: 'second' }],
      manualAuditTools: ['first.mjs', 'second.mjs'],
      manualOnlyCheckScripts: [],
    },
  };

  const step = collectEvidenceStep(profile, {
    collectEvidence: () => evidence,
    persistEvidence: (value) => {
      expect(value).toBe(evidence);
      return { artifactPath: '.tmp/repo-audit/evidence.json' };
    },
  });

  expect(step).toMatchObject({
    label: 'Audit evidence report-only inventory',
    status: 'ok',
    detail:
      'findings=4; smells=3; loopholes=1; manualLanes=2; artifact=.tmp/repo-audit/evidence.json',
  });
});

it('keeps topology findings report-only while exposing their persisted inventory', () => {
  const profile = resolveAuditProfile('repository');
  const result = {
    files: ['src/first.ts', 'src/second.ts'],
    violations: [
      { rule: 'example', file: 'src/first.ts', message: 'first' },
      { rule: 'example', file: 'src/second.ts', message: 'second' },
    ],
  };

  const step = collectTopologyStep(profile, {
    collectTopology: () => result,
    persistTopology: (value) => {
      expect(value).toBe(result);
      return { artifactPath: '.tmp/repo-audit/topology.json' };
    },
  });

  expect(step).toMatchObject({
    label: 'Topology report-only inventory',
    status: 'ok',
    detail: 'findings=2; rules=1; artifact=.tmp/repo-audit/topology.json',
  });
});

it('reports started and completed transitions around a profiled control', () => {
  const profile = resolveAuditProfile('repository');
  const progress = [];
  const step = collectProfiledSyncStep(
    profile,
    'npm-audit',
    'npm audit',
    () => ({ status: 'passed' }),
    (_result, durationMs) => ({
      label: 'npm audit',
      status: 'ok',
      detail: 'passed',
      durationMs,
    }),
    (event) => progress.push(event)
  );

  expect(step.status).toBe('ok');
  expect(progress).toEqual([
    { controlId: 'npm-audit', label: 'npm audit', state: 'started' },
    expect.objectContaining({
      controlId: 'npm-audit',
      label: 'npm audit',
      state: 'completed',
      outcome: 'ok',
    }),
  ]);
});

it('normalizes async projection failures and completes progress as failed', async () => {
  const profile = resolveAuditProfile('repository');
  const progress = [];
  const step = await collectProfiledAsyncStep(
    profile,
    'codeql',
    'CodeQL',
    async () => ({ violations: [] }),
    () => {
      throw new Error('projection failed');
    },
    (event) => progress.push(event)
  );

  expect(step).toMatchObject({
    label: 'CodeQL',
    status: 'failed',
    summary: 'invalid-output',
  });
  expect(step.stderr).toContain('projection failed');
  expect(progress).toEqual([
    { controlId: 'codeql', label: 'CodeQL', state: 'started' },
    expect.objectContaining({
      controlId: 'codeql',
      label: 'CodeQL',
      state: 'completed',
      outcome: 'failed',
    }),
  ]);
});

it('fails the report-only control when its artifact cannot be persisted', () => {
  const profile = resolveAuditProfile('repository');
  const step = collectTopologyStep(profile, {
    collectTopology: () => ({ files: [], violations: [] }),
    persistTopology: () => {
      throw new Error('artifact write failed');
    },
  });

  expect(step).toMatchObject({
    label: 'Topology report-only inventory',
    status: 'failed',
    summary: 'invalid-output',
  });
  expect(step.stderr).toContain('artifact write failed');
});
