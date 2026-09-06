import fs from 'node:fs';
import path from 'node:path';

import { expect } from 'vitest';

import type { collectVerificationProfile } from './verification-profile.mjs';
import { REPO_AUDIT_REPORT_DEFINITIONS } from './registry.data.mjs';
import {
  ADVISORY_TOOL_COVERAGE,
  BASE_WRAPPER_TOOL_COVERAGE,
  HYBRID_WRAPPER_TOOL_COVERAGE,
} from './verification-profile.tool-coverage';

type Verification = ReturnType<typeof collectVerificationProfile>['verification'];
type ToolCoverageEntry = Verification['toolCoverage'][number];
type ReportDefinition = {
  catalogTool?: string;
  commands: readonly string[];
  controlId: string;
  tool: string;
};

export function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8'));
}

function expectToolCoverageEntries(
  verification: Verification,
  entries: readonly ToolCoverageEntry[]
) {
  for (const entry of entries) {
    expect(verification.toolCoverage).toContainEqual(entry);
  }
}

function normalizeReportDefinitions(definitions: readonly ReportDefinition[]) {
  return definitions.map(({ catalogTool, commands, controlId, tool }, position) => ({
    position,
    controlId,
    tool,
    ...(catalogTool ? { catalogTool } : {}),
    commands: [...commands],
  }));
}

export function expectRepoAuditReportDefinitions(verification: Verification) {
  expect(normalizeReportDefinitions(verification.repoAuditReportDefinitions)).toEqual(
    normalizeReportDefinitions(REPO_AUDIT_REPORT_DEFINITIONS)
  );
}

export function expectWrapperCoverage(verification: Verification) {
  expect(verification.focusedTriggerCoveredTools).toContain('verify-secret-storage.mjs');
  expect(verification.focusedTriggerCoveredTools).toContain('verify-design-system.mjs');
  expect(verification.focusedWrapperTools).toContain('verify-persistence-ownership.mjs');
  expect(verification.focusedWrapperTools).toContain('verify-dead-exports.mjs');
  expect(verification.focusedWrapperTools).toContain('verify-test-coverage.mjs');
  expect(verification.fullWrapperTools).toContain('verify-persistence-ownership.mjs');
  expect(verification.fullOnlyTools).not.toContain('verify-secret-storage.mjs');
  expect(verification.fullOnlyTools).not.toContain('verify-design-system.mjs');
  expect(verification.fullOnlyTools).not.toContain('verify-dead-exports.mjs');
  expect(verification.fullOnlyTools).not.toContain('verify-test-coverage.mjs');
  expect(verification.fullOnlyTools).not.toContain('verify-audit.mjs');
  expect(verification.fullOnlyTools).not.toContain('build-step.mjs');
  expect(verification.ownerScopedTools).toEqual([
    'build-step.mjs',
    'package-dist.mjs',
    'verify-architecture-guardrails.mjs',
    'verify-audit.mjs',
  ]);
  expect(verification.harnessWrapperTools).toContain('verify-qa-controls.mjs');
  expect(verification.harnessWrapperTools).not.toContain('verify-qa-rule-coverage-contract.mjs');
  expect(verification.buildWrapperTools).toContain('build-step.mjs');
  expect(verification.buildWrapperTools).not.toContain('verify-architecture-guardrails.mjs');
  expect(verification.auditWrapperTools).toContain('codeql.mjs');
  expect(verification.advisoryWrapperTools).toEqual(['verify-advisory.mjs']);
  expect(verification.closeoutWrapperTools).toEqual(['checkpoint.mjs', 'build.mjs']);
  expect(verification.lifecycleTools).toContain('cli-contracts.mjs');
  expect(verification.e2eTools).toEqual(['vite', 'playwright']);
}

export function expectManualOnlySeparation(verification: Verification) {
  expect(verification.manualOnlyCheckScripts).toEqual([]);
  expect(verification.qualityScripts).not.toContainEqual(
    expect.objectContaining({ script: 'qa:advisory' })
  );
}

export function expectAdvisoryCoverage(verification: Verification) {
  expect(verification.advisoryTools).toEqual([]);
  expect(verification.advisoryScripts).toEqual([]);
}

export function expectRepoAuditReportCoverage(verification: Verification) {
  expect(verification.repoAuditReportTools).toEqual(
    REPO_AUDIT_REPORT_DEFINITIONS.map(({ tool }) => tool).sort()
  );
  expectRepoAuditReportDefinitions(verification);
}

export function expectBaseWrapperToolCoverageScopes(verification: Verification) {
  expectToolCoverageEntries(verification, BASE_WRAPPER_TOOL_COVERAGE);
}

export function expectHybridWrapperToolCoverageScopes(verification: Verification) {
  expectToolCoverageEntries(verification, HYBRID_WRAPPER_TOOL_COVERAGE);
}

export function expectAdvisoryToolCoverageScopes(verification: Verification) {
  expectToolCoverageEntries(verification, ADVISORY_TOOL_COVERAGE);
  expect(verification.toolCoverage).not.toContainEqual(
    expect.objectContaining({ tool: 'verify-focused.mjs' })
  );
}
