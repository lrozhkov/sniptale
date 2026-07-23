import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

import { QA_WRAPPER_CLI_CONTRACTS } from './cli-contracts.mjs';
import { STRUCTURAL_AUDIT_STEPS } from '../core/qa-steps/definitions.data.mjs';
import { resolveQaLanePolicy } from '../core/qa-steps/policy/lane.mjs';
import { formatStructuralRiskConsole } from '../core/structural-risk/report.mjs';
import { createTempRoot } from '../core/test-helpers';
import {
  runStructuralAuditWrapper,
  STRUCTURAL_AUDIT_MAX_BYTES,
  writeStructuralAuditArtifact,
} from './structural-audit.mjs';

it('registers structural audit as a distinct manual report-only wrapper', () => {
  expect(QA_WRAPPER_CLI_CONTRACTS['qa:structural-audit']).toBeDefined();
  expect(STRUCTURAL_AUDIT_STEPS).toEqual([
    expect.arrayContaining(['structural-audit', 'Structural audit', 'verify-structural-risk.mjs']),
  ]);
  expect(fs.readFileSync('tooling/qa/wrappers/structural-audit.mjs', 'utf8')).not.toContain(
    'blocking: true'
  );
  expect(resolveQaLanePolicy('structural-audit')).toMatchObject({
    runsIn: ['qa:structural-audit'],
    requiredBy: [],
    execution: 'manual',
  });
  for (const file of [
    'tooling/qa/wrappers/checkpoint.mjs',
    'tooling/qa/wrappers/closeout.mjs',
    'tooling/qa/wrappers/release.mjs',
    'tooling/qa/wrappers/audit.mjs',
  ]) {
    expect(fs.readFileSync(file, 'utf8')).not.toContain('topology-fragmentation');
  }
});

it('writes parseable private byte-bounded artifacts after deep sanitization', () => {
  const root = createTempRoot('structural-audit-artifact-');
  const outputPath = path.join(root, 'report.json');
  const secret = 'bare-structural-private-value';
  const functions = Array.from({ length: 300 }, (_, index) => ({
    file: `/home/alice/${secret}-${index}.ts`,
    symbol: `run${index}`,
    score: 5,
    lines: 80,
    stateAuthorityNames: Array.from({ length: 100 }, (__, state) => `state-${state}`),
  }));
  const clusters = Array.from({ length: 20 }, (_, index) => ({
    id: `cluster-${index}`,
    decision: index % 2 === 0 ? 'Consolidate' : 'Keep',
    confidence: 'low',
    maximumStructuralScore: index,
    files: [`/home/alice/${secret}-cluster-${index}.ts`],
    fileMetrics: functions,
  }));
  writeStructuralAuditArtifact(
    {
      scope: 'repo-wide-audit',
      files: [
        {
          file: `/home/alice/${secret}.ts`,
          score: 5,
          lines: 500,
          functions,
        },
      ],
      functions,
      advisories: functions.map((metric) => ({ ...metric, reason: secret })),
    },
    {
      outputPath,
      maximumBytes: STRUCTURAL_AUDIT_MAX_BYTES,
      sanitizerOptions: { repositoryRoot: root, sensitiveValues: [secret] },
      fragmentationReport: {
        clusters,
        summary: {
          totalClusters: 25,
          candidateClusters: 20,
          split: 0,
          consolidate: 10,
          keep: 10,
        },
      },
    }
  );

  const text = fs.readFileSync(outputPath, 'utf8');
  const artifact = JSON.parse(text);
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(STRUCTURAL_AUDIT_MAX_BYTES);
  expect(text).not.toMatch(/bare-structural-private-value|alice/u);
  expect(artifact.schemaVersion).toBe(2);
  expect(artifact.functions[0].stateAuthorityNames).toHaveLength(50);
  expect(artifact.summary).toMatchObject({
    totalClusters: 25,
    candidateClusters: 20,
    reportedClusters: artifact.clusters.length,
  });
  expect(artifact.clusters).toHaveLength(20);
  expect(artifact.clusters.every((cluster) => cluster.fileMetrics == null)).toBe(true);
  expect(fs.statSync(outputPath).mode & 0o777).toBe(0o600);
});

