import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CalloutPreset,
  CalloutPresetCatalog,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { translate } from '../../../platform/i18n';
import {
  loadCalloutPresetCatalog,
  subscribeToCalloutPresetCatalog,
} from '../../../composition/persistence/callout-presets';
import { useCalloutPresetPopoverMutations } from './preset-mutations';

export function useCalloutPresetPopoverController(isOpen: boolean) {
  const [catalog, setCatalog] = useState<CalloutPresetCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPresetIds, setPendingPresetIds] = useState<ReadonlySet<string>>(new Set());
  const [sessionVisiblePresetIds, setSessionVisiblePresetIds] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [editor, setEditor] = useState<{ isOpen: boolean; preset?: CalloutPreset }>({
    isOpen: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const catalogRequestRef = useRef(0);
  const sessionGenerationRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    const sessionId = sessionGenerationRef.current + 1;
    sessionGenerationRef.current = sessionId;
    const requestId = catalogRequestRef.current + 1;
    catalogRequestRef.current = requestId;
    setEditor({ isOpen: false });
    setSessionVisiblePresetIds(new Set());
    let sessionVisibilityInitialized = false;
    const acceptCatalog = (nextCatalog: CalloutPresetCatalog) => {
      setCatalog(nextCatalog);
      setError(null);
      const enabledIds = nextCatalog.presets
        .filter((preset) => preset.enabled !== false)
        .map((preset) => preset.id);
      if (!sessionVisibilityInitialized) {
        sessionVisibilityInitialized = true;
        setSessionVisiblePresetIds(new Set(enabledIds));
      } else {
        setSessionVisiblePresetIds((current) => new Set([...current, ...enabledIds]));
      }
    };
    void loadCalloutPresetCatalog()
      .then((nextCatalog) => {
        if (sessionId === sessionGenerationRef.current && requestId === catalogRequestRef.current) {
          acceptCatalog(nextCatalog);
        }
      })
      .catch(() => {
        if (sessionId === sessionGenerationRef.current && requestId === catalogRequestRef.current) {
          setError(translate('content.callout.presetLoadError'));
        }
      });
    const unsubscribe = subscribeToCalloutPresetCatalog((nextCatalog) => {
      if (sessionId !== sessionGenerationRef.current) return;
      catalogRequestRef.current += 1;
      acceptCatalog(nextCatalog);
    });
    return () => {
      if (sessionId === sessionGenerationRef.current) sessionGenerationRef.current += 1;
      catalogRequestRef.current += 1;
      unsubscribe();
    };
  }, [isOpen]);

  const refresh = useCallback(async () => {
    if (!isOpen) return;
    const sessionId = sessionGenerationRef.current;
    const requestId = catalogRequestRef.current + 1;
    catalogRequestRef.current = requestId;
    try {
      const nextCatalog = await loadCalloutPresetCatalog();
      if (sessionId !== sessionGenerationRef.current || requestId !== catalogRequestRef.current)
        return;
      setCatalog(nextCatalog);
      setError(null);
      setSessionVisiblePresetIds(
        (current) =>
          new Set([
            ...current,
            ...nextCatalog.presets
              .filter((preset) => preset.enabled !== false)
              .map((preset) => preset.id),
          ])
      );
    } catch {
      if (sessionId === sessionGenerationRef.current && requestId === catalogRequestRef.current) {
        setError(translate('content.callout.presetLoadError'));
      }
    }
  }, [isOpen]);

  const mutations = useCalloutPresetPopoverMutations({
    sessionGenerationRef,
    setEditor,
    setError,
    setIsSaving,
    setPendingPresetIds,
  });

  const visiblePresets =
    catalog?.presets.filter((preset) => sessionVisiblePresetIds.has(preset.id)) ?? [];

  return {
    catalog: {
      create: mutations.create,
      error,
      isSaving,
      overwrite: mutations.overwrite,
      pendingPresetIds,
      presets: catalog?.presets ?? [],
      refresh,
      toggle: mutations.toggle,
      value: catalog,
      visiblePresets,
    },
    editor: {
      ...editor,
      close: () => setEditor({ isOpen: false }),
      isSaving,
      open: (preset: CalloutPreset) => setEditor({ isOpen: true, preset }),
      reset: mutations.reset,
      save: mutations.save,
    },
  };
}
