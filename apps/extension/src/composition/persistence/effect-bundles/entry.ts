import { EFFECT_BUNDLE_LIMITS } from '../../../features/video/project/effect-bundle';
import type {
  EffectBundleCatalogAssetEntry,
  EffectBundleCatalogDocumentEntry,
  EffectBundleCatalogEntry,
} from '../../../features/video/project/effect-bundle/catalog';

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function parseEffectBundleCatalogEntry(value: unknown): EffectBundleCatalogEntry | null {
  if (
    !isRecord(value) ||
    !isIdentifier(value['packId']) ||
    typeof value['version'] !== 'string' ||
    value['version'].length > 128 ||
    (value['source'] !== 'bundle-zip' && value['source'] !== 'raw-json') ||
    !isSha256(value['sourceSha256']) ||
    typeof value['enabled'] !== 'boolean' ||
    !isTimestamp(value['createdAt']) ||
    !isTimestamp(value['updatedAt']) ||
    !isLocalizedText(value['label']) ||
    !isLocalizedText(value['description']) ||
    !Array.isArray(value['documents']) ||
    value['documents'].length === 0 ||
    value['documents'].length > EFFECT_BUNDLE_LIMITS.maxDocuments ||
    !Array.isArray(value['assets']) ||
    value['assets'].length > EFFECT_BUNDLE_LIMITS.maxAssets
  ) {
    return null;
  }
  const documents = value['documents'].map(parseDocumentEntry);
  const assets = value['assets'].map(parseAssetEntry);
  if (documents.some((entry) => !entry) || assets.some((entry) => !entry)) return null;
  const retainedByteLength = value['retainedByteLength'];
  if (
    typeof retainedByteLength !== 'number' ||
    !Number.isSafeInteger(retainedByteLength) ||
    retainedByteLength < 1 ||
    retainedByteLength > EFFECT_BUNDLE_LIMITS.maxInflatedBytes
  ) {
    return null;
  }
  return {
    assets: assets as EffectBundleCatalogAssetEntry[],
    createdAt: value['createdAt'],
    description: value['description'],
    documents: documents as EffectBundleCatalogDocumentEntry[],
    enabled: value['enabled'],
    label: value['label'],
    packId: value['packId'],
    retainedByteLength,
    source: value['source'],
    sourceSha256: value['sourceSha256'],
    updatedAt: value['updatedAt'],
    version: value['version'],
  };
}

function parseDocumentEntry(value: unknown): EffectBundleCatalogDocumentEntry | null {
  if (
    !isRecord(value) ||
    !isIdentifier(value['id']) ||
    (value['kind'] !== 'standalone' &&
      value['kind'] !== 'targetEffect' &&
      value['kind'] !== 'transition') ||
    value['schemaVersion'] !== 'sniptale.effect.v1' ||
    !isSha256(value['sha256']) ||
    typeof value['source'] !== 'string' ||
    new TextEncoder().encode(value['source']).byteLength > EFFECT_BUNDLE_LIMITS.maxJsonBytes ||
    !Array.isArray(value['assets']) ||
    value['assets'].length > EFFECT_BUNDLE_LIMITS.maxAssets
  ) {
    return null;
  }
  const references = value['assets'].map((asset) => {
    return isRecord(asset) && isIdentifier(asset['id']) && isSha256(asset['sha256'])
      ? { id: asset['id'], sha256: asset['sha256'] }
      : null;
  });
  return references.some((entry) => !entry)
    ? null
    : {
        assets: references as Array<{ id: string; sha256: string }>,
        id: value['id'],
        kind: value['kind'],
        schemaVersion: 'sniptale.effect.v1',
        sha256: value['sha256'],
        source: value['source'],
      };
}

function parseAssetEntry(value: unknown): EffectBundleCatalogAssetEntry | null {
  return isRecord(value) &&
    value['blob'] instanceof Blob &&
    typeof value['byteLength'] === 'number' &&
    Number.isSafeInteger(value['byteLength']) &&
    Number(value['byteLength']) === value['blob'].size &&
    Number(value['byteLength']) > 0 &&
    Number(value['byteLength']) <= EFFECT_BUNDLE_LIMITS.maxEntryBytes &&
    (value['kind'] === 'audio' || value['kind'] === 'image' || value['kind'] === 'svg') &&
    typeof value['mimeType'] === 'string' &&
    value['mimeType'].length <= 128 &&
    isSha256(value['sha256'])
    ? {
        blob: value['blob'],
        byteLength: value['byteLength'],
        kind: value['kind'],
        mimeType: value['mimeType'],
        sha256: value['sha256'],
      }
    : null;
}

function isLocalizedText(value: unknown): value is { en: string; ru: string } {
  return isRecord(value) && isBoundedText(value['en'], 4096) && isBoundedText(value['ru'], 4096);
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
