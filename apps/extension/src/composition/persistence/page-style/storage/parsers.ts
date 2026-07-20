import {
  PAGE_STYLE_ASSET_KINDS,
  PAGE_STYLE_SCOPE_TYPES,
  isPageStyleProperty,
  type PageStyleAssetKind,
  type PageStyleAssetReference,
  type PageStyleContentRetention,
  type PageStyleDeclaration,
  type PageStylePatch,
  type PageStyleProperty,
  type PageStyleRestoreRule,
  type PageStyleScope,
  type PageStyleScopeType,
  type PageStyleSelectorIdentity,
  type PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';
import {
  PAGE_STYLE_LIMITS,
  isPageStyleRestoreRuleWithinLimits,
  isPageStyleTemplateWithinLimits,
} from '@sniptale/runtime-contracts/page-style/limits';
import { isBoolean, isNumber, isRecord, isString } from '../../infrastructure/guards/primitives';

function isAssetKind(value: unknown): value is PageStyleAssetKind {
  return (
    value === PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE ||
    value === PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT
  );
}

function isScopeType(value: unknown): value is PageStyleScopeType {
  return value === PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS || value === PAGE_STYLE_SCOPE_TYPES.DOMAIN;
}

function parsePropertySummary(value: unknown, maxEntries: number): PageStyleProperty[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (value.length > maxEntries) {
    return null;
  }

  const uniqueProperties = new Set<PageStyleProperty>();
  for (const item of value) {
    if (!isPageStyleProperty(item)) {
      return null;
    }

    uniqueProperties.add(item);
  }

  return [...uniqueProperties];
}

function parseAssetReference(value: unknown): PageStyleAssetReference | null {
  if (!isRecord(value) || !isString(value['assetId']) || !isAssetKind(value['kind'])) {
    return null;
  }

  return {
    assetId: value['assetId'],
    kind: value['kind'],
    ...(isString(value['filename']) ? { filename: value['filename'] } : {}),
    ...(isNumber(value['height']) || value['height'] === null ? { height: value['height'] } : {}),
    ...(isString(value['mimeType']) ? { mimeType: value['mimeType'] } : {}),
    ...(isNumber(value['size']) ? { size: value['size'] } : {}),
    ...(isNumber(value['width']) || value['width'] === null ? { width: value['width'] } : {}),
  };
}

function parseDeclaration(value: unknown): PageStyleDeclaration | null {
  if (!isRecord(value) || !isPageStyleProperty(value['property'])) {
    return null;
  }

  if (value['value'] !== null && !isString(value['value'])) {
    return null;
  }

  return {
    property: value['property'],
    value: value['value'],
  };
}

function parsePatch(value: unknown): PageStylePatch | null {
  if (!isRecord(value) || !Array.isArray(value['declarations'])) {
    return null;
  }
  if (value['declarations'].length > PAGE_STYLE_LIMITS.maxDeclarationsPerPatch) {
    return null;
  }

  const declarations = value['declarations'].map(parseDeclaration);
  if (declarations.some((declaration) => declaration === null)) {
    return null;
  }

  const rawAssets = value['assets'];
  if (Array.isArray(rawAssets) && rawAssets.length > PAGE_STYLE_LIMITS.maxAssetsPerPatch) {
    return null;
  }
  const parsedAssets =
    rawAssets === undefined
      ? []
      : Array.isArray(rawAssets)
        ? rawAssets.map(parseAssetReference)
        : null;

  if (parsedAssets === null || parsedAssets.some((asset) => asset === null)) {
    return null;
  }

  return {
    assets: parsedAssets as PageStyleAssetReference[],
    declarations: declarations as PageStyleDeclaration[],
  };
}

function parseSelector(value: unknown): PageStyleSelectorIdentity | null {
  if (!isRecord(value) || !isString(value['locator'])) {
    return null;
  }

  return {
    locator: value['locator'],
    ...(isString(value['sniptaleId']) ? { sniptaleId: value['sniptaleId'] } : {}),
  };
}

function parseScope(value: unknown): PageStyleScope | null {
  if (!isRecord(value) || !isString(value['exactAddress'])) {
    return null;
  }

  const active =
    value['active'] === undefined
      ? PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS
      : isScopeType(value['active'])
        ? value['active']
        : null;

  if (active === null) {
    return null;
  }

  return {
    active,
    ...(isString(value['domain']) || value['domain'] === null ? { domain: value['domain'] } : {}),
    exactAddress: value['exactAddress'],
  };
}

function parseContentRetention(value: unknown): PageStyleContentRetention | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    return null;
  }

  const retention: PageStyleContentRetention = {};

  if (value['text'] !== undefined) {
    const text = value['text'];
    if (!isRecord(text) || text['enabled'] !== true || !isString(text['text'])) {
      return null;
    }

    retention.text = { enabled: true, text: text['text'] };
  }

  if (value['image'] !== undefined) {
    const image = value['image'];
    if (!isRecord(image) || image['enabled'] !== true) {
      return null;
    }

    const asset = parseAssetReference(image['asset']);
    if (!asset) {
      return null;
    }

    retention.image = { asset, enabled: true };
  }

  return Object.keys(retention).length > 0 ? retention : undefined;
}

export function parsePageStyleTemplate(value: unknown): PageStyleTemplate | null {
  if (!isRecord(value) || !isString(value['id']) || !isString(value['name'])) {
    return null;
  }

  if (!isNumber(value['createdAt']) || !isNumber(value['updatedAt'])) {
    return null;
  }

  const patch = parsePatch(value['patch']);
  const propertySummary = parsePropertySummary(
    value['propertySummary'],
    PAGE_STYLE_LIMITS.maxDeclarationsPerPatch
  );
  if (!patch || !propertySummary) {
    return null;
  }

  const template = {
    createdAt: value['createdAt'],
    id: value['id'],
    name: value['name'],
    patch,
    propertySummary,
    updatedAt: value['updatedAt'],
  };

  return isPageStyleTemplateWithinLimits(template) ? template : null;
}

export function parsePageStyleRule(value: unknown): PageStyleRestoreRule | null {
  if (!isRecord(value) || !isString(value['id']) || !isString(value['name'])) {
    return null;
  }

  if (
    !isBoolean(value['enabled']) ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt'])
  ) {
    return null;
  }

  const contentRetention = parseContentRetention(value['contentRetention']);
  const patch = parsePatch(value['patch']);
  const propertySummary = parsePropertySummary(
    value['propertySummary'],
    PAGE_STYLE_LIMITS.maxDeclarationsPerPatch
  );
  const scope = parseScope(value['scope']);
  const selector = parseSelector(value['selector']);

  if (!patch || !propertySummary || !scope || !selector || contentRetention === null) {
    return null;
  }

  const rule = {
    ...(contentRetention ? { contentRetention } : {}),
    createdAt: value['createdAt'],
    enabled: value['enabled'],
    id: value['id'],
    name: value['name'],
    patch,
    propertySummary,
    scope,
    selector,
    ...(isString(value['templateId']) || value['templateId'] === null
      ? { templateId: value['templateId'] }
      : {}),
    updatedAt: value['updatedAt'],
  };

  return isPageStyleRestoreRuleWithinLimits(rule) ? rule : null;
}
