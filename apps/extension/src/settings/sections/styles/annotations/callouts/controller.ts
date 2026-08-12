import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CalloutPreset,
  CalloutPresetCatalog,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../../platform/i18n';
import {
  createUserCalloutPreset,
  deleteCalloutPreset,
  loadCalloutPresetCatalog,
  resetSystemCalloutPreset,
  setCalloutPresetEnabled,
  setDefaultCalloutPreset,
  subscribeToCalloutPresetCatalog,
  updateCalloutPreset,
  updateCalloutSessionDefaults,
  updateCalloutPresetsOrder,
} from '../../../../../composition/persistence/callout-presets';
import type { CalloutPresetCatalogController } from './types';

const logger = createLogger({ namespace: 'SettingsCalloutPresets' });

function reorderPresetsBefore(
  presets: readonly CalloutPreset[],
  sourceId: string,
  beforeId: string | null
) {
  const next = presets.filter((preset) => preset.id !== sourceId);
  const moved = presets.find((preset) => preset.id === sourceId);
  if (!moved) return presets;
  const target =
    beforeId === null ? next.length : next.findIndex((preset) => preset.id === beforeId);
  if (target < 0) return presets;
  next.splice(target, 0, moved);
  return next;
}

type ControllerActions = CalloutPresetCatalogController['actions'];

function createCatalogActions(args: {
  catalog: CalloutPresetCatalog | null;
  mutate: (operation: () => Promise<{ outcome: string }>) => Promise<boolean>;
  setEditor: (state: CalloutPresetCatalogController['editor']) => void;
}): ControllerActions {
  return {
    add: () => args.setEditor({ isOpen: true }),
    closeEditor: () => args.setEditor({ isOpen: false }),
    delete: async (preset) => {
      if (preset.origin === 'system') return;
      await args.mutate(() => deleteCalloutPreset(preset.id));
    },
    edit: (preset) => args.setEditor({ isOpen: true, preset }),
    moveBefore: async (id, beforeId) => {
      if (!args.catalog) return;
      const ordered = reorderPresetsBefore(args.catalog.presets, id, beforeId);
      await args.mutate(() => updateCalloutPresetsOrder(ordered.map((preset) => preset.id)));
    },
    reset: async (id) => {
      await args.mutate(() => resetSystemCalloutPreset(id));
    },
    save: async (preset) => {
      const exists = args.catalog?.presets.some((item) => item.id === preset.id) ?? false;
      const saved = await args.mutate(() =>
        exists
          ? updateCalloutPreset({
              content: preset.content,
              id: preset.id,
              name: preset.name,
              placement: preset.placement,
              style: preset.style,
              tagIds: preset.tagIds,
            })
          : createUserCalloutPreset({
              content: preset.content,
              name: preset.name,
              placement: preset.placement,
              style: preset.style,
              tagIds: preset.tagIds,
            })
      );
      if (saved) args.setEditor({ isOpen: false });
    },
    setNewSessionEnabled: async (enabled) => {
      await args.mutate(() =>
        updateCalloutSessionDefaults({
          enabled,
          templateSource: args.catalog?.newSessionDefaults?.templateSource ?? 'frame-default',
        })
      );
    },
    setNewSessionTemplateSource: async (templateSource) => {
      await args.mutate(() =>
        updateCalloutSessionDefaults({
          enabled: args.catalog?.newSessionDefaults?.enabled ?? false,
          templateSource,
        })
      );
    },
    setDefault: async (id) => {
      await args.mutate(() => setDefaultCalloutPreset(id));
    },
    toggle: async (id) => {
      const preset = args.catalog?.presets.find((item) => item.id === id);
      if (!preset) return;
      await args.mutate(() => setCalloutPresetEnabled(id, preset.enabled === false));
    },
  };
}

export function useCalloutPresetCatalogController(): CalloutPresetCatalogController {
  const [catalog, setCatalog] = useState<CalloutPresetCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editor, setEditor] = useState<CalloutPresetCatalogController['editor']>({ isOpen: false });
  const latestRequestRef = useRef(0);
  const mutationQueueRef = useRef(Promise.resolve());

  const refresh = useCallback(async (reportError: boolean) => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    try {
      const next = await loadCalloutPresetCatalog();
      if (requestId !== latestRequestRef.current) return;
      setCatalog(next);
      setError(false);
    } catch (caught) {
      if (requestId !== latestRequestRef.current) return;
      logger.error('Failed to load callout presets', caught);
      setError(true);
      if (reportError) toast.error(translate('highlighter.calloutPresets.messages.loadError'));
    } finally {
      if (requestId === latestRequestRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refresh(true);
    const unsubscribe = subscribeToCalloutPresetCatalog((next) => {
      if (cancelled) return;
      latestRequestRef.current += 1;
      setCatalog(next);
      setError(false);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
      latestRequestRef.current += 1;
      unsubscribe();
    };
  }, [refresh]);

  const mutate = useCallback(
    async (operation: () => Promise<{ outcome: string }>) => {
      let accepted = false;
      const run = async () => {
        setIsSaving(true);
        try {
          const result = await operation();
          if (result.outcome === 'rejected') {
            toast.error(translate('highlighter.calloutPresets.messages.saveError'));
            return;
          }
          accepted = true;
          if (result.outcome === 'applied') {
            await refresh(false);
          }
        } catch (caught) {
          logger.error('Failed to mutate callout presets', caught);
          toast.error(translate('highlighter.calloutPresets.messages.saveError'));
        } finally {
          setIsSaving(false);
        }
      };
      const queued = mutationQueueRef.current.catch(() => undefined).then(run);
      mutationQueueRef.current = queued.then(
        () => undefined,
        () => undefined
      );
      await queued;
      return accepted;
    },
    [refresh]
  );

  const actions = createCatalogActions({ catalog, mutate, setEditor });

  return {
    catalog,
    editor,
    error,
    isLoading,
    isSaving,
    actions,
  };
}
