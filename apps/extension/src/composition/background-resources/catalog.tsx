import { retainBackgroundInLibrary, type AcquiredBackground } from './acquisition';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { browserStorage } from '../persistence/infrastructure/browser-storage';
import { runWithPersistenceDomainMutationLock } from '../persistence/infrastructure/mutation-barrier';
import {
  createBackgroundPresetCatalog,
  type BackgroundCatalogEdit,
  type BackgroundPreset,
} from '../persistence/background-presets/catalog';
import { BUNDLED_BACKGROUNDS } from '../persistence/background-presets/bundled';
import { useAppLocale } from '../../platform/i18n';
import { subscribeToMediaHubEvents } from '../../features/media-hub/events';
import { listMediaLibrary } from '../persistence/media-library';

/** Subscribed view of the sole catalog authority; no optimistic or fallback persistence. */
export function useBackgroundCatalog() {
  const store = useMemo(
    () =>
      createBackgroundPresetCatalog({
        storage: browserStorage,
        mutate: runWithPersistenceDomainMutationLock,
      }),
    []
  );
  const locale = useAppLocale();
  const [presets, setPresets] = useState<BackgroundPreset[]>([]);
  const [available, setAvailable] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    try {
      const [catalog, media] = await Promise.all([store.load(), listMediaLibrary()]);
      if (current !== generation.current) return;
      setPresets(catalog.presets);
      setAvailable(
        new Set(
          media
            .filter(
              (item) =>
                ['image', 'screenshot'].includes(item.kind) &&
                item.lifecycle?.trashedAt === undefined
            )
            .map((item) => item.id)
        )
      );
      setStatus('ready');
    } catch {
      if (current === generation.current) setStatus('failed');
    }
  }, [store]);
  useEffect(() => {
    const lifecycle = generation;
    void reload();
    const off = store.subscribe(() => void reload());
    const mediaOff = subscribeToMediaHubEvents((event) => {
      if (event.type === 'library-changed') void reload();
    });
    return () => {
      ++lifecycle.current;
      off();
      mediaOff();
    };
  }, [store, reload]);
  const edit = async (value: BackgroundCatalogEdit) => {
    await store.edit(value);
    await reload();
  };
  return {
    status,
    reload,
    edit,
    add: async (image: AcquiredBackground, name?: string) => {
      const mediaId = await retainBackgroundInLibrary(image);
      await edit({
        type: 'add',
        mediaId,
        name:
          (name?.trim() || image.file.name.replace(/\.[^.]+$/, '')).slice(0, 120) || 'Background',
      });
    },
    presets: presets.map((preset) => {
      const bundled = BUNDLED_BACKGROUNDS.find((item) => item.id === preset.id);
      return {
        ...preset,
        name: bundled ? bundled[locale] : preset.name!,
        bundled: Boolean(bundled),
        available: Boolean(bundled) || Boolean(preset.mediaId && available.has(preset.mediaId)),
        url: bundled ? new URL(bundled.path, window.location.origin + '/').href : undefined,
      };
    }),
  };
}
