import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CalloutPreset,
  CalloutPresetCatalog,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../platform/i18n';
import {
  createUserCalloutPreset,
  deleteCalloutPreset,
  loadCalloutPresetCatalog,
  resetSystemCalloutPreset,
  setCalloutPresetEnabled,
  setDefaultCalloutPreset,
  subscribeToCalloutPresetCatalog,
  updateCalloutPreset,
  updateCalloutPresetsOrder,
} from '../../../../composition/persistence/callout-presets';
import type { CalloutPresetCatalogController } from './types';

const logger = createLogger({ namespace: 'SettingsCalloutPresets' });

function reorderPresets(presets: CalloutPreset[], sourceId: string, targetId: string) {
  const sourceIndex = presets.findIndex((item) => item.id === sourceId);
  const targetIndex = presets.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return presets;
  const next = [...presets];
  const [moved] = next.splice(sourceIndex, 1);
  if (!moved) return presets;
  next.splice(targetIndex, 0, moved);
  return next;
}

type ControllerActions = CalloutPresetCatalogController['actions'];

function createDragActions(args: {
  catalog: CalloutPresetCatalog | null;
  draggedId: string | null;
  mutate: (operation: () => Promise<{ outcome: string }>) => Promise<boolean>;
  setDraggedId: (id: string | null) => void;
  setDragOverId: (id: string | null) => void;
}): Pick<ControllerActions, 'dragEnd' | 'dragLeave' | 'dragOver' | 'dragStart' | 'drop'> {
  const reset = () => {
    args.setDraggedId(null);
    args.setDragOverId(null);
  };
  return {
    dragEnd: reset,
    dragLeave: () => args.setDragOverId(null),
    dragOver: (event, id) => {
      event.preventDefault();
      if (args.draggedId && args.draggedId !== id) args.setDragOverId(id);
    },
    dragStart: (event, id) => {
      event.dataTransfer.effectAllowed = 'move';
      args.setDraggedId(id);
    },
    drop: async (event, id) => {
      event.preventDefault();
      if (args.catalog && args.draggedId && args.draggedId !== id) {
        const ordered = reorderPresets(args.catalog.presets, args.draggedId, id);
        await args.mutate(() => updateCalloutPresetsOrder(ordered.map((preset) => preset.id)));
      }
      reset();
    },
  };
}

function createCatalogActions(args: {
  catalog: CalloutPresetCatalog | null;
  mutate: (
    operation: () => Promise<{ outcome: string }>,
    successKey?: Parameters<typeof translate>[0]
  ) => Promise<boolean>;
  setEditor: (state: CalloutPresetCatalogController['editor']) => void;
  setHoveredId: (id: string | null) => void;
}): Omit<ControllerActions, 'dragEnd' | 'dragLeave' | 'dragOver' | 'dragStart' | 'drop'> {
  return {
    add: () => args.setEditor({ isOpen: true }),
    closeEditor: () => args.setEditor({ isOpen: false }),
    delete: async (preset) => {
      if (preset.origin === 'system') return;
      await args.mutate(
        () => deleteCalloutPreset(preset.id),
        'highlighter.calloutPresets.messages.deleted'
      );
    },
    edit: (preset) => args.setEditor({ isOpen: true, preset }),
    hover: args.setHoveredId,
    reset: async (id) => {
      await args.mutate(
        () => resetSystemCalloutPreset(id),
        'highlighter.calloutPresets.messages.reset'
      );
    },
    save: async (preset) => {
      const exists = args.catalog?.presets.some((item) => item.id === preset.id) ?? false;
      const saved = await args.mutate(
        () =>
          exists
            ? updateCalloutPreset({
                id: preset.id,
                name: preset.name,
                placement: preset.placement,
                style: preset.style,
              })
            : createUserCalloutPreset({
                name: preset.name,
                placement: preset.placement,
                style: preset.style,
              }),
        exists
          ? 'highlighter.calloutPresets.messages.updated'
          : 'highlighter.calloutPresets.messages.created'
      );
      if (saved) args.setEditor({ isOpen: false });
    },
    setDefault: async (id) => {
      await args.mutate(
        () => setDefaultCalloutPreset(id),
        'highlighter.calloutPresets.messages.defaultUpdated'
      );
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
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
    async (
      operation: () => Promise<{ outcome: string }>,
      successKey?: Parameters<typeof translate>[0]
    ) => {
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
            if (successKey) toast.success(translate(successKey));
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

  const actions = {
    ...createCatalogActions({ catalog, mutate, setEditor, setHoveredId }),
    ...createDragActions({ catalog, draggedId, mutate, setDraggedId, setDragOverId }),
  };

  return {
    catalog,
    draggedId,
    dragOverId,
    editor,
    error,
    hoveredId,
    isLoading,
    isSaving,
    actions,
  };
}
