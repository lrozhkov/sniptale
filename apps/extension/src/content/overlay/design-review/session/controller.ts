import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { BrowserDesignReviewAction } from '../../../parser/page-preparation/annotations';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import {
  dismissDesignReviewSelection,
  closeDesignReviewChecks,
  canEditDesignReviewText,
  canResetDesignReviewText,
  getDesignReviewModeState,
  openDesignReviewTarget,
  registerDesignReviewInspectorDismissRequestHandler,
  resetDesignReviewText,
  startDesignReviewTextEditing,
  subscribeToDesignReviewMode,
  setDesignReviewTool,
  dismissDesignReviewMeasureLayer,
  registerDesignReviewToolSwitchRequestHandler,
} from '../../../selection/design-review';
import { usePageStyleDraftState } from './draft';
import { readPageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';
import { useDesignReviewTreeNavigation } from './tree-navigation';
import { useDesignReviewCommentController } from './comment-controller';
import { usePageStyleValueActions } from '../value-editing/actions';
import {
  commitDesignReviewAction,
  deleteDesignReviewRecord,
  readDesignReviewRecord,
  serializeDesignReviewRecord,
} from '../runtime/record';
import { copyDesignReviewText } from './clipboard';
import { flushPendingPageStyleHistory } from '../runtime/actions';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../platform/i18n';
import { useDesignReviewTools } from './tools';
import { readPropertiesComment } from '../runtime/comment';
import { useDesignReviewChecks } from './checks';
import { reviewCheckReason } from '../checks/view';
import type { ReviewCheckFinding } from '../../../selection/design-review/checks/scan';
import { queryContentUiElement } from '../../../platform/dom-host';

interface UseDesignReviewControllerParams {
  enabled: boolean;
}

function createDesignReviewNavigationAction(args: {
  readTargets: ReturnType<typeof useDesignReviewTreeNavigation>;
  closeComment(): boolean;
  cancelVoiceInput(): void;
}) {
  return (target: Element) => {
    const candidates = args.readTargets();
    if (
      target !== candidates.parent &&
      target !== candidates.child &&
      !candidates.children?.includes(target)
    )
      return;
    if (!target.isConnected || !args.closeComment()) return;
    args.cancelVoiceInput();
    try {
      flushPendingPageStyleHistory();
      if (!openDesignReviewTarget(target)) {
        showToast(translate('content.designReview.navigateElementFailed'), 'error');
      }
    } catch {
      showToast(translate('content.designReview.navigateElementFailed'), 'error');
    }
  };
}

function createDesignReviewTextActions(args: {
  target: Element | null;
  closeComment(): boolean;
  cancelVoiceInput(): void;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return {
    edit: () => {
      if (!args.target || !args.closeComment()) return;
      args.cancelVoiceInput();
      try {
        flushPendingPageStyleHistory();
        if (startDesignReviewTextEditing()) args.setSettingsOpen(false);
      } catch {
        showToast(translate('content.designReview.textEditFailed'), 'error');
      }
    },
    reset: () => {
      if (!args.target || !args.closeComment()) return;
      args.cancelVoiceInput();
      try {
        flushPendingPageStyleHistory();
        resetDesignReviewText(args.target);
      } catch {
        showToast(translate('content.designReview.textResetFailed'), 'error');
      }
    },
  };
}

function useDesignReviewPopoverDismissal(args: {
  closeComment(): boolean;
  setPopoverOpen: Dispatch<SetStateAction<boolean>>;
  cancelVoiceInput(): void;
  voiceActive: boolean;
  cancelToolGesture(): boolean;
  cancelCssEditing(): boolean;
  cancelMeasureLayer(): boolean;
  closeCheck(): boolean;
}) {
  const {
    closeComment,
    setPopoverOpen,
    cancelVoiceInput,
    voiceActive,
    cancelToolGesture,
    closeCheck,
    cancelMeasureLayer,
    cancelCssEditing,
  } = args;
  const closePopover = useCallback(() => {
    if (closeCheck()) return true;
    if (cancelToolGesture()) return false;
    cancelVoiceInput();
    if (!closeComment()) return false;
    dismissDesignReviewSelection();
    setPopoverOpen(false);
    return true;
  }, [closeComment, setPopoverOpen, cancelVoiceInput, cancelToolGesture, closeCheck]);

  const dismissHighestLayer = useCallback(
    (event?: KeyboardEvent) => {
      if (event && cancelMeasureLayer()) return false;
      if (event && cancelCssEditing()) return false;
      if (!voiceActive) return closePopover();
      cancelVoiceInput();
      return true;
    },
    [closePopover, cancelVoiceInput, voiceActive, cancelCssEditing, cancelMeasureLayer]
  );

  useEffect(
    () => registerDesignReviewInspectorDismissRequestHandler(dismissHighestLayer),
    [dismissHighestLayer]
  );
  return closePopover;
}

function useLiveReviewSelection(
  activeSelection: ReturnType<typeof getDesignReviewModeState>['selection']
) {
  const revision = useSyncExternalStore(
    browserAnnotationSession.subscribe,
    () => browserAnnotationSession.getState().revision,
    () => 0
  );
  return useMemo(
    () => ({
      revision,
      selection: activeSelection?.snapshot.element.isConnected
        ? (readPageStyleSelectionSnapshot(activeSelection.snapshot.element) ??
          activeSelection.snapshot)
        : null,
    }),
    [activeSelection, revision]
  );
}

function useCheckFindingNavigation(args: {
  checkOpen: boolean;
  tool: ReturnType<typeof getDesignReviewModeState>['tool'];
  target: Element | null;
  closeComment(): boolean;
  cancelGesture(): boolean;
  cancelVoiceInput(): void;
  updateDraft(text: string): void;
  setNavigationFailed(failed: boolean): void;
}) {
  const {
    checkOpen,
    tool,
    target,
    closeComment,
    cancelGesture,
    cancelVoiceInput,
    updateDraft,
    setNavigationFailed,
  } = args;
  const pendingFeedback = useRef<{ target: Element; text: string } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingFeedback.current;
    if (!pending || checkOpen || tool !== 'comment' || target !== pending.target) return;
    pendingFeedback.current = null;
    updateDraft(pending.text);
  }, [target, checkOpen, tool, updateDraft]);
  return useCallback(
    (finding: ReviewCheckFinding, action: 'show' | 'inspect' | 'comment') => {
      if (!closeComment()) {
        setNavigationFailed(true);
        return;
      }
      cancelGesture();
      cancelVoiceInput();
      try {
        flushPendingPageStyleHistory();
        if (!openDesignReviewTarget(finding.target, 'finding')) {
          setNavigationFailed(true);
          return;
        }
        setNavigationFailed(false);
        if (action === 'inspect') setDesignReviewTool('inspect');
        if (action === 'comment') {
          const existing = readPropertiesComment(finding.target).comment;
          pendingFeedback.current = {
            target: finding.target,
            text: [existing, reviewCheckReason(finding)].filter(Boolean).join('\n\n'),
          };
          if (!setDesignReviewTool('comment')) pendingFeedback.current = null;
        }
      } catch {
        setNavigationFailed(true);
      }
    },
    [closeComment, cancelGesture, cancelVoiceInput, setNavigationFailed]
  );
}

