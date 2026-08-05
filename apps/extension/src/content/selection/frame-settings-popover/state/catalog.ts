import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import {
  addBorderPresetWithOutcome,
  loadHighlighterSettings,
  setBorderPresetEnabled,
  updateBorderPresetWithOutcome,
} from '../../../../composition/persistence/highlighter';
import type {
  BorderPreset,
  BorderVisualStyle,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import { cloneBorderVisualStyle } from '@sniptale/runtime-contracts/highlighter/border-preset';
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
  const [isManualSaving, setIsManualSaving] = useState(false);
  const activePresetIdsRef = useRef<Set<string>>(new Set());
  const committedVisibilityRef = useRef<Map<string, boolean>>(new Map());
  const runSerializedMutation = useSerializedFrameStyleMutations();
  const manualSavingRef = useRef(false);
  const manualSessionRef = useRef(0);
  useEffect(() => {
    if (isOpen) return;
    manualSessionRef.current += 1;
    manualSavingRef.current = false;
    setIsManualSaving(false);
  }, [isOpen]);
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

  const saveManualPreset = async (input: {
    name?: string;
    overwrite?: BorderPreset;
    style: BorderVisualStyle;
  }): Promise<BorderPreset | null> => {
    if (manualSavingRef.current) return null;
    manualSavingRef.current = true;
    setIsManualSaving(true);
    const session = manualSessionRef.current;
    const id = input.overwrite?.id ?? crypto.randomUUID();
    const visualStyle = cloneBorderVisualStyle(input.style);
    const preset: BorderPreset = input.overwrite
      ? { ...input.overwrite, ...visualStyle }
      : {
          ...visualStyle,
          id,
          name: input.name?.trim() ?? '',
          enabled: true,
          order: 0,
          origin: 'user',
        };
    try {
      const result = await runSerializedMutation(async () => {
        const outcome = input.overwrite
          ? await updateBorderPresetWithOutcome(preset)
          : await addBorderPresetWithOutcome(preset);
        if (session !== manualSessionRef.current || outcome === 'rejected') return null;
        const settings = await loadHighlighterSettings();
        if (session !== manualSessionRef.current) return null;
        reconcileCatalogSettings(settings, id);
        return settings.borderPresets.find((item) => item.id === id) ?? null;
      });
      if (!result && session === manualSessionRef.current) {
        toast.error(translate('content.overlayControls.saveFrameStyleError'));
      }
      return result;
    } catch (error) {
      if (session === manualSessionRef.current) {
        logger.error('Failed to save manual frame style', error);
        toast.error(translate('content.overlayControls.saveFrameStyleError'));
      }
      return null;
    } finally {
      if (session === manualSessionRef.current) {
        manualSavingRef.current = false;
        setIsManualSaving(false);
      }
    }
  };

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
    manual: {
      isSaving: isManualSaving,
      save: saveManualPreset,
    },
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
