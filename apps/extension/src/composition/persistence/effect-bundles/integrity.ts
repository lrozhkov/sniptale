import {
  assertEffectV1AssetSignature,
  sha256EffectV1Bytes,
  validateEffectV1Document,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import { resolveEffectBundleCatalogClosure } from '../../../features/video/project/effect-bundle/catalog/closure';
import { parseBoundedEffectJson } from '../../../features/video/project/effect-bundle/json-structure';
import type {
  EffectBundleCatalogAssetEntry,
  EffectBundleCatalogEntry,
} from '../../../features/video/project/effect-bundle/catalog';
import { EffectBundlePersistenceError } from './errors';

export async function assertEffectBundleCatalogIntegrity(
  entry: EffectBundleCatalogEntry
): Promise<void> {
  await inspectCatalogAssets(entry.assets);
  const validatedDocuments = new Map<string, EffectV1Document>();
  let retainedByteLength = entry.assets.reduce((total, asset) => total + asset.byteLength, 0);
  for (const document of entry.documents) {
    const bytes = new TextEncoder().encode(document.source);
    retainedByteLength += bytes.byteLength;
    if ((await sha256EffectV1Bytes(bytes)) !== document.sha256) {
      throwIntegrityFailure();
    }
    const validation = validateEffectV1Document(parseCatalogDocument(bytes));
    if (
      !validation.ok ||
      validation.document?.id !== document.id ||
      validation.document.kind !== document.kind
    ) {
      throwIntegrityFailure();
    }
    validatedDocuments.set(document.id, validation.document);
  }
  if (
    retainedByteLength !== entry.retainedByteLength ||
    !resolveEffectBundleCatalogClosure(entry, validatedDocuments)
  ) {
    throwIntegrityFailure();
  }
}

function measureEffectBundleCatalogRetainedBytes(entry: EffectBundleCatalogEntry): number {
  return (
    entry.assets.reduce((total, asset) => total + asset.blob.size, 0) +
    entry.documents.reduce(
      (total, document) => total + new TextEncoder().encode(document.source).byteLength,
      0
    )
  );
}

export function assertEffectBundleCatalogRetainedBytes(entry: EffectBundleCatalogEntry): number {
  const retainedByteLength = measureEffectBundleCatalogRetainedBytes(entry);
  if (retainedByteLength !== entry.retainedByteLength) throwIntegrityFailure();
  return retainedByteLength;
}

async function inspectCatalogAssets(
  entries: readonly EffectBundleCatalogAssetEntry[]
): Promise<void> {
  const assets = new Map<string, EffectBundleCatalogAssetEntry>();
  for (const asset of entries) {
    const bytes = new Uint8Array(await asset.blob.arrayBuffer());
    if (
      bytes.byteLength !== asset.byteLength ||
      (await sha256EffectV1Bytes(bytes)) !== asset.sha256 ||
      assets.has(asset.sha256)
    ) {
      throwIntegrityFailure();
    }
    try {
      assertEffectV1AssetSignature(bytes, asset.mimeType, 'catalog-asset');
    } catch {
      throwIntegrityFailure();
    }
    assets.set(asset.sha256, asset);
  }
}

function parseCatalogDocument(bytes: Uint8Array): unknown {
  try {
    return parseBoundedEffectJson(bytes);
  } catch {
    throwIntegrityFailure();
  }
}

function throwIntegrityFailure(): never {
  throw new EffectBundlePersistenceError('catalogIntegrityFailure');
}
