import fs from 'node:fs';
import path from 'node:path';

import { expect } from 'vitest';

import type { collectVerificationProfile } from './verification-profile.mjs';
import { REPO_AUDIT_REPORT_DEFINITIONS } from './verification-profile.report-definitions';
import {
  ADVISORY_TOOL_COVERAGE,
  BASE_WRAPPER_TOOL_COVERAGE,
  HYBRID_WRAPPER_TOOL_COVERAGE,
} from './verification-profile.tool-coverage';

type Verification = ReturnType<typeof collectVerificationProfile>['verification'];
type ToolCoverageEntry = Verification['toolCoverage'][number];

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

export function expectRepoAuditReportDefinitions(verification: Verification) {
  for (const definition of REPO_AUDIT_REPORT_DEFINITIONS) {
    expect(verification.repoAuditReportDefinitions).toContainEqual(
      expect.objectContaining({
        tool: definition.tool,
        commands: expect.arrayContaining(definition.commands),
      })
    );
  }
}

export function expectWrapperCoverage(verification: Verification) {
  expect(verification.focusedTriggerCoveredTools).toContain('verify-secret-storage.mjs');
  expect(verification.focusedTriggerCoveredTools).toContain('verify-design-system.mjs');
  expect(verification.focusedTriggerCoveredTools).toContain('verify-storage-write-patterns.mjs');
  expect(verification.focusedWrapperTools).toContain('verify-dead-exports.mjs');
  expect(verification.focusedWrapperTools).toContain('verify-read-safe-naming.mjs');
  expect(verification.focusedWrapperTools).toContain('verify-lifecycle-intent.mjs');
  expect(verification.focusedWrapperTools).toContain('verify-success-failure-asymmetry.mjs');
  expect(verification.focusedWrapperTools).toContain('verify-destructive-async-swaps.mjs');
  expect(verification.focusedWrapperTools).toContain('verify-history-detached-snapshots.mjs');
  expect(verification.focusedWrapperTools).toContain('verify-history-transaction-lifecycle.mjs');
  expect(verification.focusedWrapperTools).toContain('verify-test-coverage.mjs');
  expect(verification.fullWrapperTools).toContain('verify-read-safe-naming.mjs');
  expect(verification.fullWrapperTools).toContain('verify-lifecycle-intent.mjs');
  expect(verification.fullWrapperTools).toContain('verify-success-failure-asymmetry.mjs');
  expect(verification.fullWrapperTools).toContain('verify-destructive-async-swaps.mjs');
  expect(verification.fullWrapperTools).toContain('verify-storage-write-patterns.mjs');
  expect(verification.fullWrapperTools).toContain('verify-history-detached-snapshots.mjs');
  expect(verification.fullOnlyTools).not.toContain('verify-secret-storage.mjs');
  expect(verification.fullOnlyTools).not.toContain('verify-design-system.mjs');
  expect(verification.fullOnlyTools).not.toContain('verify-dead-exports.mjs');
  expect(verification.fullOnlyTools).not.toContain('verify-test-coverage.mjs');
  expect(verification.fullOnlyTools).not.toContain('verify-audit.mjs');
  expect(verification.fullOnlyTools).not.toContain('verify-build.mjs');
  expect(verification.ownerScopedTools).toEqual([
    'package-dist.mjs',
    'verify-architecture-guardrails.mjs',
    'verify-audit.mjs',
    'verify-build.mjs',
  ]);
  expect(verification.harnessWrapperTools).toContain('verify-qa-rule-coverage-contract.mjs');
  expect(verification.buildWrapperTools).toContain('verify-architecture-guardrails.mjs');
  expect(verification.auditWrapperTools).toContain('codeql.mjs');
  expect(verification.advisoryWrapperTools).toEqual(['verify-advisory.mjs']);
  expect(verification.manualAuditTools).toContain('verify-interface-surfaces.mjs');
  expect(verification.closeoutWrapperTools).toEqual(['checkpoint.mjs', 'build.mjs']);
  expect(verification.lifecycleTools).toContain('cli-contracts.mjs');
  expect(verification.e2eTools).toEqual(['vite', 'playwright']);
}

export function expectManualOnlySeparation(verification: Verification) {
  expect(verification.manualOnlyCheckScripts).toEqual([]);
  expect(verification.qualityScripts).toContainEqual(
    expect.objectContaining({
      script: 'qa:advisory',
      tool: 'verify-advisory.mjs',
      entryKind: 'advisory',
    })
  );
}

export function expectAdvisoryCoverage(verification: Verification) {
  expect(verification.advisoryTools).toEqual(['verify-advisory.mjs']);
  expect(verification.advisoryScripts).toContainEqual(
    expect.objectContaining({
      script: 'qa:advisory',
      tool: 'verify-advisory.mjs',
      entryKind: 'advisory',
    })
  );
}

export function expectRepoAuditReportCoverage(verification: Verification) {
  expect(verification.repoAuditReportTools).toContain('verify-interface-surfaces.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-ui-automation-seams.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-multi-message-transitions.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-root-side-effects.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-read-path-side-effects.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-read-safe-naming.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-lifecycle-intent.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-success-failure-asymmetry.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-destructive-async-swaps.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-storage-write-patterns.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-runtime-protocol-contracts.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-zip-package-profile.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-backup-import-atomicity.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-privacy-feature-settings.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-contract-parser-coverage.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-resource-budget-consistency.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-resource-lifecycle-pairs.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-state-machine-proof.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-hot-loop-work.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-stats-counter-semantics.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-history-detached-snapshots.mjs');
  expect(verification.repoAuditReportTools).toContain('verify-hot-path-cleanups.mjs');
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
