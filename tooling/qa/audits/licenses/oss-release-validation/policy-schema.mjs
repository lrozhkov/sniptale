function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateLegalAndAssetEntries(policy) {
  const errors = [];
  if (
    policy.legalFiles.some(
      (entry) =>
        !isNonEmptyString(entry?.source) ||
        !isNonEmptyString(entry?.archivePath) ||
        !/^[a-f0-9]{64}$/u.test(entry?.sha256 ?? '')
    )
  ) {
    errors.push('OSS release legal file declaration is invalid');
  }
  if (
    policy.bundledAssets.some(
      (asset) =>
        !isNonEmptyString(asset?.id) ||
        !Array.isArray(asset?.artifacts) ||
        asset.artifacts.some(
          (entry) =>
            !isNonEmptyString(entry?.path) ||
            !isNonEmptyString(entry?.sourcePath) ||
            !/^[a-f0-9]{64}$/u.test(entry?.sha256 ?? '')
        )
    )
  ) {
    errors.push('OSS release bundled asset declaration is invalid');
  }
  return errors;
}

function pinnedSourceIsInvalid(source) {
  return (
    !isNonEmptyString(source?.packageName) ||
    !isNonEmptyString(source?.packageVersion) ||
    !isNonEmptyString(source?.packageResolved) ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(source?.packageIntegrity ?? '') ||
    !isNonEmptyString(source?.upstreamVersion) ||
    !isNonEmptyString(source?.upstreamAuthorName) ||
    !isNonEmptyString(source?.upstreamAuthorUrl) ||
    !isNonEmptyString(source?.upstreamLicenseMetadataUrl) ||
    !isNonEmptyString(source?.license) ||
    !/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/v[^/]+\/LICENSE$/u.test(
      source?.originUrl ?? ''
    ) ||
    !source?.sourcePath?.startsWith('tooling/release/dependency-legal/sources/') ||
    !/^[a-f0-9]{64}$/u.test(source?.sha256 ?? '')
  );
}

function validateDependencyEntries(policy) {
  const errors = [];
  const aliases = policy.dependencyLegal.canonicalLicenseAliases;
  const aliasIdentities = aliases.map((alias) => `${alias?.packageName}@${alias?.version}`);
  const aliasPaths = aliases.map((alias) => alias?.archivePath);
  if (
    aliases.some(
      (alias) =>
        !isNonEmptyString(alias?.packageName) ||
        !isNonEmptyString(alias?.version) ||
        !isNonEmptyString(alias?.archivePath) ||
        alias.archivePath.startsWith('LICENSES/dependencies/') ||
        !/^[a-f0-9]{64}$/u.test(alias?.sha256 ?? '')
    ) ||
    new Set(aliasIdentities).size !== aliasIdentities.length ||
    new Set(aliasPaths).size !== aliasPaths.length
  ) {
    errors.push('OSS release canonical dependency license alias is invalid');
  }
  if (policy.dependencyLegal.pinnedSources.some(pinnedSourceIsInvalid)) {
    errors.push('OSS release pinned dependency license source is invalid');
  }
  if (
    policy.dependencyLegal.reviewedSelections.some(
      (selection) =>
        !isNonEmptyString(selection?.packageName) ||
        !isNonEmptyString(selection?.version) ||
        !isNonEmptyString(selection?.selectedLicense)
    )
  ) {
    errors.push('OSS release reviewed dependency license selection is invalid');
  }
  return errors;
}

export { isNonEmptyString };

export function validatePolicyEntries(policy) {
  const errors = validateLegalAndAssetEntries(policy);
  for (const key of [
    'workspacePackages',
    'contributorFiles',
    'releaseDocs',
    'forbiddenReleaseDocFragments',
  ]) {
    if (policy[key].some((entry) => !isNonEmptyString(entry))) {
      errors.push(`OSS release policy ${key} contains an invalid path or fragment`);
    }
  }
  return [...errors, ...validateDependencyEntries(policy)];
}
