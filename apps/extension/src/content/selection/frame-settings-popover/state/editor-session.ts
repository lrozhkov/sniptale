import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import {
  addBorderPresetWithOutcome,
  loadHighlighterSettings,
  updateBorderPresetWithOutcome,
} from '../../../../composition/persistence/highlighter';
import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';
import { translate } from '../../../../platform/i18n';

const logger = createLogger({ namespace: 'ContentFrameStyleEditorSession' });

type SaveSessionRefs = {
  generation: MutableRefObject<number>;
  saving: MutableRefObject<number | undefined>;
};

type CommittedSave = {
  preset: BorderPreset;
  session: number;
};

export type RunSerializedFrameStyleMutation = <T>(task: () => Promise<T>) => Promise<T>;

function beginSaveSession(args: {
  isEditorOpen: boolean;
  refs: SaveSessionRefs;
  setIsSaving: (saving: boolean) => void;
}): number | null {
  const session = args.refs.generation.current;
  if (!args.isEditorOpen || args.refs.saving.current === session) return null;
  args.refs.saving.current = session;
  args.setIsSaving(true);
  return session;
}

function isCurrentSaveSession(refs: SaveSessionRefs, session: number) {
  return refs.generation.current === session;
}

function finishSaveSession(args: {
  refs: SaveSessionRefs;
  session: number;
  setIsSaving: (saving: boolean) => void;
}) {
  if (!isCurrentSaveSession(args.refs, args.session)) return;
  if (args.refs.saving.current !== args.session) return;
  args.refs.saving.current = undefined;
  args.setIsSaving(false);
}

async function persistFrameStylePreset(preset: BorderPreset, isEditing: boolean) {
  return isEditing ? updateBorderPresetWithOutcome(preset) : addBorderPresetWithOutcome(preset);
}

export function useFrameStyleEditorSession(args: {
  isPopoverOpen: boolean;
  onCanonicalPresetSaved: (settings: HighlighterSettings, presetId: string) => void;
  reconcileCatalogSettings: (settings: HighlighterSettings, revealPresetId?: string) => void;
  runSerializedMutation: RunSerializedFrameStyleMutation;
}) {
  const [editingPreset, setEditingPreset] = useState<BorderPreset>();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const sessionGenerationRef = useRef(0);
  const savingSessionRef = useRef<number | undefined>(undefined);
  const committedSaveRef = useRef<CommittedSave | undefined>(undefined);
  const saveSessionRefs = {
    generation: sessionGenerationRef,
    saving: savingSessionRef,
  };

  const invalidateSession = useCallback(() => {
    sessionGenerationRef.current += 1;
    savingSessionRef.current = undefined;
    committedSaveRef.current = undefined;
    setIsSaving(false);
  }, []);
  const closeEditor = useCallback(() => {
    invalidateSession();
    setIsEditorOpen(false);
    setEditingPreset(undefined);
  }, [invalidateSession]);
  const openEditor = useCallback((preset?: BorderPreset) => {
    sessionGenerationRef.current += 1;
    savingSessionRef.current = undefined;
    committedSaveRef.current = undefined;
    setIsSaving(false);
    setEditingPreset(preset);
    setIsEditorOpen(true);
  }, []);

  useEffect(() => {
    if (!args.isPopoverOpen) closeEditor();
  }, [args.isPopoverOpen, closeEditor]);
  useEffect(
    () => () => {
      sessionGenerationRef.current += 1;
      savingSessionRef.current = undefined;
      committedSaveRef.current = undefined;
    },
    []
  );

  const savePreset = async (preset: BorderPreset) => {
    const session = beginSaveSession({ isEditorOpen, refs: saveSessionRefs, setIsSaving });
    if (session === null) return;
    try {
      const result = await args.runSerializedMutation(async () => {
        if (!isCurrentSaveSession(saveSessionRefs, session)) {
          return { status: 'stale' as const };
        }

        const pendingCommit =
          committedSaveRef.current?.session === session ? committedSaveRef.current : undefined;
        const savedPreset = pendingCommit?.preset ?? preset;
        if (!pendingCommit) {
          const outcome = await persistFrameStylePreset(savedPreset, editingPreset !== undefined);
          if (!isCurrentSaveSession(saveSessionRefs, session)) {
            return { status: 'stale' as const };
          }
          if (outcome === 'rejected') {
            return { status: 'rejected' as const };
          }
          if (outcome === 'applied') {
            committedSaveRef.current = { preset: savedPreset, session };
          }
        }

        const settings = await loadHighlighterSettings();
        return { preset: savedPreset, settings, status: 'reconciled' as const };
      });
      if (!isCurrentSaveSession(saveSessionRefs, session) || result.status === 'stale') return;
      if (result.status === 'rejected') {
        toast.error(translate('content.overlayControls.saveFrameStyleError'));
        return;
      }
      committedSaveRef.current = undefined;
      args.reconcileCatalogSettings(result.settings, result.preset.id);
      args.onCanonicalPresetSaved(result.settings, result.preset.id);
      closeEditor();
    } catch (error) {
      if (!isCurrentSaveSession(saveSessionRefs, session)) return;
      logger.error('Failed to save frame style from content popover', error);
      toast.error(translate('content.overlayControls.saveFrameStyleError'));
    } finally {
      finishSaveSession({ refs: saveSessionRefs, session, setIsSaving });
    }
  };

  return {
    editor: {
      isOpen: isEditorOpen,
      isSaving,
      onClose: closeEditor,
      onSave: savePreset,
      preset: editingPreset,
    },
    handleAddPreset: () => openEditor(),
    handleEditPreset: openEditor,
  };
}
