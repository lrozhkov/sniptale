import {
  architectureFileExists,
  collectTopLevelAuthorityStateReasons,
  hasResetForTestsSignal,
  isCapabilityStatePath,
  readArchitectureFileText,
} from './architecture-authority-state-signals.mjs';
import { readSourceFile } from './architecture-guardrails.helpers.mjs';
import { POLICY_STATE_REGISTRY_PATH } from './architecture-guardrails.policy-state.mjs';
import { collectDefaultRuntimeMessagingImports } from './messaging-default-imports.mjs';

export const MAX_REPORTED_ITEMS = 20;

const USAGE_SIGNAL_PATTERNS = [
  ['sendRuntimeMessage', /\bsendRuntimeMessage\b/gu],
  ['sendTabMessage', /\bsendTabMessage\b/gu],
  ['stateManager', /\bstateManager\b/gu],
  ['createLazyDefaultOwner', /\bcreateLazyDefaultOwner\b/gu],
  ['createPrivilegedSyncMemoryDomain', /\bcreatePrivilegedSyncMemoryDomain\b/gu],
];
function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

export function collectUsageSignals(files, root) {
  const signals = Object.fromEntries(USAGE_SIGNAL_PATTERNS.map(([id]) => [id, []]));
  for (const file of files) {
    const text = readArchitectureFileText(root, file);
    for (const [id, pattern] of USAGE_SIGNAL_PATTERNS) {
      const count = countMatches(text, pattern);
      if (count > 0) {
        signals[id].push({ file, count });
      }
    }
  }
  return Object.fromEntries(
    Object.entries(signals).map(([id, entries]) => [
      id,
      entries
        .sort((left, right) => right.count - left.count || left.file.localeCompare(right.file))
        .slice(0, MAX_REPORTED_ITEMS),
    ])
  );
}

export function collectAuthorityStateSignals(files, root) {
  const policyStateRegistryExists = architectureFileExists(root, POLICY_STATE_REGISTRY_PATH);
  const signals = [];
  for (const file of files) {
    const sourceFile = readSourceFile(root, file);
    const text = readArchitectureFileText(root, file);
    const reasons = collectAuthorityReasons({ file, policyStateRegistryExists, sourceFile, text });
    if (reasons.length > 0) {
      signals.push({ file, reasons });
    }
  }
  return signals
    .sort((left, right) => left.file.localeCompare(right.file))
    .slice(0, MAX_REPORTED_ITEMS);
}

function collectAuthorityReasons({ file, policyStateRegistryExists, sourceFile, text }) {
  const reasons = [];
  if (isCapabilityStatePath(file)) {
    reasons.push('capability-path');
  }
  reasons.push(...collectTopLevelAuthorityStateReasons(sourceFile));
  if (hasResetForTestsSignal(text)) {
    reasons.push('reset-for-tests');
  }
  if (policyStateRegistryExists && reasons.length > 0 && !/\bpolicyStateId\b/u.test(text)) {
    reasons.push('missing-policy-state-id');
  }
  return reasons;
}

export function collectRetiredBroadFacadeImports() {
  return [];
}

export function collectDefaultRuntimeMessagingImportSignals(files, root) {
  return collectDefaultRuntimeMessagingImports(files, { root }).slice(0, MAX_REPORTED_ITEMS);
}
