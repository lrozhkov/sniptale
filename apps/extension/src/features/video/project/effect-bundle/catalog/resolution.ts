import type { EffectBundleCatalogEntry } from './index';
/** Materialize only the requested document and its closure. Imported catalogs are already resident. */
export async function resolveCatalogDocument(
  catalog: EffectBundleCatalogEntry,
  documentId: string
) {
  if (!catalog.materializeDocument) return catalog;
  const resolved = await catalog.materializeDocument(documentId);
  const requested = catalog.documents.find((document) => document.id === documentId);
  if (
    !requested ||
    resolved.documents.length !== 1 ||
    resolved.documents[0]?.id !== documentId ||
    resolved.documents[0]?.sha256 !== requested.sha256
  )
    throw new Error('Effect catalog changed');
  return {
    ...resolved,
    enabled: catalog.enabled,
    documents: resolved.documents.map((document) => ({
      ...document,
      ...(requested.presetPreferences ? { presetPreferences: requested.presetPreferences } : {}),
      ...(requested.previewPresetId ? { previewPresetId: requested.previewPresetId } : {}),
    })),
  };
}
