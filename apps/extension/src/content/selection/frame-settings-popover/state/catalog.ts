import { useCallback, useRef, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import {
  loadHighlighterSettings,
  setBorderPresetEnabled,
} from '../../../../composition/persistence/highlighter';
import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';
import { translate } from '../../../../platform/i18n';
import { useFrameStyleEditorSession, type RunSerializedFrameStyleMutation } from './editor-session';

const logger = createLogger({ namespace: 'ContentFrameStyleCatalog' });

function useSerializedFrameStyleMutations(): RunSerializedFrameStyleMutation {
  const tailRef = useRef<Promise<void>>(Promise.resolve());
  return useCallback(<T>(task: () => Promise<T>) => {
    const operation = tailRef.current.then(task, task);
    tailRef.current = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }, []);
}

export function useFrameStyleCatalog(args: {
  isOpen: boolean;
  onCanonicalPresetSaved: (settings: HighlighterSettings, presetId: string) => void;
  reconcileCatalogSettings: (settings: HighlighterSettings, revealPresetId?: string) => void;
}) {
  const { isOpen, onCanonicalPresetSaved, reconcileCatalogSettings: publishCatalogSettings } = args;
  const [pendingPresetIds, setPendingPresetIds] = useState<ReadonlySet<string>>(() => new Set());
  const activePresetIdsRef = useRef<Set<string>>(new Set());
  const committedVisibilityRef = useRef<Map<string, boolean>>(new Map());
  const runSerializedMutation = useSerializedFrameStyleMutations();
  const reconcileCatalogSettings = useCallback(
    (settings: HighlighterSettings, revealPresetId?: string) => {
      committedVisibilityRef.current.clear();
      if (revealPresetId === undefined) publishCatalogSettings(settings);
      else publishCatalogSettings(settings, revealPresetId);
    },
    [publishCatalogSettings]
  );
  const editorSession = useFrameStyleEditorSession({
    isPopoverOpen: isOpen,
    onCanonicalPresetSaved,
    reconcileCatalogSettings,
    runSerializedMutation,
  });

  const setPresetPending = (presetId: string, pending: boolean) => {
    if (pending) activePresetIdsRef.current.add(presetId);
    else activePresetIdsRef.current.delete(presetId);
    setPendingPresetIds((current) => {
      const next = new Set(current);
      if (pending) next.add(presetId);
      else next.delete(presetId);
      return next;
    });
  };

  return {
    editor: editorSession.editor,
    handlers: {
      handleAddPreset: editorSession.handleAddPreset,
      handleEditPreset: editorSession.handleEditPreset,
      handleTogglePresetEnabled: async (preset: BorderPreset) => {
        if (activePresetIdsRef.current.has(preset.id)) return;
        const isReconciliationRetry = committedVisibilityRef.current.has(preset.id);
        const enabled = isReconciliationRetry
          ? (committedVisibilityRef.current.get(preset.id) as boolean)
          : preset.enabled === false;
        setPresetPending(preset.id, true);
        try {
          await runSerializedMutation(async () => {
            if (!isReconciliationRetry) {
              const saved = await setBorderPresetEnabled(preset.id, enabled);
              if (!saved) {
                toast.error(translate('content.overlayControls.toggleFrameStyleError'));
                return;
              }
              committedVisibilityRef.current.set(preset.id, enabled);
            }
            const settings = await loadHighlighterSettings();
            reconcileCatalogSettings(settings);
          });
        } catch (error) {
          logger.error('Failed to change frame style visibility from content popover', error);
          toast.error(translate('content.overlayControls.toggleFrameStyleError'));
        } finally {
          setPresetPending(preset.id, false);
        }
      },
    },
    pendingPresetIds,
  };
}
