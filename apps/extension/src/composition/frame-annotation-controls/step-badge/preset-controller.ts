import { useCallback, useEffect, useRef, useState } from 'react';

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

function getEnabledPresetIds(catalog: StepBadgePresetCatalog) {
  return catalog.presets.filter((preset) => preset.enabled !== false).map((preset) => preset.id);
}

export function useStepBadgePresetPopoverController(isOpen: boolean) {
  const [catalog, setCatalog] = useState<StepBadgePresetCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [sessionVisibleIds, setSessionVisibleIds] = useState<ReadonlySet<string>>(new Set());
  const [editor, setEditor] = useState<{ isOpen: boolean; preset?: StepBadgePreset }>({
    isOpen: false,
  });
  const generation = useRef(0);
  const catalogRequest = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    const current = ++generation.current;
    const request = ++catalogRequest.current;
    setEditor({ isOpen: false });
    let visibilityInitialized = false;
    const accept = (next: StepBadgePresetCatalog) => {
      if (current !== generation.current) return;
      setCatalog(next);
      setError(null);
      const enabledIds = getEnabledPresetIds(next);
      if (!visibilityInitialized) {
        visibilityInitialized = true;
        setSessionVisibleIds(new Set(enabledIds));
      } else {
        setSessionVisibleIds((current) => new Set([...current, ...enabledIds]));
      }
    };
    void loadStepBadgePresetCatalog()
      .then((next) => {
        if (request === catalogRequest.current) accept(next);
      })
      .catch(() => {
        if (current === generation.current && request === catalogRequest.current)
          setError(translate('content.stepBadge.presetLoadError'));
      });
    const unsubscribe = subscribeToStepBadgePresetCatalog((next) => {
      catalogRequest.current += 1;
      accept(next);
    });
    return () => {
      if (generation.current === current) generation.current += 1;
      catalogRequest.current += 1;
      unsubscribe();
    };
  }, [isOpen]);

  const refresh = useCallback(async () => {
    if (!isOpen) return;
    const current = generation.current;
    const request = ++catalogRequest.current;
    try {
      const next = await loadStepBadgePresetCatalog();
      if (current !== generation.current || request !== catalogRequest.current) return;
      setCatalog(next);
      setError(null);
      setSessionVisibleIds((visible) => new Set([...visible, ...getEnabledPresetIds(next)]));
    } catch {
      if (current === generation.current && request === catalogRequest.current) {
        setError(translate('content.stepBadge.presetLoadError'));
      }
    }
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

  const saveEditorPreset = async (preset: StepBadgePreset) => {
    const result = await mutate(preset.id, () =>
      updateStoredStepBadgePreset({
        id: preset.id,
        name: preset.name,
        settings: preset.settings,
      })
    );
    if (result.outcome === 'applied') setEditor({ isOpen: false });
  };

  const resetEditorPreset = async (preset: StepBadgePreset) => {
    const result = await mutate(preset.id, () => resetStoredSystemStepBadgePreset(preset.id));
    if (result.outcome === 'applied') setEditor({ isOpen: false });
  };

  return {
    catalog: {
      create: (name: string, settings: StepBadgeTemplateSettings) =>
        mutate('new', () => createUserStepBadgePreset({ name, settings })),
      error,
      pending,
      presets: catalog?.presets ?? [],
      refresh,
      reset: (preset: StepBadgePreset) =>
        mutate(preset.id, () => resetStoredSystemStepBadgePreset(preset.id)),
      toggle: (preset: StepBadgePreset) =>
        mutate(preset.id, () =>
          setStoredStepBadgePresetEnabled(preset.id, preset.enabled === false)
        ),
      update: (preset: StepBadgePreset, settings: StepBadgeTemplateSettings, name = preset.name) =>
        mutate(preset.id, () => updateStoredStepBadgePreset({ id: preset.id, name, settings })),
      value: catalog,
      visiblePresets: catalog?.presets.filter((preset) => sessionVisibleIds.has(preset.id)) ?? [],
    },
    editor: {
      ...editor,
      close: () => setEditor({ isOpen: false }),
      isSaving: editor.preset ? pending.has(editor.preset.id) : false,
      open: (preset: StepBadgePreset) => setEditor({ isOpen: true, preset }),
      reset: resetEditorPreset,
      save: saveEditorPreset,
    },
  };
}
