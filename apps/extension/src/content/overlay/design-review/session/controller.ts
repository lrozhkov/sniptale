import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { BrowserDesignReviewAction } from '../../../parser/page-preparation/annotations';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import {
  dismissDesignReviewSelection,
  getDesignReviewModeState,
  openDesignReviewTarget,
  registerDesignReviewInspectorDismissRequestHandler,
  subscribeToDesignReviewMode,
} from '../../../selection/design-review';
import { usePageStyleDraftState } from './draft';
import { useDesignReviewCommentController } from './comment-controller';
import { usePageStyleValueActions } from '../value-editing/actions';
import {
  commitDesignReviewAction,
  deleteDesignReviewRecord,
  readDesignReviewRecord,
  serializeDesignReviewRecord,
} from '../runtime/record';
import { copyDesignReviewText } from './clipboard';

interface UseDesignReviewControllerParams {
  enabled: boolean;
}

function useDesignReviewPopoverDismissal(args: {
  closeComment(): boolean;
  setPopoverOpen: Dispatch<SetStateAction<boolean>>;
  stopVoiceInput(): void;
  voiceActive: boolean;
}) {
  const { closeComment, setPopoverOpen, stopVoiceInput, voiceActive } = args;
  const closePopover = useCallback(() => {
    stopVoiceInput();
    if (!closeComment()) return false;
    dismissDesignReviewSelection();
    setPopoverOpen(false);
    return true;
  }, [closeComment, setPopoverOpen, stopVoiceInput]);

  const dismissHighestLayer = useCallback(() => {
    if (!voiceActive) return closePopover();
    stopVoiceInput();
    return true;
  }, [closePopover, stopVoiceInput, voiceActive]);

  useEffect(
    () => registerDesignReviewInspectorDismissRequestHandler(dismissHighestLayer),
    [dismissHighestLayer]
  );
  return closePopover;
}

export function useDesignReviewController(params: UseDesignReviewControllerParams) {
  const modeState = useSyncExternalStore(
    subscribeToDesignReviewMode,
    getDesignReviewModeState,
    getDesignReviewModeState
  );
  const activeSelection = params.enabled && modeState.enabled ? modeState.selection : null;
  const selection = activeSelection?.snapshot ?? null;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sessionRevision = useSyncExternalStore(
    browserAnnotationSession.subscribe,
    () => browserAnnotationSession.getState().revision,
    () => 0
  );

  useLayoutEffect(() => {
    setPopoverOpen(Boolean(activeSelection));
    setSettingsOpen(false);
  }, [activeSelection]);

  useEffect(() => {
    if (!params.enabled) {
      setPanelOpen(false);
      setPopoverOpen(false);
      setSettingsOpen(false);
    }
  }, [params.enabled]);

  const comment = useDesignReviewCommentController({ open: popoverOpen, selection });
  const closeComment = comment.close;
  const stopVoiceInput = comment.stopVoice;
  const draftState = usePageStyleDraftState(selection);
  const valueActions = usePageStyleValueActions({
    defaultValues: draftState.defaultValues,
    selection,
    setValues: draftState.setValues,
  });
  const record = selection ? readDesignReviewRecord(selection.element) : null;
  const action = record?.designReview?.action ?? 'refine';

  const closePopover = useDesignReviewPopoverDismissal({
    closeComment,
    setPopoverOpen,
    stopVoiceInput,
    voiceActive: comment.view.voice.active,
  });

  useEffect(() => stopVoiceInput(), [activeSelection, stopVoiceInput]);

  function openRecord(annotationId: number): boolean {
    const target = browserAnnotationSession.getLiveTarget(annotationId);
    return target ? openDesignReviewTarget(target) : false;
  }

  return {
    actions: {
      close: closePopover,
      comment: comment.draftActions,
      copyElement: async () => {
        if (selection) {
          await copyDesignReviewText(
            serializeDesignReviewRecord(selection.element),
            'content.designReview.elementCopied'
          );
        }
      },
      copyPath: async () => {
        if (selection) {
          await copyDesignReviewText(selection.domPath, 'content.designReview.pathCopied');
        }
      },
      delete: () => {
        if (!selection) {
          return;
        }
        deleteDesignReviewRecord(selection.element);
        stopVoiceInput();
        dismissDesignReviewSelection();
        setSettingsOpen(false);
        setPopoverOpen(false);
      },
      resetValue: valueActions.resetValue,
      selectAction: (nextAction: BrowserDesignReviewAction) => {
        if (selection) {
          commitDesignReviewAction({ action: nextAction, target: selection.element });
        }
      },
      setSettingsOpen,
      setSideFieldLinked: draftState.setSideFieldLinked,
      updateValue: valueActions.updateValue,
      updateValues: valueActions.updateValues,
      voice: {
        start: comment.startVoice,
        stop: stopVoiceInput,
      },
    },
    inspectorOpen: popoverOpen,
    enabled: params.enabled && modeState.enabled,
    panel: {
      close: () => setPanelOpen(false),
      openRecord,
      open: panelOpen,
      toggle: () => setPanelOpen((current) => !current),
    },
    viewState: {
      action,
      anchor: activeSelection?.anchor ?? null,
      comment: comment.view.comment,
      defaultValues: draftState.defaultValues,
      draftPatch: draftState.draftPatch,
      modifiedProperties: draftState.modifiedProperties,
      selection,
      settingsOpen,
      sideFieldLinks: draftState.sideFieldLinks,
      values: draftState.values,
      voice: comment.view.voice,
    },
    sessionRevision,
  };
}
