// policyStateIds: [] - page-style limit and MIME tables are immutable contract policy, not state.
import {
  PAGE_STYLE_ALLOWED_PROPERTIES,
  type PageStyleAssetReference,
  type PageStyleContentRetention,
  type PageStyleDeclaration,
  type PageStylePatch,
  type PageStyleRegistry,
  type PageStyleRestoreRule,
  type PageStyleScope,
  type PageStyleSelectorIdentity,
  type PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';

export const PAGE_STYLE_LIMITS = {
  maxAssetBytes: 5 * 1024 * 1024,
  maxAssetFilenameLength: 160,
  maxAssetIdLength: 128,
  maxAssets: 200,
  maxAssetsPerPatch: 4,
  maxCssValueLength: 500,
  maxDeclarationsPerPatch: PAGE_STYLE_ALLOWED_PROPERTIES.length,
  maxDomainLength: 253,
  maxExactAddressLength: 2_048,
  maxNameLength: 120,
  maxRecordIdLength: 128,
  maxRegistryRules: 100,
  maxRegistryTemplates: 100,
  maxRetainedTextLength: 2_000,
  maxSelectorLength: 500,
  maxTotalAssetBytes: 50 * 1024 * 1024,
} as const;

const PAGE_STYLE_ALLOWED_ASSET_MIME_TYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const allowedAssetMimeTypes = new Set<string>(PAGE_STYLE_ALLOWED_ASSET_MIME_TYPES);

function isBoundedText(value: string | null | undefined, maxLength: number): boolean {
  return value === undefined || value === null || value.length <= maxLength;
}

function isNonNegativeFinite(value: number | null | undefined): boolean {
  return value === undefined || value === null || (Number.isFinite(value) && value >= 0);
}

function isAllowedPageStyleAssetMimeType(value: string): boolean {
  return allowedAssetMimeTypes.has(value.toLowerCase());
}

function isPageStyleAssetReferenceWithinLimits(asset: PageStyleAssetReference): boolean {
  return (
    asset.assetId.length > 0 &&
    asset.assetId.length <= PAGE_STYLE_LIMITS.maxAssetIdLength &&
    isBoundedText(asset.filename, PAGE_STYLE_LIMITS.maxAssetFilenameLength) &&
    (asset.mimeType === undefined || isAllowedPageStyleAssetMimeType(asset.mimeType)) &&
    (asset.size === undefined ||
      (Number.isFinite(asset.size) &&
        asset.size >= 0 &&
        asset.size <= PAGE_STYLE_LIMITS.maxAssetBytes)) &&
    isNonNegativeFinite(asset.height) &&
    isNonNegativeFinite(asset.width)
  );
}

function isDeclarationWithinLimits(declaration: PageStyleDeclaration): boolean {
  return isBoundedText(declaration.value, PAGE_STYLE_LIMITS.maxCssValueLength);
}

function isPatchWithinLimits(patch: PageStylePatch): boolean {
  return (
    patch.declarations.length <= PAGE_STYLE_LIMITS.maxDeclarationsPerPatch &&
    patch.assets.length <= PAGE_STYLE_LIMITS.maxAssetsPerPatch &&
    patch.declarations.every(isDeclarationWithinLimits) &&
    patch.assets.every(isPageStyleAssetReferenceWithinLimits)
  );
}

function isSelectorWithinLimits(selector: PageStyleSelectorIdentity): boolean {
  return (
    selector.locator.length > 0 &&
    selector.locator.length <= PAGE_STYLE_LIMITS.maxSelectorLength &&
    isBoundedText(selector.sniptaleId, PAGE_STYLE_LIMITS.maxAssetIdLength)
  );
}

function isScopeWithinLimits(scope: PageStyleScope): boolean {
  return (
    scope.exactAddress.length > 0 &&
    scope.exactAddress.length <= PAGE_STYLE_LIMITS.maxExactAddressLength &&
    isBoundedText(scope.domain, PAGE_STYLE_LIMITS.maxDomainLength)
  );
}

function isContentRetentionWithinLimits(retention?: PageStyleContentRetention): boolean {
  if (!retention) {
    return true;
  }

  return (
    (retention.text === undefined ||
      retention.text.text.length <= PAGE_STYLE_LIMITS.maxRetainedTextLength) &&
    (retention.image === undefined || isPageStyleAssetReferenceWithinLimits(retention.image.asset))
  );
}

export function isPageStyleTemplateWithinLimits(template: PageStyleTemplate): boolean {
  return (
    template.id.length > 0 &&
    template.id.length <= PAGE_STYLE_LIMITS.maxRecordIdLength &&
    template.name.length > 0 &&
    template.name.length <= PAGE_STYLE_LIMITS.maxNameLength &&
    template.propertySummary.length <= PAGE_STYLE_LIMITS.maxDeclarationsPerPatch &&
    isPatchWithinLimits(template.patch)
  );
}

export function isPageStyleRestoreRuleWithinLimits(rule: PageStyleRestoreRule): boolean {
  return (
    rule.id.length > 0 &&
    rule.id.length <= PAGE_STYLE_LIMITS.maxRecordIdLength &&
    rule.name.length > 0 &&
    rule.name.length <= PAGE_STYLE_LIMITS.maxNameLength &&
    rule.propertySummary.length <= PAGE_STYLE_LIMITS.maxDeclarationsPerPatch &&
    isPatchWithinLimits(rule.patch) &&
    isSelectorWithinLimits(rule.selector) &&
    isScopeWithinLimits(rule.scope) &&
    isContentRetentionWithinLimits(rule.contentRetention) &&
    isBoundedText(rule.templateId, PAGE_STYLE_LIMITS.maxRecordIdLength)
  );
}

export function assertPageStyleRegistryWithinLimits(registry: PageStyleRegistry): void {
  if (
    registry.templates.length > PAGE_STYLE_LIMITS.maxRegistryTemplates ||
    registry.restoreRules.length > PAGE_STYLE_LIMITS.maxRegistryRules ||
    !registry.templates.every(isPageStyleTemplateWithinLimits) ||
    !registry.restoreRules.every(isPageStyleRestoreRuleWithinLimits)
  ) {
    throw new Error('Page style registry exceeds storage limits.');
  }
}

export function assertPageStyleAssetWithinLimits(input: {
  blob: Blob;
  filename: string;
  mimeType: string;
}): void {
  const blobType = input.blob.type.toLowerCase();
  const mimeType = input.mimeType.toLowerCase();

  if (
    input.blob.size > PAGE_STYLE_LIMITS.maxAssetBytes ||
    input.filename.length > PAGE_STYLE_LIMITS.maxAssetFilenameLength ||
    !isAllowedPageStyleAssetMimeType(mimeType) ||
    blobType.length === 0 ||
    blobType !== mimeType
  ) {
    throw new Error('Page style asset exceeds storage limits.');
  }
}
