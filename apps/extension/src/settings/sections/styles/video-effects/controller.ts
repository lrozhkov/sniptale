import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteEffectBundle,
  getEffectBundle,
  listEffectBundles,
  setEffectBundleEnabled,
} from '../../../../composition/persistence/effect-bundles';
import {
  importEffectFiles,
  type EffectFileImportResult,
} from '../../../../composition/persistence/effect-bundles/import-files';
import { exportEffectCatalog } from '../../../../features/video/project/effect-bundle/catalog/export';
import type { EffectBundleCatalogListItem } from '../../../../features/video/project/effect-bundle/catalog';
import { translate } from '../../../../platform/i18n';

export function useVideoEffectsSettings() {
  const [entries, setEntries] = useState<EffectBundleCatalogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<EffectFileImportResult[]>([]);
  const lifetime = useRef({ active: true, revision: 0, url: null as string | null });
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
    const owner = { active: true, revision: 0, url: null as string | null };
    lifetime.current = owner;
    void reload();
    window.addEventListener('focus', reload);
    return () => {
      owner.active = false;
      owner.revision++;
      window.removeEventListener('focus', reload);
      if (owner.url) URL.revokeObjectURL(owner.url);
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
    toggle: (id: string, enabled: boolean) => run(() => setEffectBundleEnabled(id, enabled)),
    remove: (id: string) => run(() => deleteEffectBundle(id)),
    exportEntry: (id: string) =>
      run(async () => {
        const owner = lifetime.current;
        const catalog = await getEffectBundle(id);
        if (!catalog) throw new Error('Missing catalog entry');
        const artifact = await exportEffectCatalog(catalog);
        if (!owner.active) return;
        if (owner.url) URL.revokeObjectURL(owner.url);
        owner.url = URL.createObjectURL(artifact.blob);
        const link = document.createElement('a');
        link.href = owner.url;
        link.download = artifact.filename;
        link.click();
      }),
  };
}
