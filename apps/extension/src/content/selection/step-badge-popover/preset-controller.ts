import { useEffect, useRef, useState } from 'react';
import type {
  StepBadgePreset,
  StepBadgePresetCatalog,
  StepBadgeTemplateSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { translate } from '../../../platform/i18n';
import {
  createUserStepBadgePreset,
  loadStepBadgePresetCatalog,
  resetStoredSystemStepBadgePreset,
  setStoredStepBadgePresetEnabled,
  subscribeToStepBadgePresetCatalog,
  updateStoredStepBadgePreset,
} from '../../../composition/persistence/step-badge-presets';

export function useStepBadgePresetPopoverController(isOpen: boolean) {
  const [catalog, setCatalog] = useState<StepBadgePresetCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [sessionVisibleIds, setSessionVisibleIds] = useState<ReadonlySet<string>>(new Set());
  const generation = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    const current = ++generation.current;
    let visibilityInitialized = false;
    const accept = (next: StepBadgePresetCatalog) => {
      if (current !== generation.current) return;
      setCatalog(next);
      setError(null);
      if (!visibilityInitialized) {
        visibilityInitialized = true;
        setSessionVisibleIds(
          new Set(
            next.presets.filter((preset) => preset.enabled !== false).map((preset) => preset.id)
          )
        );
      }
    };
    void loadStepBadgePresetCatalog()
      .then(accept)
      .catch(() => {
        if (current === generation.current)
          setError(translate('content.stepBadge.presetLoadError'));
      });
    const unsubscribe = subscribeToStepBadgePresetCatalog(accept);
    return () => {
      if (generation.current === current) generation.current += 1;
      unsubscribe();
    };
  }, [isOpen]);

  const mutate = async (id: string, task: () => Promise<{ outcome: string }>) => {
    const current = generation.current;
    setPending((value) => new Set(value).add(id));
    try {
      const result = await task();
      if (current === generation.current && result.outcome !== 'applied') {
        setError(translate('highlighter.stepBadgePresets.messages.saveError'));
      }
      return result;
    } catch {
      if (current === generation.current)
        setError(translate('highlighter.stepBadgePresets.messages.saveError'));
      return { outcome: 'rejected' };
    } finally {
      if (current === generation.current) {
        setPending((value) => {
          const next = new Set(value);
          next.delete(id);
          return next;
        });
      }
    }
  };

  return {
    catalog,
    error,
    pending,
    presets: catalog?.presets ?? [],
    visiblePresets: catalog?.presets.filter((preset) => sessionVisibleIds.has(preset.id)) ?? [],
    create: (name: string, settings: StepBadgeTemplateSettings) =>
      mutate('new', () => createUserStepBadgePreset({ name, settings })),
    update: (preset: StepBadgePreset, settings: StepBadgeTemplateSettings, name = preset.name) =>
      mutate(preset.id, () => updateStoredStepBadgePreset({ id: preset.id, name, settings })),
    reset: (preset: StepBadgePreset) =>
      mutate(preset.id, () => resetStoredSystemStepBadgePreset(preset.id)),
    toggle: (preset: StepBadgePreset) =>
      mutate(preset.id, () => setStoredStepBadgePresetEnabled(preset.id, preset.enabled === false)),
  };
}
