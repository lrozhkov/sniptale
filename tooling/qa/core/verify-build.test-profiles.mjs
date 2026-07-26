import { resolveFocusedCoverageOwnerScope } from './focused-coverage-owner-resolver.mjs';
import { resolveDeterministicFocusedCoverageOwnerTests } from './focused-coverage-owner-tests.mjs';
import { classifyOwnerGroup } from './structural-risk/owner-classifier.mjs';
import { isHighRiskFocusedProofFile } from './verify-focused.high-risk-proof.helpers.mjs';

const TRANSITIVE_TEST_PROFILE_FAMILIES = new Set([
  'manifest-owned',
  'messaging-runtime',
  'parser-snapshot-export',
  'storage-persistence',
]);
const SATURATED_RELATED_PROFILE_FAMILIES = new Set([
  'messaging-runtime',
  'package-and-app-core',
  'parser-snapshot-export',
]);
const BROAD_PUBLIC_TEST_PATTERN =
  /^(?:packages\/|apps\/extension\/src\/(?:composition|contracts|foundation|platform|workflows)\/)/u;
const APP_CORE_PUBLIC_ROOT_PATTERN = /^apps\/extension\/src\/(?:features|ui)\//u;
const PUBLIC_ENTRY_BASENAME_PATTERN = /^(?:index|public-api)\.[cm]?[jt]sx?$/u;

export const BUILD_TEST_PROFILE_LIMITS = {
  codeFiles: 4,
  ownerTests: 12,
  targetFiles: 8,
};
export const SATURATED_RELATED_INPUT_LIMIT = 32;

export const BUILD_TEST_EXECUTION_CLASSES = Object.freeze({
  bounded: 'bounded-concurrent',
  saturated: 'saturated-exclusive',
});

function resolveExecutionPolicy({ fullSuite = false, matchedFamilies, profile, relatedFiles }) {
  if (fullSuite) {
    return {
      executionClass: BUILD_TEST_EXECUTION_CLASSES.saturated,
      executionReason: 'full-suite',
    };
  }
  if (profile !== 'related-transitive') {
    return {
      executionClass: BUILD_TEST_EXECUTION_CLASSES.bounded,
      executionReason: 'bounded-selection',
    };
  }
  if (relatedFiles.length > SATURATED_RELATED_INPUT_LIMIT) {
    return {
      executionClass: BUILD_TEST_EXECUTION_CLASSES.saturated,
      executionReason: 'related-input-threshold',
    };
  }
  if (matchedFamilies.some((family) => SATURATED_RELATED_PROFILE_FAMILIES.has(family))) {
    return {
      executionClass: BUILD_TEST_EXECUTION_CLASSES.saturated,
      executionReason: 'high-fan-out-family',
    };
  }
  return {
    executionClass: BUILD_TEST_EXECUTION_CLASSES.bounded,
    executionReason: 'related-inputs-within-limit',
  };
}

function createScopeDetail({
  directTestFiles,
  executionClass,
  executionReason,
  fullSuite = false,
  profile,
  profileReason,
  relatedFiles,
  matchedFamilies,
}) {
  const schedulingDetail = [
    `selection=${profile}`,
    `execution=${executionClass}`,
    `related-inputs=${relatedFiles.length}`,
    `reason=${executionReason}`,
  ].join('; ');
  const selectionReasonDetail = profileReason ? `; selection-reason=${profileReason}` : '';
  if (fullSuite) {
    return `${schedulingDetail}; full product test suite${selectionReasonDetail}`;
  }
  if (relatedFiles.length > 0) {
    const familyDetail =
      matchedFamilies.length > 0 ? `; trigger families: ${matchedFamilies.join(', ')}` : '';
    const fileLabel = relatedFiles.length === 1 ? 'related file' : 'related files';
    const relatedSummary = `broader related tests (${relatedFiles.length} ${fileLabel}${familyDetail})`;
    return `${schedulingDetail}; ${relatedSummary}${selectionReasonDetail}`;
  }
  if (directTestFiles.length > 0) {
    return `${schedulingDetail}; direct tests (${directTestFiles.length})${selectionReasonDetail}`;
  }
  if (profile === 'related-transitive') {
    return `${schedulingDetail}; bounded consumer discovery required${selectionReasonDetail}`;
  }
  return `${schedulingDetail}; skipped: no matching unit-test targets${selectionReasonDetail}`;
}

