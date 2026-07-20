import { collectProductionCoverageFiles } from './coverage-audit-report.mjs';
import { resolveLocalFocusedCoverageOwnerTests } from './focused-coverage-owner-tests.mjs';
import { repoRoot } from './shared.mjs';
import { resolveCoverageThreshold } from './verify-test-coverage.thresholds.mjs';

const COVERAGE_DISPOSITIONS = new Set(['rollout', 'partial', 'unmapped']);
const APP_CORE_FAMILY_ROOTS = new Set([
  'contracts',
  'features',
  'foundation',
  'platform',
  'ui',
  'workflows',
]);
let repoInventoryCache = null;

function coverageOwner(file) {
  const parts = file.split('/');
  if (parts[0] === 'packages') return parts.slice(0, 2).join('/');
  if (parts.slice(0, 3).join('/') !== 'apps/extension/src') return parts[0];

  const landingZone = parts[3];
  if (landingZone === 'composition' && parts[4] === 'persistence' && parts[5]) {
    return parts.slice(0, 6).join('/');
  }
  if ((landingZone === 'composition' || APP_CORE_FAMILY_ROOTS.has(landingZone)) && parts[4]) {
    return parts.slice(0, 5).join('/');
  }
  return parts.slice(0, 4).join('/');
}

function createInventoryEntry(owner, files) {
  const productionFiles = [...files].sort();
  const rolloutFiles = productionFiles.filter((file) => resolveCoverageThreshold(file) !== null);
  const unownedFocusedFiles = rolloutFiles.filter(
    (file) => resolveLocalFocusedCoverageOwnerTests(file).length === 0
  );
  return {
    owner,
    productionFiles,
    rolloutFiles,
    unownedFocusedFiles,
    fileCount: productionFiles.length,
    rolloutFileCount: rolloutFiles.length,
    unownedFocusedFileCount: unownedFocusedFiles.length,
    observedDisposition:
      rolloutFiles.length === productionFiles.length
        ? 'rollout'
        : rolloutFiles.length === 0
          ? 'unmapped'
          : 'partial',
  };
}

function collectCoverageOwnerInventoryUncached(root) {
  const grouped = new Map();
  for (const file of collectProductionCoverageFiles({ root })) {
    const owner = coverageOwner(file);
    grouped.set(owner, [...(grouped.get(owner) ?? []), file]);
  }
  return [...grouped.entries()]
    .map(([owner, files]) => createInventoryEntry(owner, files))
    .sort((left, right) => left.owner.localeCompare(right.owner));
}

export function collectCoverageOwnerInventory({ root = repoRoot } = {}) {
  if (root !== repoRoot) return collectCoverageOwnerInventoryUncached(root);
  repoInventoryCache ??= collectCoverageOwnerInventoryUncached(root);
  return repoInventoryCache;
}

export function synchronizeCoverageOwnerInventory(
  coverageOwners,
  { inventory = null, root = repoRoot } = {}
) {
  const observedInventory = inventory ?? collectCoverageOwnerInventory({ root });
  const dispositions = new Map(coverageOwners.map((entry) => [entry.owner, entry]));
  const missingOwners = observedInventory
    .filter((entry) => !dispositions.has(entry.owner))
    .map((entry) => entry.owner);
  if (missingOwners.length > 0) {
    throw new Error(
      `Coverage owners require explicit dispositions before synchronization: ${missingOwners.join(', ')}`
    );
  }

  return observedInventory.map((observed) => {
    const disposition = dispositions.get(observed.owner);
    if (disposition.disposition !== observed.observedDisposition) {
      throw new Error(
        [
          `Coverage owner ${observed.owner} is ${observed.observedDisposition},`,
          `but the approved disposition is ${disposition.disposition}`,
        ].join(' ')
      );
    }
    return {
      owner: observed.owner,
      disposition: disposition.disposition,
      reason: disposition.reason,
      productionFiles: observed.productionFiles,
      rolloutFiles: observed.rolloutFiles,
      unownedFocusedFiles: observed.unownedFocusedFiles,
    };
  });
}

function violation(rule, file, message) {
  return { rule, file, message };
}

function validText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function exactFilesMatch(recorded, observed) {
  return (
    Array.isArray(recorded) &&
    recorded.length === observed.length &&
    recorded.every((file, index) => file === observed[index])
  );
}

function describeFileDrift(recorded, observed) {
  const recordedFiles = new Set(Array.isArray(recorded) ? recorded : []);
  const observedFiles = new Set(observed);
  const added = observed.filter((file) => !recordedFiles.has(file));
  const removed = [...recordedFiles].filter((file) => !observedFiles.has(file));
  return `added=[${added.join(', ')}]; removed=[${removed.join(', ')}]`;
}

function validateExactPopulation(observed, disposition, field, rule, label) {
  if (exactFilesMatch(disposition[field], observed[field])) return [];
  return [
    violation(
      rule,
      observed.owner,
      `${label} exact population changed; ${describeFileDrift(disposition[field], observed[field])}.`
    ),
  ];
}

function validateObservedDisposition(observed, disposition) {
  const violations = [];
  if (
    !COVERAGE_DISPOSITIONS.has(disposition.disposition) ||
    !validText(disposition.owner) ||
    !validText(disposition.reason)
  ) {
    violations.push(
      violation(
        'coverage-owner-disposition',
        observed.owner,
        'Coverage disposition requires owner, valid disposition, and reason.'
      )
    );
  }
  if (disposition.disposition !== observed.observedDisposition) {
    violations.push(
      violation(
        'coverage-owner-drift',
        observed.owner,
        `Coverage disposition is ${disposition.disposition}, but current rollout is ${observed.observedDisposition}.`
      )
    );
  }
  violations.push(
    ...validateExactPopulation(
      observed,
      disposition,
      'productionFiles',
      'coverage-owner-production-drift',
      'Production file'
    ),
    ...validateExactPopulation(
      observed,
      disposition,
      'rolloutFiles',
      'coverage-owner-rollout-drift',
      'Coverage rollout file'
    ),
    ...validateExactPopulation(
      observed,
      disposition,
      'unownedFocusedFiles',
      'coverage-owner-unowned-drift',
      'Unowned focused file'
    )
  );
  return violations;
}

export function collectCoverageOwnerViolations(
  coverageOwners,
  { inventory = null, root = repoRoot } = {}
) {
  const violations = [];
  const observedInventory = inventory ?? collectCoverageOwnerInventory({ root });
  const policy = new Map(coverageOwners.map((entry) => [entry.owner, entry]));
  if (policy.size !== coverageOwners.length) {
    violations.push(
      violation(
        'coverage-owner-duplicate',
        'tooling/configs/qa/technical-debt.data.json',
        'Coverage owner family keys must be unique.'
      )
    );
  }
  const liveOwners = new Set(observedInventory.map((entry) => entry.owner));
  for (const observed of observedInventory) {
    const disposition = policy.get(observed.owner);
    if (!disposition) {
      violations.push(
        violation(
          'coverage-owner-unmapped',
          observed.owner,
          'New coverage owner family requires an explicit rollout, partial, or unmapped disposition.'
        )
      );
      continue;
    }
    violations.push(...validateObservedDisposition(observed, disposition));
  }
  for (const entry of coverageOwners) {
    if (!liveOwners.has(entry.owner)) {
      violations.push(
        violation(
          'coverage-owner-stale',
          entry.owner,
          'Coverage disposition has no current production owner family.'
        )
      );
    }
  }
  return violations;
}