it('retains structural and topology evidence when every artifact section exceeds its budget', () => {
  const root = createTempRoot('structural-audit-balanced-artifact-');
  const outputPath = path.join(root, 'report.json');
  const metrics = Array.from({ length: 120 }, (_, index) => ({
    file: `apps/extension/src/content/demo/owner-${index}/runtime.ts`,
    symbol: `run${index}`,
    score: 8 - (index % 8),
    lines: 120,
    stateAuthorityNames: Array.from({ length: 50 }, (__, state) => `state-${state}`),
  }));
  const clusters = Array.from({ length: 120 }, (_, index) => ({
    id: `apps/extension/src/content/demo/owner-${index}`,
    decision: index % 2 === 0 ? 'Consolidate' : 'Keep',
    confidence: 'low',
    maximumStructuralScore: 8 - (index % 8),
    files: Array.from(
      { length: 50 },
      (__, fileIndex) => `apps/extension/src/content/demo/owner-${index}/operation-${fileIndex}.ts`
    ),
    fileDetails: Array.from({ length: 50 }, (__, fileIndex) => ({
      file: `apps/extension/src/content/demo/owner-${index}/operation-${fileIndex}.ts`,
      reason: 'default',
    })),
  }));

  writeStructuralAuditArtifact(
    {
      scope: 'repo-wide-audit',
      files: metrics,
      functions: metrics,
      advisories: metrics.map((metric) => ({ ...metric, reason: 'bounded structural evidence' })),
    },
    {
      outputPath,
      maximumBytes: STRUCTURAL_AUDIT_MAX_BYTES,
      sanitizerOptions: { repositoryRoot: root, sensitiveValues: [] },
      fragmentationReport: {
        clusters,
        summary: {
          totalClusters: clusters.length,
          candidateClusters: clusters.length,
          split: 0,
          consolidate: 60,
          keep: 60,
        },
      },
    }
  );

  const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  expect(artifact.files.length).toBeGreaterThan(0);
  expect(artifact.functions.length).toBeGreaterThan(0);
  expect(artifact.findings.length).toBeGreaterThan(0);
  expect(artifact.clusters.length).toBeGreaterThan(0);
  expect(new Set(artifact.clusters.map((cluster) => cluster.decision))).toEqual(
    new Set(['Consolidate', 'Keep'])
  );
});

it('composes one visible structural and topology block without running a repository audit', () => {
  const root = createTempRoot('structural-audit-wrapper-');
  const outputPath = path.join(root, 'report.json');
  const report = {
    scope: 'repo-wide-audit',
    files: [],
    functions: [],
    violations: [],
    advisories: [],
  };
  const fragmentationReport = {
    schemaVersion: 1,
    clusterStrategy: 'path-depth-v1',
    scannedFiles: 0,
    partitionedFiles: 0,
    unresolvedEdges: 0,
    clusters: [],
    summary: { totalClusters: 0, candidateClusters: 0, split: 0, consolidate: 0, keep: 0 },
  };
  const result = runStructuralAuditWrapper({
    files: [],
    root,
    structuralReportFactory: () => report,
    fragmentationReportFactory: () => fragmentationReport,
    artifactOptions: {
      outputPath,
      sanitizerOptions: { repositoryRoot: root, sensitiveValues: [] },
    },
  });
  const output = result.steps[0].consoleOutput;

  expect(output.match(/Structural risk \(repo-wide-audit\)/gu)).toHaveLength(1);
  expect(output.match(/Topology fragmentation \(manual report-only\)/gu)).toHaveLength(1);
  expect(output).toContain('attention=0, watch=0');
  expect(output).toContain('candidates=0, split=0, consolidate=0, keep=0');
});

it('keeps topology, artifact location, and a bounded structural preview visible', () => {
  const root = createTempRoot('structural-audit-console-');
  const outputPath = path.join(root, 'report.json');
  const advisories = Array.from({ length: 20 }, (_, index) => ({
    severity: 'watch',
    id: `structural-${index}`,
    file: `apps/extension/src/content/demo/file-${index}.ts`,
    line: 1,
    symbol: '<file>',
    reason: 'bounded preview evidence',
  }));
  const result = runStructuralAuditWrapper({
    files: [],
    root,
    structuralReportFactory: () => ({
      scope: 'repo-wide-audit',
      files: [],
      functions: [],
      violations: [],
      advisories,
    }),
    fragmentationReportFactory: () => ({
      clusters: [],
      summary: { totalClusters: 0, candidateClusters: 0, split: 0, consolidate: 0, keep: 0 },
    }),
    artifactOptions: {
      outputPath,
      sanitizerOptions: { repositoryRoot: root, sensitiveValues: [] },
    },
  });
  const output = result.steps[0].consoleOutput;

  expect(output.indexOf('Topology fragmentation')).toBeLessThan(output.indexOf('Artifact:'));
  expect(output.indexOf('Artifact:')).toBeLessThan(output.indexOf('Structural risk'));
  expect(output.match(/- \[watch\]/gu)).toHaveLength(12);
  expect(output).toContain('... 8 more structural findings in artifact');
});

it('does not claim an audit artifact for bounded diff-scoped output', () => {
  const output = formatStructuralRiskConsole(
    {
      scope: 'current-diff',
      violations: [],
      advisories: [
        { severity: 'watch', id: 'one', file: 'one.ts', line: 1, symbol: '<file>', reason: 'one' },
        { severity: 'watch', id: 'two', file: 'two.ts', line: 1, symbol: '<file>', reason: 'two' },
      ],
    },
    { limit: 1 }
  );

  expect(output).toContain('... 1 more structural findings not shown');
  expect(output).not.toContain('in artifact');
});