function hasTransitiveProfileTrigger(files, matchedFamilies) {
  return (
    files.some(
      (file) =>
        isHighRiskFocusedProofFile(file) ||
        BROAD_PUBLIC_TEST_PATTERN.test(file) ||
        (APP_CORE_PUBLIC_ROOT_PATTERN.test(file) &&
          PUBLIC_ENTRY_BASENAME_PATTERN.test(file.slice(file.lastIndexOf('/') + 1)))
    ) || matchedFamilies.some((family) => TRANSITIVE_TEST_PROFILE_FAMILIES.has(family))
  );
}

function resolveOwnerDirectProfile(input) {
  if (
    input.productionCodeFiles.length === 0 ||
    input.productionCodeFiles.length > BUILD_TEST_PROFILE_LIMITS.codeFiles ||
    input.productTargetFiles.length > BUILD_TEST_PROFILE_LIMITS.targetFiles ||
    hasTransitiveProfileTrigger(input.productionCodeFiles, input.matchedFamilies)
  ) {
    return null;
  }

  const focusedScope = input.focusedScopeResolver({
    codeFiles: input.productionCodeFiles,
    directTestFiles: input.directTestFiles,
    newFiles: input.addedFiles,
  });
  if (focusedScope.verdict === 'block-invalid-owner-map') {
    return null;
  }

  const ownerTestsByFile = input.productionCodeFiles.map((file) => [
    file,
    input.ownerTestResolver(file),
  ]);
  if (ownerTestsByFile.some(([, tests]) => tests.length === 0)) {
    return null;
  }
  const testFiles = [
    ...new Set([...input.directTestFiles, ...ownerTestsByFile.flatMap(([, tests]) => tests)]),
  ].sort();
  if (testFiles.length === 0 || testFiles.length > BUILD_TEST_PROFILE_LIMITS.ownerTests) {
    return null;
  }

  return {
    directTestFiles: testFiles,
    relatedFiles: [],
    matchedFamilies: input.matchedFamilies,
    profile: 'owner-direct',
    profileReason: `deterministic owner tests=${testFiles.length}; ${focusedScope.detail}`,
  };
}

function finalizeTestScope(scope) {
  for (const field of ['fullSuite', 'requireRelatedTests']) {
    if (scope[field] != null && typeof scope[field] !== 'boolean') {
      throw new Error(`Build test scope ${field} must be a boolean when present.`);
    }
  }
  const normalizedScope = {
    ...scope,
    fullSuite: scope.fullSuite ?? false,
    requireRelatedTests: scope.requireRelatedTests ?? false,
  };
  const executionPolicy = resolveExecutionPolicy(normalizedScope);
  const finalizedScope = { ...normalizedScope, ...executionPolicy };
  return {
    ...normalizedScope,
    executionClass: executionPolicy.executionClass,
    detail: createScopeDetail(finalizedScope),
  };
}

