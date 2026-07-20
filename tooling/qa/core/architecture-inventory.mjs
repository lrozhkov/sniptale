import path from 'node:path';

import { collectBrowserAdapterViolations } from './verify-browser-adapters.mjs';
import { isProductionSourceFile } from './architecture-guardrails.helpers.mjs';
import { repoRoot, toRelativePath } from './shared.mjs';
import { collectChangedTargets } from '../runtime/changed-targets.helpers.mjs';
import { collectInventorySizeMetrics } from './architecture-inventory.size.mjs';
import { collectPolicyStateInventory } from './architecture-guardrails.policy-state.mjs';
import {
  collectAuthorityStateSignals,
  collectDefaultRuntimeMessagingImportSignals,
  collectRetiredBroadFacadeImports,
  collectUsageSignals,
  MAX_REPORTED_ITEMS,
} from './architecture-inventory.signals.mjs';
import { collectInventoryDiffSummary } from './architecture-inventory.diff.mjs';

export function collectArchitectureInventory(
  files,
  { changedTargets = null, root = repoRoot } = {}
) {
  const productionFiles = files.map(toRelativePath).filter(isProductionSourceFile).sort();
  const inventory = {
    ruleId: 'architecture-inventory',
    productionFileCount: productionFiles.length,
    ...collectInventorySizeMetrics(productionFiles, root),
    usageSignals: collectUsageSignals(productionFiles, root),
    directBrowserCalls: collectBrowserAdapterViolations(
      productionFiles.map((file) => path.join(root, file))
    ).slice(0, MAX_REPORTED_ITEMS),
    defaultRuntimeMessagingImports: collectDefaultRuntimeMessagingImportSignals(
      productionFiles,
      root
    ),
    retiredBroadFacadeImports: collectRetiredBroadFacadeImports(),
    authorityStateSignals: collectAuthorityStateSignals(productionFiles, root),
    policyState: collectPolicyStateInventory({ root }),
  };
  return {
    ...inventory,
    diff: collectInventoryDiffSummary(inventory, changedTargets),
  };
}

export function collectWorkspaceArchitectureInventory(files, { root = repoRoot } = {}) {
  return collectArchitectureInventory(files, {
    changedTargets: collectChangedTargets({ scope: 'workspace' }),
    root,
  });
}

function sumCounts(valueByKey) {
  return Object.values(valueByKey).reduce((sum, value) => sum + value, 0);
}

export function formatArchitectureInventorySummary(inventory) {
  const largestRoot = inventory.topLevelRoots[0];
  const largestSharedOwner = inventory.largestSharedOwners[0];
  return [
    `Architecture inventory: ${inventory.productionFileCount} production src file(s) scanned.`,
    largestRoot
      ? `Largest src root: ${largestRoot.path} (${largestRoot.files} files, ${largestRoot.loc} LOC).`
      : null,
    largestSharedOwner
      ? [
          `Largest reusable owner: ${largestSharedOwner.path}`,
          `(${largestSharedOwner.files} files, ${largestSharedOwner.loc} LOC).`,
        ].join(' ')
      : null,
    `Direct browser-call inventory: ${inventory.directBrowserCalls.length} reported item(s).`,
    [
      'Default runtime messaging import inventory:',
      `${inventory.defaultRuntimeMessagingImports.length} reported item(s).`,
    ].join(' '),
    [
      'Retired broad facade import inventory:',
      `${inventory.retiredBroadFacadeImports.length} reported item(s).`,
    ].join(' '),
    `Authority/capability state signals: ${inventory.authorityStateSignals.length} reported item(s).`,
    [
      'Policy-state inventory:',
      `${inventory.policyState.descriptorCount} descriptor(s) declared.`,
    ].join(' '),
    inventory.diff
      ? [
          `Diff-aware inventory: baseline=${inventory.diff.baselineCount},`,
          `added=${sumCounts(inventory.diff.added)},`,
          `removed=${sumCounts(inventory.diff.removed)}.`,
        ].join(' ')
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}
