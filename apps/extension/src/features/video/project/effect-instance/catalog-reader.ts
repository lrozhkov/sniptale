import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import { verifyRuntimeAnimationSource } from '../../../../contracts/effect-runtime/animation';
import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import { resolveCatalogDocument } from '../effect-bundle/catalog/resolution';
import { failCatalogIntegrity } from './errors';

/** Catalogs contain self-contained immutable packages; no detached resource closure is decoded or copied. */
export async function readVerifiedCatalogDocument(
  catalog: EffectBundleCatalogEntry,
  documentId: string
): Promise<{
  assets: [];
  catalogDocument: EffectBundleCatalogEntry['documents'][number];
  document: AnimationTemplate;
}> {
  catalog = await resolveCatalogDocument(catalog, documentId);
  const selected = catalog.documents.find((entry) => entry.id === documentId);
  if (
    !selected ||
    selected.source === undefined ||
    selected.kind !== 'standalone' ||
    selected.schemaVersion !== 'sniptale.animation.v1' ||
    catalog.assets.length !== 0
  )
    failCatalogIntegrity();
  let retainedBytes = 0;
  const ids = new Set<string>();
  let selectedDocument: AnimationTemplate | null = null;
  for (const entry of catalog.documents) {
    if (
      ids.has(entry.id) ||
      entry.source === undefined ||
      entry.assets.length !== 0 ||
      entry.kind !== 'standalone' ||
      entry.schemaVersion !== 'sniptale.animation.v1'
    )
      failCatalogIntegrity();
    ids.add(entry.id);
    retainedBytes += new TextEncoder().encode(entry.source).byteLength;
    const document = await verifyRuntimeAnimationSource(entry.source, entry.sha256);
    if (!document || document.id !== entry.id) failCatalogIntegrity();
    if (entry.id === documentId) selectedDocument = document;
  }
  if (!selectedDocument || retainedBytes !== catalog.retainedByteLength) failCatalogIntegrity();
  return { assets: [], catalogDocument: selected, document: selectedDocument };
}
