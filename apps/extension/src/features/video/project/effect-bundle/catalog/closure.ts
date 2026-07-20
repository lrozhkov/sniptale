import type { EffectV1Asset, EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import type {
  EffectBundleCatalogAssetEntry,
  EffectBundleCatalogDocumentEntry,
  EffectBundleCatalogEntry,
} from './index';

export interface ResolvedEffectBundleCatalogAsset {
  asset: EffectBundleCatalogAssetEntry;
  declaration: EffectV1Asset;
  id: string;
  sha256: string;
}

/** Resolves the exact persisted document-to-asset closure without choosing a competing authority. */
export function resolveEffectBundleCatalogClosure(
  catalog: EffectBundleCatalogEntry,
  documents: ReadonlyMap<string, EffectV1Document>
): Map<string, ResolvedEffectBundleCatalogAsset[]> | null {
  if (catalog.documents.length !== documents.size) return null;
  const assetsByHash = new Map<string, EffectBundleCatalogAssetEntry>();
  for (const asset of catalog.assets) {
    if (assetsByHash.has(asset.sha256) || asset.blob.size !== asset.byteLength) return null;
    assetsByHash.set(asset.sha256, asset);
  }

  const resolved = new Map<string, ResolvedEffectBundleCatalogAsset[]>();
  const usedAssetHashes = new Set<string>();
  for (const catalogDocument of catalog.documents) {
    if (resolved.has(catalogDocument.id)) return null;
    const document = documents.get(catalogDocument.id);
    const documentAssets = document
      ? resolveDocumentAssets(assetsByHash, catalogDocument, document, usedAssetHashes)
      : null;
    if (!documentAssets) return null;
    resolved.set(catalogDocument.id, documentAssets);
  }
  if (usedAssetHashes.size !== assetsByHash.size) return null;
  for (const sha256 of assetsByHash.keys()) {
    if (!usedAssetHashes.has(sha256)) return null;
  }
  return resolved;
}

function resolveDocumentAssets(
  assetsByHash: ReadonlyMap<string, EffectBundleCatalogAssetEntry>,
  catalogDocument: EffectBundleCatalogDocumentEntry,
  document: EffectV1Document,
  usedAssetHashes: Set<string>
): ResolvedEffectBundleCatalogAsset[] | null {
  if (
    catalogDocument.schemaVersion !== document.schemaVersion ||
    catalogDocument.id !== document.id ||
    catalogDocument.kind !== document.kind ||
    catalogDocument.assets.length !== document.assets.length
  ) {
    return null;
  }
  const referenceIds = new Set<string>();
  const resolved: ResolvedEffectBundleCatalogAsset[] = [];
  for (let index = 0; index < document.assets.length; index += 1) {
    const declaration = document.assets[index]!;
    const reference = catalogDocument.assets[index];
    if (
      !reference ||
      referenceIds.has(reference.id) ||
      reference.id !== declaration.id ||
      typeof declaration.sha256 !== 'string' ||
      reference.sha256 !== declaration.sha256 ||
      typeof declaration.byteLength !== 'number' ||
      !Number.isSafeInteger(declaration.byteLength) ||
      declaration.byteLength <= 0
    ) {
      return null;
    }
    const asset = assetsByHash.get(reference.sha256);
    if (
      !asset ||
      asset.kind !== declaration.kind ||
      asset.mimeType !== declaration.mimeType ||
      asset.byteLength !== declaration.byteLength ||
      asset.blob.type !== asset.mimeType
    ) {
      return null;
    }
    referenceIds.add(reference.id);
    usedAssetHashes.add(reference.sha256);
    resolved.push({ asset, declaration, id: reference.id, sha256: reference.sha256 });
  }
  return resolved;
}
