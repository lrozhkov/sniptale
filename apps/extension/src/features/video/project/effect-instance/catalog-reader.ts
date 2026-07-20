import {
  assertEffectV1AssetSignature,
  sha256EffectV1Bytes,
  validateEffectV1Document,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import {
  resolveEffectBundleCatalogClosure,
  type ResolvedEffectBundleCatalogAsset,
} from '../effect-bundle/catalog/closure';
import { parseBoundedEffectJson } from '../effect-bundle/json-structure';
import { failCatalogIntegrity } from './errors';

export interface VerifiedCatalogAsset extends ResolvedEffectBundleCatalogAsset {
  bytes: Uint8Array;
}

export async function readVerifiedCatalogDocument(
  catalog: EffectBundleCatalogEntry,
  documentId: string
): Promise<{
  assets: VerifiedCatalogAsset[];
  catalogDocument: EffectBundleCatalogEntry['documents'][number];
  document: EffectV1Document;
}> {
  const catalogDocument = catalog.documents.find(({ id }) => id === documentId);
  if (!catalogDocument) failCatalogIntegrity();
  const documentResult = await readCatalogDocuments(catalog);
  const closure = resolveEffectBundleCatalogClosure(catalog, documentResult.documents);
  if (!closure) failCatalogIntegrity();
  const assetResult = await readCatalogAssets(catalog);
  const document = documentResult.documents.get(documentId);
  const resolvedAssets = closure.get(documentId);
  if (
    !document ||
    !resolvedAssets ||
    documentResult.retainedByteLength + assetResult.retainedByteLength !==
      catalog.retainedByteLength
  ) {
    failCatalogIntegrity();
  }
  return {
    assets: resolvedAssets.map((resolved) => ({
      ...resolved,
      bytes: requireVerifiedBytes(assetResult.verifiedBytes, resolved.sha256),
    })),
    catalogDocument,
    document,
  };
}

async function readCatalogDocuments(catalog: EffectBundleCatalogEntry): Promise<{
  documents: Map<string, EffectV1Document>;
  retainedByteLength: number;
}> {
  const documents = new Map<string, EffectV1Document>();
  let retainedByteLength = 0;
  for (const entry of catalog.documents) {
    const sourceBytes = new TextEncoder().encode(entry.source);
    retainedByteLength += sourceBytes.byteLength;
    if ((await sha256EffectV1Bytes(sourceBytes)) !== entry.sha256) failCatalogIntegrity();
    const input = parseCatalogDocument(sourceBytes);
    const validation = validateEffectV1Document(input);
    if (!validation.ok || !validation.document || validation.document.id !== entry.id) {
      failCatalogIntegrity();
    }
    documents.set(entry.id, validation.document);
  }
  return { documents, retainedByteLength };
}

async function readCatalogAssets(catalog: EffectBundleCatalogEntry): Promise<{
  retainedByteLength: number;
  verifiedBytes: Map<string, Uint8Array>;
}> {
  const verifiedBytes = new Map<string, Uint8Array>();
  let retainedByteLength = 0;
  for (const asset of catalog.assets) {
    const bytes = new Uint8Array(await asset.blob.arrayBuffer());
    retainedByteLength += bytes.byteLength;
    try {
      if (
        bytes.byteLength !== asset.byteLength ||
        (await sha256EffectV1Bytes(bytes)) !== asset.sha256
      ) {
        failCatalogIntegrity();
      }
      assertEffectV1AssetSignature(bytes, asset.mimeType, 'catalog-apply');
    } catch {
      failCatalogIntegrity();
    }
    verifiedBytes.set(asset.sha256, bytes);
  }
  return { retainedByteLength, verifiedBytes };
}

function parseCatalogDocument(sourceBytes: Uint8Array): unknown {
  try {
    return parseBoundedEffectJson(sourceBytes);
  } catch {
    failCatalogIntegrity();
  }
}

function requireVerifiedBytes(verifiedBytes: Map<string, Uint8Array>, sha256: string): Uint8Array {
  const bytes = verifiedBytes.get(sha256);
  if (!bytes) failCatalogIntegrity();
  return bytes;
}