function reviewPresentation(args: {
  enabled: boolean;
  mode: ReturnType<typeof getDesignReviewModeState>;
  popoverOpen: boolean;
  workspaceOpen: boolean;
}) {
  const { enabled, mode, popoverOpen, workspaceOpen } = args;
  const commentAllowed =
    mode.tool === 'comment' && !mode.checkOpen && mode.selectionOrigin !== 'finding';
  return {
    commentAllowed,
    inspectorOpen: popoverOpen && !mode.editingText && commentAllowed,
    toolPanelOpen:
      enabled &&
      workspaceOpen &&
      (mode.checkOpen || (mode.tool !== 'comment' && mode.tool !== 'move')) &&
      !mode.editingText,
  };
}

function createSelectedElementActions(args: {
  selection: ReturnType<typeof readPageStyleSelectionSnapshot>;
  cancelVoiceInput(): void;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setPopoverOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const { selection, cancelVoiceInput, setSettingsOpen, setPopoverOpen } = args;
  return {
    copyElement: async () =>
      selection
        ? copyDesignReviewText(
            serializeDesignReviewRecord(selection.element),
            'content.designReview.elementCopied'
          )
        : false,
    copyPath: async () => {
      if (selection)
        await copyDesignReviewText(selection.domPath, 'content.designReview.pathCopied');
    },
    delete: () => {
      if (!selection) return;
      deleteDesignReviewRecord(selection.element);
      cancelVoiceInput();
      dismissDesignReviewSelection();
      setSettingsOpen(false);
      setPopoverOpen(false);
    },
    selectAction: (action: BrowserDesignReviewAction) => {
      if (selection) commitDesignReviewAction({ action, target: selection.element });
    },
  };
}

function useReviewWorkspaceVisibility(args: {
  enabled: boolean;
  selection: ReturnType<typeof getDesignReviewModeState>['selection'];
  tool: ReturnType<typeof getDesignReviewModeState>['tool'];
  checkOpen: boolean;
}) {
  const { enabled, selection, tool, checkOpen } = args;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);
  useLayoutEffect(() => {
    setPopoverOpen(Boolean(selection));
    setSettingsOpen(false);
  }, [selection, tool, checkOpen]);
  useLayoutEffect(() => {
    if (selection) setWorkspaceOpen(true);
  }, [selection, tool]);
  useEffect(() => {
    if (!enabled) {
      setPanelOpen(false);
      setPopoverOpen(false);
      setSettingsOpen(false);
    }
  }, [enabled]);
  return {
    popoverOpen,
    setPopoverOpen,
    panelOpen,
    setPanelOpen,
    settingsOpen,
    setSettingsOpen,
    workspaceOpen,
    setWorkspaceOpen,
    workspaceCollapsed,
    setWorkspaceCollapsed,
  };
}

