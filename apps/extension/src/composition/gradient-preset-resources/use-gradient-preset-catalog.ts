import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import type { Gradient } from '@sniptale/foundation/paint';
import { getGradientPresetDisplayName } from '../../features/highlighter/gradient-presets/display-name';
import { translate, useAppLocale } from '../../platform/i18n';
import {
  addGradientPreset,
  deleteGradientPreset,
  loadGradientPresetCatalog,
  subscribeToGradientPresetCatalog,
  toggleGradientPresetFavoriteForSurface,
  toggleGradientPresetEnabled,
  setDefaultGradientPresetForSurface,
  resetGradientPreset,
  reorderGradientPresetCatalog,
  updateGradientPreset,
  type GradientPresetCatalog,
  type GradientPresetMutationOutcome,
  type GradientPresetSurface,
} from '../persistence/gradient-presets';

const createPresetId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `gradient-${crypto.randomUUID()}`
    : `gradient-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useGradientPresetCatalog(surface: GradientPresetSurface) {
  const locale = useAppLocale();
  const [catalog, setCatalog] = useState<GradientPresetCatalog | null>(null);
  const activeRef = useRef(true);
  const publicationGenerationRef = useRef(0);
  useEffect(() => {
    activeRef.current = true;
    const generation = ++publicationGenerationRef.current;
    void loadGradientPresetCatalog()
      .then((next) => {
        if (activeRef.current && generation === publicationGenerationRef.current) setCatalog(next);
      })
      .catch(() => {
        if (activeRef.current) showToast(translate('highlighter.paintPicker.loadError'), 'error');
      });
    const unsubscribe = subscribeToGradientPresetCatalog((next) => {
      publicationGenerationRef.current += 1;
      if (activeRef.current) setCatalog(next);
    });
    return () => {
      activeRef.current = false;
      unsubscribe();
    };
  }, []);
  const run = useCallback(
    async (operation: () => Promise<GradientPresetMutationOutcome>): Promise<boolean> => {
      try {
        const outcome = await operation();
        if (outcome === 'rejected') {
          showToast(translate('highlighter.paintPicker.saveError'), 'error');
          return false;
        }
        const generation = ++publicationGenerationRef.current;
        const next = await loadGradientPresetCatalog();
        if (activeRef.current && generation === publicationGenerationRef.current) setCatalog(next);
        return true;
      } catch {
        showToast(translate('highlighter.paintPicker.saveError'), 'error');
        return false;
      }
    },
    []
  );
  return useMemo(
    () => ({
      presets: (catalog?.presets ?? []).map((preset) => ({
        ...preset,
        name: getGradientPresetDisplayName(preset, locale),
        favorite: catalog?.favoriteIdsBySurface[surface]?.includes(preset.id) ?? false,
        isDefault: catalog?.defaultPresetIdBySurface[surface] === preset.id,
      })),
      actions: {
        onSave: (name: string, gradient: Gradient) =>
          run(() =>
            addGradientPreset({
              customized: false,
              enabled: true,
              id: createPresetId(),
              name,
              order: catalog?.presets.length ?? 0,
              origin: 'user',
              gradient,
            })
          ),
        onUpdate: (id: string, gradient: Gradient) => run(() => updateGradientPreset(id, gradient)),
        onEdit: (id: string, name: string, gradient: Gradient) =>
          run(() => updateGradientPreset(id, gradient, name)),
        onDelete: (id: string) => run(() => deleteGradientPreset(id)),
        onToggleFavorite: (id: string) =>
          run(() => toggleGradientPresetFavoriteForSurface(surface, id)),
        onToggleEnabled: (id: string) => run(() => toggleGradientPresetEnabled(id)),
        onSetDefault: (id: string) => run(() => setDefaultGradientPresetForSurface(surface, id)),
        onResetPreset: (id: string) => run(() => resetGradientPreset(id)),
        onReorder: (ids: readonly string[]) => run(() => reorderGradientPresetCatalog(ids)),
        onRename: (id: string, name: string) => {
          const preset = catalog?.presets.find((item) => item.id === id);
          return preset
            ? run(() => updateGradientPreset(id, preset.gradient, name))
            : Promise.resolve(false);
        },
      },
    }),
    [catalog, locale, run, surface]
  );
}