function resolveUnavailableProductionProfile({
  directTestFiles,
  matchedFamilies,
  ownerTestResolver,
  productionCodeFiles,
  relatedFiles,
  unavailableProductionScopes,
}) {
  const proofScopes = unavailableProductionScopes.map((scope) => ({
    ...scope,
    ownerTestsBySuccessor: (scope.changedSuccessorFiles ?? []).map((file) => ({
      file,
      tests: ownerTestResolver(file),
    })),
  }));
  for (const scope of proofScopes) {
    scope.ownerTests = [...new Set(scope.ownerTestsBySuccessor.flatMap(({ tests }) => tests))];
  }
  if (
    proofScopes.some(
      (scope) =>
        scope.successorProofKind !== 'dead-export' &&
        ((scope.changedSuccessorFiles ?? []).length === 0 ||
          (scope.successorProofKind === 'aggregate-providers' &&
            (scope.ownerTests.length === 0 ||
              scope.ownerTestsBySuccessor.some(({ tests }) => tests.length === 0))))
    )
  ) {
    return finalizeTestScope({
      directTestFiles: [],
      fullSuite: true,
      relatedFiles: [],
      matchedFamilies,
      profile: 'related-transitive',
      profileReason: 'unavailable production target has no executable affected-test scope',
    });
  }
  const proofFiles = proofScopes.flatMap((scope) => [
    ...scope.relatedFiles,
    ...(scope.changedSuccessorFiles ?? []),
    ...scope.ownerTests,
  ]);
  const hasDeadExportProof = proofScopes.some(
    (scope) => scope.successorProofKind === 'dead-export'
  );
  const hasExecutableSuccessorProof = proofScopes.some(
    (scope) => scope.successorProofKind !== 'dead-export'
  );
  const directProofFiles = [
    ...new Set([
      ...productionCodeFiles,
      ...proofScopes.flatMap((scope) => scope.changedSuccessorFiles ?? []),
    ]),
  ].sort();
  const directOwnerTestsByFile = directProofFiles.map((file) => ({
    file,
    tests: ownerTestResolver(file),
  }));
  const directProofOwnerGroups = new Set(
    [...proofScopes.map((scope) => scope.file), ...directProofFiles].map(classifyOwnerGroup)
  );
  const hasCompleteDirectOwnerProof =
    !hasDeadExportProof &&
    directProofFiles.length > 0 &&
    directProofOwnerGroups.size === 1 &&
    directOwnerTestsByFile.every(({ tests }) => tests.length > 0);
  const directOwnerTests = [
    ...new Set([...directTestFiles, ...directOwnerTestsByFile.flatMap(({ tests }) => tests)]),
  ].sort();
  if (
    hasCompleteDirectOwnerProof &&
    directOwnerTests.length > 0 &&
    directOwnerTests.length <= BUILD_TEST_PROFILE_LIMITS.ownerTests
  ) {
    return finalizeTestScope({
      directTestFiles: directOwnerTests,
      relatedFiles: [],
      matchedFamilies,
      profile: 'owner-direct',
      profileReason: 'unavailable production targets have graph-closed changed-owner proof',
    });
  }
  return finalizeTestScope({
    directTestFiles: [],
    relatedFiles: [...new Set([...relatedFiles, ...proofFiles])].sort(),
    matchedFamilies,
    profile: 'related-transitive',
    requireRelatedTests: hasExecutableSuccessorProof,
    profileReason: hasDeadExportProof
      ? 'unavailable production targets have graph-closed successor/dead-export proof'
      : 'unavailable production targets have graph-closed successor owner proof',
  });
}

function resolveNoExistingProductionProfile(input) {
  return finalizeTestScope({
    directTestFiles: input.directTestFiles,
    relatedFiles: [],
    matchedFamilies: input.matchedFamilies,
    profile: input.directTestFiles.length > 0 ? 'direct-changed' : 'skip',
    profileReason:
      input.directTestFiles.length > 0 ? 'test-only product diff' : 'no product unit-test targets',
  });
}

export function resolveBuildTestProfile({
  addedFiles = [],
  directTestFiles = [],
  focusedScopeResolver = resolveFocusedCoverageOwnerScope,
  matchedFamilies = [],
  ownerTestResolver = resolveDeterministicFocusedCoverageOwnerTests,
  productTargetFiles = [],
  productionCodeFiles = [],
  relatedFiles = [],
  unavailableProductionScopes = [],
} = {}) {
  if (unavailableProductionScopes.length > 0) {
    return resolveUnavailableProductionProfile({
      directTestFiles,
      matchedFamilies,
      ownerTestResolver,
      productionCodeFiles,
      relatedFiles,
      unavailableProductionScopes,
    });
  }
  if (productionCodeFiles.length === 0) {
    return resolveNoExistingProductionProfile({
      directTestFiles,
      matchedFamilies,
    });
  }

  const ownerDirectProfile = resolveOwnerDirectProfile({
    addedFiles,
    directTestFiles,
    focusedScopeResolver,
    matchedFamilies,
    ownerTestResolver,
    productTargetFiles,
    productionCodeFiles,
  });
  if (ownerDirectProfile) return finalizeTestScope(ownerDirectProfile);

  return finalizeTestScope({
    directTestFiles: [],
    relatedFiles,
    matchedFamilies,
    profile: 'related-transitive',
    profileReason: hasTransitiveProfileTrigger(productionCodeFiles, matchedFamilies)
      ? 'runtime/public/transitive risk requires affected-consumer discovery'
      : 'owner proof is ambiguous or exceeds the small-diff budget',
  });
}
