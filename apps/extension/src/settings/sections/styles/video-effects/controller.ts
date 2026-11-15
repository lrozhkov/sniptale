import { getEffectBundle } from '../../../../composition/persistence/effect-bundles';
import { readVerifiedCatalogDocument } from '../../../../features/video/project/effect-instance/catalog-reader';
import { createSlotMappingDrafts } from './slot-mapping-model';
import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import { exportEffectCatalog } from '../../../../features/video/project/effect-bundle/catalog/export';
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
  const [mapping, setMapping] = useState<{
    template: AnimationTemplate;
    copyId: string;
    anchor: HTMLElement | null;
  } | null>(null);
  const mappingCommand = useRef(0);
  const lifetime = useRef<{ active: boolean; revision: number; copy: AbortController | null }>({
    active: true,
    revision: 0,
    copy: null,
  });
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
    const owner: typeof lifetime.current = { active: true, revision: 0, copy: null };
    lifetime.current = owner;
    void reload();
    window.addEventListener('focus', reload);
    window.addEventListener(EFFECT_CATALOG_CHANGED_EVENT, reload);
    return () => {
      owner.active = false;
      owner.copy?.abort();
      owner.revision++;
      window.removeEventListener('focus', reload);
      window.removeEventListener(EFFECT_CATALOG_CHANGED_EVENT, reload);
    };
  }, [reload]);
  const run = async (
    operation: () => Promise<void>,
    options: { reload?: boolean; failureMessage?: string } = {}
  ) => {
    if (pending.current || !lifetime.current.active) return false;
    const owner = lifetime.current;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
      if (options.reload !== false) await reload();
      return true;
    } catch {
      if (owner.active)
        setError(options.failureMessage ?? translate('videoEditor.effectsLibrary.updateFailed'));
      return false;
    } finally {
      pending.current = false;
      if (owner.active) setBusy(false);
    }
  };
  return {
    mapping,
    closeMapping: () => {
      if (!pending.current) {
        mappingCommand.current++;
        setMapping(null);
      }
    },
    configure: (packId: string, documentId: string, anchor: HTMLElement | null) => {
      if (pending.current || !lifetime.current.active) return Promise.resolve(false);
      const revision = ++mappingCommand.current;
      return run(
        async () => {
          const owner = lifetime.current;
          const catalog = await getEffectBundle(packId);
          if (!catalog || catalog.source === 'builtin')
            throw new Error('Animation package unavailable');
          const loaded = await readVerifiedCatalogDocument(catalog, documentId);
          createSlotMappingDrafts(loaded.document);
          if (owner.active && revision === mappingCommand.current)
            setMapping({
              template: loaded.document,
              copyId: 'prepared.' + crypto.randomUUID(),
              anchor,
            });
        },
        { reload: false }
      );
    },
    saveMapping: (template: AnimationTemplate) => {
      if (!mapping || template.id !== mapping.copyId) return Promise.resolve(false);
      return run(async () => {
        const owner = lifetime.current;
        const controller = new AbortController();
        owner.copy = controller;
        try {
          const file = new File(
            [JSON.stringify(template)],
            `${template.id}.sniptale-animation.json`,
            { type: 'application/json' }
          );
          const imported = await importEffectFiles([file], controller.signal);
          if (imported.length !== 1 || imported[0]?.status !== 'imported')
            throw new Error('Prepared animation import failed');
          if (owner.active) {
            setResults(imported);
            setMapping(null);
          }
        } finally {
          if (owner.copy === controller) owner.copy = null;
        }
      });
    },
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
    download: (packId: string) =>
      run(
        async () => {
          const owner = lifetime.current;
          const entry = entries.find((item) => item.packId === packId);
          if (!entry || entry.status !== 'ready' || entry.source === 'builtin')
            throw new Error('Animation pack unavailable.');
          const result = await exportEffectCatalog(entry.entry);
          if (!owner.active) return;
          const url = URL.createObjectURL(result.blob);
          try {
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = result.filename;
            anchor.click();
          } finally {
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        },
        {
          reload: false,
          failureMessage: translate('videoEditor.effectsLibrary.downloadPackFailed'),
        }
      ),
  };
}
