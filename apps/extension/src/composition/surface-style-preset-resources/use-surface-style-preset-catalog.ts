import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SurfaceStyle } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate, useAppLocale, type AppLocale } from '../../platform/i18n';
import {
  addSurfaceStylePreset,
  deleteSurfaceStylePreset,
  duplicateSurfaceStylePreset,
  loadSurfaceStylePresetCatalog,
  renameSurfaceStylePreset,
  reorderSurfaceStylePresets,
  resetSurfaceStylePresetCatalog,
  subscribeToSurfaceStylePresetCatalog,
  toggleSurfaceStylePresetFavorite,
  updateSurfaceStylePreset,
  type SurfaceStylePresetCatalog,
  type SurfaceStylePresetMutationOutcome,
} from '../persistence/surface-style-presets';

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `surface-${crypto.randomUUID()}`
    : `surface-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function systemName(id: string, locale: AppLocale): string {
  const suffix = id
    .replace('system-surface-', '')
    .replace(/-([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
  const keys = {
    plain: 'content.callout.surfaceStyle.system.plain',
    frostedLight: 'content.callout.surfaceStyle.system.frostedLight',
    frostedDark: 'content.callout.surfaceStyle.system.frostedDark',
    clearTint: 'content.callout.surfaceStyle.system.clearTint',
    softElevated: 'content.callout.surfaceStyle.system.softElevated',
  } as const;
  return suffix in keys ? translate(keys[suffix as keyof typeof keys], locale) : id;
}

export function useSurfaceStylePresetCatalog() {
  const locale = useAppLocale();
  const [catalog, setCatalog] = useState<SurfaceStylePresetCatalog | null>(null);
  const mounted = useRef(true);
  const publication = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const generation = ++publication.current;
    void loadSurfaceStylePresetCatalog()
      .then((next) => {
        if (mounted.current && generation === publication.current) setCatalog(next);
      })
      .catch(() => showToast(translate('content.callout.surfaceStyle.loadError'), 'error'));
    const unsubscribe = subscribeToSurfaceStylePresetCatalog((next) => {
      publication.current += 1;
      if (mounted.current) setCatalog(next);
    });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, []);

  const run = useCallback(
    async (operation: (revision: number) => Promise<SurfaceStylePresetMutationOutcome>) => {
      const revision = catalog?.catalogRevision;
      if (revision === undefined) return false;
      try {
        const result = await operation(revision);
        if (mounted.current) setCatalog(result.catalog);
        if (result.outcome === 'applied' || result.outcome === 'unchanged') return true;
        const key =
          result.outcome === 'stale-revision'
            ? 'content.callout.surfaceStyle.staleError'
            : result.outcome === 'quota'
              ? 'content.callout.surfaceStyle.quotaError'
              : result.outcome === 'unsafe-storage'
                ? 'content.callout.surfaceStyle.unsafeError'
                : 'content.callout.surfaceStyle.saveError';
        showToast(translate(key), 'error');
        return false;
      } catch {
        showToast(translate('content.callout.surfaceStyle.saveError'), 'error');
        return false;
      }
    },
    [catalog?.catalogRevision]
  );

  return useMemo(
    () => ({
      catalog,
      presets: (catalog?.presets ?? []).map((preset) => ({
        ...preset,
        name: preset.origin === 'system' ? systemName(preset.id, locale) : preset.name,
        favorite: catalog?.favoriteIds.includes(preset.id) ?? false,
      })),
      actions: {
        onCreate: (name: string, style: SurfaceStyle) =>
          run((revision) =>
            addSurfaceStylePreset(revision, { id: createId(), name, origin: 'user', style })
          ),
        onUpdate: (id: string, style: SurfaceStyle) =>
          run((revision) => updateSurfaceStylePreset(revision, id, style)),
        onRename: (id: string, name: string) =>
          run((revision) => renameSurfaceStylePreset(revision, id, name)),
        onDuplicate: (id: string, name: string) =>
          run((revision) =>
            duplicateSurfaceStylePreset(revision, id, {
              id: createId(),
              name,
              origin: 'user',
              style: catalog!.presets.find((preset) => preset.id === id)!.style,
            })
          ),
        onDelete: (id: string) => run((revision) => deleteSurfaceStylePreset(revision, id)),
        onReorder: (ids: readonly string[]) =>
          run((revision) => reorderSurfaceStylePresets(revision, ids)),
        onToggleFavorite: (id: string) =>
          run((revision) => toggleSurfaceStylePresetFavorite(revision, id)),
        onReset: () => run((revision) => resetSurfaceStylePresetCatalog(revision)),
      },
    }),
    [catalog, locale, run]
  );
}
