import { useEffect, useState } from 'react';
import { listEffectBundles } from '../../../../../composition/persistence/effect-bundles';
import { saveEffectPresetPreferences } from '../../../../../composition/persistence/effect-bundles/presets';
import type { EffectBundleCatalogEntry } from '../../../../../features/video/project/effect-bundle/catalog';
import {
  EFFECT_CATALOG_CHANGED_EVENT,
  type EffectPresetPreferences,
} from '../../../../../features/video/project/effect-bundle/catalog/presets';

export function useEffectPresetCatalog(
  documentId: string,
  sourceSha256: string,
  catalogPackId?: string
) {
  const [catalog, setCatalog] = useState<EffectBundleCatalogEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setCatalog(null);
    void listEffectBundles()
      .then((entries) => {
        const found = entries.find(
          (entry) =>
            entry.status === 'ready' &&
            (catalogPackId ? entry.packId === catalogPackId : entry.source !== 'builtin') &&
            entry.entry.documents.some(
              (doc) => doc.id === documentId && doc.sha256 === sourceSha256
            )
        );
        if (active) setCatalog(found?.status === 'ready' ? found.entry : null);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [documentId, sourceSha256, catalogPackId]);
  const entry = catalog?.documents.find((doc) => doc.id === documentId);
  const preferences = entry?.presetPreferences ?? { presets: [] };
  const save = async (next: EffectPresetPreferences) => {
    if (!catalog || busy) return;
    setBusy(true);
    setError(false);
    try {
      const updated = await saveEffectPresetPreferences(
        catalog.packId,
        documentId,
        sourceSha256,
        next,
        preferences
      );
      setCatalog(updated);
      window.dispatchEvent(new Event(EFFECT_CATALOG_CHANGED_EVENT));
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { catalog, preferences, busy, error, save };
}
