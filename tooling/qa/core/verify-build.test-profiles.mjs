import { resolveFocusedCoverageOwnerScope } from './focused-coverage-owner-resolver.mjs';
import { resolveDeterministicFocusedCoverageOwnerTests } from './focused-coverage-owner-tests.mjs';
import { isHighRiskFocusedProofFile } from './verify-focused.high-risk-proof.helpers.mjs';

const TRANSITIVE_TEST_PROFILE_FAMILIES = new Set([
  'manifest-owned',
  'messaging-runtime',
  'parser-snapshot-export',
  'storage-persistence',
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

function createScopeDetail({
  directTestFiles,
  fullSuite = false,
  profile,
  profileReason,
  relatedFiles,
  matchedFamilies,
}) {
  const reasonDetail = profileReason ? `; reason=${profileReason}` : '';
  if (fullSuite) {
    return `profile=${profile}; full product test suite${reasonDetail}`;
  }
  if (relatedFiles.length > 0) {
    const familyDetail =
      matchedFamilies.length > 0 ? `; trigger families: ${matchedFamilies.join(', ')}` : '';
    const fileLabel = relatedFiles.length === 1 ? 'related file' : 'related files';
    return [
      `profile=${profile}`,
      `broader related tests (${relatedFiles.length} ${fileLabel}${familyDetail})`,
      reasonDetail.slice(2),
    ]
      .filter(Boolean)
      .join('; ');
  }
  if (directTestFiles.length > 0) {
    return `profile=${profile}; direct tests (${directTestFiles.length})${reasonDetail}`;
  }
  return `profile=${profile}; skipped: no matching unit-test targets${reasonDetail}`;
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
  return {
    ...scope,
    detail: createScopeDetail(scope),
  };
}

function resolveUnavailableProductionProfile({
  matchedFamilies,
  ownerTestResolver,
  relatedFiles,
  unavailableProductionScopes,
}) {
  const proofScopes = unavailableProductionScopes.map((scope) => ({
    ...scope,
    ownerTests: ownerTestResolver(scope.file),
  }));
  if (
    proofScopes.some((scope) => scope.relatedFiles.length === 0 && scope.ownerTests.length === 0)
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
  const proofFiles = proofScopes.flatMap((scope) => [...scope.relatedFiles, ...scope.ownerTests]);
  return finalizeTestScope({
    directTestFiles: [],
    relatedFiles: [...new Set([...relatedFiles, ...proofFiles])].sort(),
    matchedFamilies,
    profile: 'related-transitive',
    profileReason: 'unavailable production targets have executable related or owner proof',
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
      matchedFamilies,
      ownerTestResolver,
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
