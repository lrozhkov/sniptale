import { EFFECT_CATALOG_CHANGED_EVENT } from '../../../../features/video/project/effect-bundle/catalog/presets';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteEffectBundle,
  listEffectBundles,
  setEffectDocumentEnabled,
} from '../../../../composition/persistence/effect-bundles';
import {
  importEffectFiles,
  type EffectFileImportResult,
} from '../../../../composition/persistence/effect-bundles/import-files';
import type { EffectBundleCatalogListItem } from '../../../../features/video/project/effect-bundle/catalog';
import { translate } from '../../../../platform/i18n';

export function useVideoEffectsSettings() {
  const [entries, setEntries] = useState<EffectBundleCatalogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<EffectFileImportResult[]>([]);
  const lifetime = useRef({ active: true, revision: 0 });
  const pending = useRef(false);
  const reload = useCallback(async () => {
    const owner = lifetime.current;
    const revision = ++owner.revision;
    try {
      const loaded = await listEffectBundles();
      if (owner.active && owner.revision === revision) {
        setEntries(loaded);
        setLoading(false);
        setError(null);
      }
    } catch {
      if (owner.active && owner.revision === revision) {
        setError(translate('videoEditor.effectsLibrary.catalogLoadFailed'));
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    const owner = { active: true, revision: 0 };
    lifetime.current = owner;
    void reload();
    window.addEventListener('focus', reload);
    window.addEventListener(EFFECT_CATALOG_CHANGED_EVENT, reload);
    return () => {
      owner.active = false;
      owner.revision++;
      window.removeEventListener('focus', reload);
      window.removeEventListener(EFFECT_CATALOG_CHANGED_EVENT, reload);
    };
  }, [reload]);
  const run = async (operation: () => Promise<void>) => {
    if (pending.current) return false;
    const owner = lifetime.current;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
      await reload();
      return true;
    } catch {
      if (owner.active) setError(translate('videoEditor.effectsLibrary.updateFailed'));
      return false;
    } finally {
      pending.current = false;
      if (owner.active) setBusy(false);
    }
  };
  return {
    entries,
    loading,
    busy,
    error,
    results,
    importFiles: (files: readonly File[]) =>
      run(async () => {
        const owner = lifetime.current;
        const imported = await importEffectFiles(files);
        if (owner.active) setResults(imported);
      }),
    toggle: (packId: string, documentId: string, enabled: boolean) =>
      run(() => setEffectDocumentEnabled(packId, documentId, enabled)),
    remove: (id: string) => run(() => deleteEffectBundle(id)),
  };
}
