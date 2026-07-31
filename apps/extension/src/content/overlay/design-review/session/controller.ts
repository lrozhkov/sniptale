import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
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
import { usePageStyleCommentDraft } from './comment-draft';
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

  const commentDraft = usePageStyleCommentDraft({ open: popoverOpen, selection });
  const closeComment = commentDraft.closeComment;
  const draftState = usePageStyleDraftState(selection);
  const valueActions = usePageStyleValueActions({
    defaultValues: draftState.defaultValues,
    selection,
    setValues: draftState.setValues,
  });
  const record = selection ? readDesignReviewRecord(selection.element) : null;
  const action = record?.designReview?.action ?? 'refine';

  const closePopover = useCallback(() => {
    if (closeComment()) {
      dismissDesignReviewSelection();
      setPopoverOpen(false);
      return true;
    }
    return false;
  }, [closeComment]);

  useEffect(() => registerDesignReviewInspectorDismissRequestHandler(closePopover), [closePopover]);

  function openRecord(annotationId: number): boolean {
    const target = browserAnnotationSession.getLiveTarget(annotationId);
    return target ? openDesignReviewTarget(target) : false;
  }

  return {
    actions: {
      close: closePopover,
      comment: {
        commit: commentDraft.commitComment,
        endComposition: commentDraft.endCommentComposition,
        startComposition: commentDraft.startCommentComposition,
        updateDraft: commentDraft.updateCommentDraft,
      },
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
      comment: {
        commitFailed: commentDraft.commentCommitFailed,
        draft: commentDraft.commentDraft,
        marker: commentDraft.markerNumber,
      },
      defaultValues: draftState.defaultValues,
      draftPatch: draftState.draftPatch,
      modifiedProperties: draftState.modifiedProperties,
      selection,
      settingsOpen,
      sideFieldLinks: draftState.sideFieldLinks,
      values: draftState.values,
    },
    sessionRevision,
  };
}