function useReviewWorkspaceTransitions(args: {
  ui: ReturnType<typeof useReviewWorkspaceVisibility>;
  checkOpen: boolean;
  tool: ReturnType<typeof getDesignReviewModeState>['tool'];
  closeComment(): boolean;
  cancelGesture(): boolean;
  cancelVoiceInput(): void;
}) {
  const { ui, checkOpen, tool, closeComment, cancelGesture, cancelVoiceInput } = args;
  const { setWorkspaceOpen, setWorkspaceCollapsed, workspaceCollapsed } = ui;
  const closeCheck = useCallback(() => {
    if (!checkOpen) return false;
    closeDesignReviewChecks();
    setWorkspaceOpen(false);
    queryContentUiElement<HTMLElement>('[data-ui="content.toolbar.review-check"]')?.focus();
    return true;
  }, [checkOpen, setWorkspaceOpen]);
  useEffect(
    () =>
      registerDesignReviewToolSwitchRequestHandler(() => {
        if (!closeComment()) return false;
        cancelGesture();
        cancelVoiceInput();
        try {
          flushPendingPageStyleHistory();
        } catch {
          return false;
        }
        setWorkspaceOpen(true);
        setWorkspaceCollapsed(false);
        return true;
      }),
    [closeComment, cancelGesture, cancelVoiceInput, setWorkspaceOpen, setWorkspaceCollapsed]
  );
  return {
    closeCheck,
    workspace: {
      collapsed: workspaceCollapsed,
      toggleCollapsed: () => setWorkspaceCollapsed((current) => !current),
      close: () => {
        closeDesignReviewChecks();
        setWorkspaceOpen(false);
        queryContentUiElement<HTMLElement>(
          checkOpen
            ? '[data-ui="content.toolbar.review-check"]'
            : `[data-ui="content.toolbar.review-tool.${tool}"]`
        )?.focus();
      },
      comment: () => {
        setDesignReviewTool('comment');
      },
    },
  };
}

function openRecord(annotationId: number): boolean {
  const target = browserAnnotationSession.getLiveTarget(annotationId);
  if (!target) return false;
  if (!setDesignReviewTool('comment')) return false;
  return openDesignReviewTarget(target, 'feedback');
}

