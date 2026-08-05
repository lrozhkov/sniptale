import { useCallback, useEffect, useRef, useState } from 'react';
import type { StepBadgePresetCatalog } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../platform/i18n';
import {
  loadStepBadgePresetCatalog,
  subscribeToStepBadgePresetCatalog,
} from '../../../../composition/persistence/step-badge-presets';
import type { StepBadgePresetCatalogController } from './types';
import {
  createStepBadgePresetCatalogActions,
  createStepBadgePresetDragActions,
} from './controller-actions';

export function useStepBadgePresetCatalogController(): StepBadgePresetCatalogController {
  const [catalog, setCatalog] = useState<StepBadgePresetCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editor, setEditor] = useState<StepBadgePresetCatalogController['editor']>({
    isOpen: false,
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const request = useRef(0);
  const queue = useRef(Promise.resolve());
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const next = await loadStepBadgePresetCatalog();
      if (id === request.current) {
        setCatalog(next);
        setError(false);
      }
    } catch {
      if (id === request.current) setError(true);
    } finally {
      if (id === request.current) setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeToStepBadgePresetCatalog((next) => {
      request.current += 1;
      setCatalog(next);
      setError(false);
      setIsLoading(false);
    });
    return () => {
      request.current += 1;
      unsubscribe();
    };
  }, [refresh]);
  const mutate = useCallback(
    async (
      operation: () => Promise<{ outcome: string }>,
      success?: Parameters<typeof translate>[0]
    ) => {
      let accepted = false;
      const run = async () => {
        setIsSaving(true);
        try {
          const result = await operation();
          if (result.outcome === 'rejected')
            toast.error(translate('highlighter.stepBadgePresets.messages.saveError'));
          else {
            accepted = true;
            if (result.outcome === 'applied') {
              await refresh();
              if (success) toast.success(translate(success));
            }
          }
        } catch {
          toast.error(translate('highlighter.stepBadgePresets.messages.saveError'));
        } finally {
          setIsSaving(false);
        }
      };
      const pending = queue.current.catch(() => undefined).then(run);
      queue.current = pending.then(
        () => undefined,
        () => undefined
      );
      await pending;
      return accepted;
    },
    [refresh]
  );
  const resetDrag = () => {
    setDraggedId(null);
    setDragOverId(null);
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
    actions: {
      ...createStepBadgePresetCatalogActions({ catalog, mutate, setEditor, setHoveredId }),
      ...createStepBadgePresetDragActions({
        catalog,
        draggedId,
        mutate,
        reset: resetDrag,
        setDraggedId,
        setDragOverId,
      }),
    },
  };
}
