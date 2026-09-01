/**
 * Architecture policy guardrail aggregator.
 */

import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { isExecutedAsScript, printViolations } from '../../../runtime/process/shared-cli.mjs';
import {
  collectArchitectureInventory,
  formatArchitectureInventorySummary,
} from '../architecture-inventory/check.mjs';
import { collectChangedTargets } from '../../../runtime/scope/changed-targets.helpers.mjs';
import { resolveScopedTargetFiles } from '../../../runtime/scope/target-files.helpers.mjs';
import { filterProductionSourceFiles, collectLayerLeakageViolations } from './imports.mjs';
import { collectRawStorageMutationViolations } from './ownership.mjs';
import { collectPolicyStateDescriptorViolations } from './policy-state.mjs';
import { collectSecondLevelSccReport, collectSecondLevelSccTrendViolations } from './scc.mjs';
import { isProductSourcePath } from '../../../analysis/repository/src-production-targets.mjs';

export { collectLayerLeakageViolations } from './imports.mjs';
export { collectRawStorageMutationViolations } from './ownership.mjs';
export { collectPolicyStateDescriptorViolations } from './policy-state.mjs';
export { collectSecondLevelSccReport, collectSecondLevelSccTrendViolations } from './scc.mjs';

function collectProductSourceFiles() {
  return filterProductionSourceFiles(collectCodeFiles().filter(isProductSourcePath));
}

function collectOptionalChangedTargets(scope) {
  try {
    return collectChangedTargets({ scope });
  } catch {
    return null;
  }
}

export function collectArchitectureGuardrailViolations(files, options = {}) {
  return [
    ...collectLayerLeakageViolations(files, options),
    ...collectRawStorageMutationViolations(files, options),
    ...collectPolicyStateDescriptorViolations(files, options),
    ...collectSecondLevelSccTrendViolations(files, options),
  ];
}

function collectNewFileSet(changedTargets) {
  if (!changedTargets) {
    return new Set();
  }
  return new Set([...(changedTargets.addedFiles ?? []), ...(changedTargets.untrackedFiles ?? [])]);
}

export function runArchitectureGuardrailCheck({
  baselineOverrides = {},
  files = [],
  root = process.cwd(),
  scope = 'workspace',
} = {}) {
  const advisories = [];
  const targets = resolveScopedTargetFiles({
    files,
    scope,
    collectFiles: collectProductSourceFiles,
  });
  const repoWideProductFiles = collectProductSourceFiles();
  const changedTargets = collectOptionalChangedTargets(scope);
  const sccReport = collectSecondLevelSccReport(repoWideProductFiles, {
    registry: baselineOverrides.secondLevelSccRegistry,
  });
  const architectureInventory = collectArchitectureInventory(repoWideProductFiles, {
    changedTargets,
  });
  return {
    skipped: targets.files.length === 0 && repoWideProductFiles.length === 0,
    files: targets.relativeFiles,
    architectureInventory,
    sccReport,
    violations: [
      ...collectLayerLeakageViolations(repoWideProductFiles, {
        baseline: baselineOverrides.layerLeakage,
      }),
      ...collectRawStorageMutationViolations(repoWideProductFiles, {
        baseline: baselineOverrides.rawStorageMutation,
      }),
      ...collectPolicyStateDescriptorViolations(repoWideProductFiles, {
        advisories,
        enforceAll: scope === 'repo-wide',
        newFiles: collectNewFileSet(changedTargets),
        root,
      }),
      ...collectSecondLevelSccTrendViolations(repoWideProductFiles, {
        registry: baselineOverrides.secondLevelSccRegistry,
      }),
    ],
    ...(advisories.length > 0 ? { advisories } : {}),
  };
}

function formatSccSummary(report) {
  const active = report.components.map((component) => {
    const suffix = component.registryId ? ` (${component.registryId})` : '';
    return `- ${component.owners.join(' -> ')}${suffix}`;
  });
  const removed = report.removed.map((id) => `- ${id}`);
  const summary = [
    `Named second-level SCCs: ${report.components.length} active,`,
    `${report.removed.length} removed from registry baseline`,
  ].join(' ');
  return [
    summary,
    ...(active.length > 0 ? ['Active:', ...active] : []),
    ...(removed.length > 0 ? ['Removed:', ...removed] : []),
  ].join('\n');
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runArchitectureGuardrailCheck({ scope: 'repo-wide' });
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.violations.length > 0 ? 1 : 0);
  }
  if (result.violations.length > 0) {
    printViolations('Architecture guardrail violations found:', result.violations);
    process.exit(1);
  }
  process.stdout.write(
    [
      'Architecture guardrail passed',
      formatSccSummary(result.sccReport),
      formatArchitectureInventorySummary(result.architectureInventory),
      '',
    ].join('\n')
  );
}