export function useDesignReviewController(params: UseDesignReviewControllerParams) {
  const modeState = useSyncExternalStore(
    subscribeToDesignReviewMode,
    getDesignReviewModeState,
    getDesignReviewModeState
  );
  const enabled = params.enabled && modeState.enabled;
  const activeSelection = enabled ? modeState.selection : null;
  const { selection, revision: sessionRevision } = useLiveReviewSelection(activeSelection);
  const readTreeNavigation = useDesignReviewTreeNavigation(selection?.element ?? null);
  const ui = useReviewWorkspaceVisibility({
    enabled: params.enabled,
    selection: activeSelection,
    tool: modeState.tool,
    checkOpen: modeState.checkOpen,
  });
  const {
    popoverOpen,
    setPopoverOpen,
    panelOpen,
    setPanelOpen,
    settingsOpen,
    setSettingsOpen,
    workspaceOpen,
  } = ui;
  const presentation = reviewPresentation({ enabled, mode: modeState, popoverOpen, workspaceOpen });
  const comment = useDesignReviewCommentController({
    open: popoverOpen && presentation.commentAllowed,
    selection: presentation.commentAllowed ? selection : null,
  });
  const closeComment = comment.close;
  const cancelVoiceInput = comment.cancelVoice;
  const draftState = usePageStyleDraftState(selection);
  const tools = useDesignReviewTools(enabled, selection, draftState.setValues);
  const valueActions = usePageStyleValueActions({
    defaultValues: draftState.defaultValues,
    selection,
    setValues: draftState.setValues,
  });
  const record = selection ? readDesignReviewRecord(selection.element) : null;
  const action = record?.designReview?.action ?? 'refine';

  const transitions = useReviewWorkspaceTransitions({
    ui,
    checkOpen: modeState.checkOpen,
    tool: modeState.tool,
    closeComment,
    cancelGesture: tools.cancelGesture,
    cancelVoiceInput,
  });
  const closePopover = useDesignReviewPopoverDismissal({
    closeComment,
    setPopoverOpen,
    cancelVoiceInput,
    voiceActive: comment.view.voice.active || comment.view.voice.pending,
    cancelToolGesture: tools.cancelGesture,
    cancelCssEditing: tools.cssDrafts.cancelEditing,
    cancelMeasureLayer: dismissDesignReviewMeasureLayer,
    closeCheck: transitions.closeCheck,
  });

  useEffect(() => cancelVoiceInput(), [activeSelection, cancelVoiceInput]);

  const checks = useDesignReviewChecks(enabled, modeState.checkOpen, selection?.element ?? null);
  const onFinding = useCheckFindingNavigation({
    checkOpen: modeState.checkOpen,
    tool: modeState.tool,
    target: selection?.element ?? null,
    closeComment,
    cancelGesture: tools.cancelGesture,
    cancelVoiceInput,
    updateDraft: comment.draftActions.updateDraft,
    setNavigationFailed: checks.setNavigationFailed,
  });

  return {
    actions: {
      tools,
      close: closePopover,
      comment: comment.draftActions,
      ...createSelectedElementActions({
        selection,
        cancelVoiceInput,
        setSettingsOpen,
        setPopoverOpen,
      }),
      navigateElement: createDesignReviewNavigationAction({
        readTargets: readTreeNavigation,
        closeComment,
        cancelVoiceInput,
      }),
      resetValue: valueActions.resetValue,
      setSettingsOpen,
      text: createDesignReviewTextActions({
        target: selection?.element ?? null,
        closeComment,
        cancelVoiceInput,
        setSettingsOpen,
      }),
      setSideFieldLinked: draftState.setSideFieldLinked,
      updateValue: valueActions.updateValue,
      updateValues: valueActions.updateValues,
      voice: {
        start: comment.startVoice,
        stop: comment.stopVoice,
        cancel: cancelVoiceInput,
      },
    },
    tool: modeState.tool,
    checkOpen: modeState.checkOpen,
    checks,
    onFinding,
    toolPanelOpen: presentation.toolPanelOpen,
    workspace: transitions.workspace,
    inspectorOpen: presentation.inspectorOpen,
    enabled,
    panel: {
      close: () => setPanelOpen(false),
      openRecord,
      open: panelOpen,
      toggle: () => setPanelOpen((current) => !current),
    },
    viewState: {
      action,
      valueError: valueActions.error,
      measure: modeState.measure,
      anchor: activeSelection?.anchor ?? null,
      comment: comment.view.comment,
      defaultValues: draftState.defaultValues,
      draftPatch: draftState.draftPatch,
      modifiedProperties: draftState.modifiedProperties,
      selection,
      settingsOpen,
      treeNavigation: readTreeNavigation(),
      text: {
        editable: Boolean(selection && canEditDesignReviewText(selection.element)),
        modified: Boolean(record?.textChange),
        preview: selection?.element.textContent?.trim().slice(0, 80) ?? '',
        resettable: Boolean(selection && canResetDesignReviewText(selection.element)),
      },
      sideFieldLinks: draftState.sideFieldLinks,
      values: draftState.values,
      voice: comment.view.voice,
    },
    sessionRevision,
  };
}
