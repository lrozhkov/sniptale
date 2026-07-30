import { useCallback, useEffect, useRef } from 'react';

import { registerFrameCallbacks } from '../../../selection/highlighter';
import { disableNavigationLock } from '../../../selection/locker';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import {
  browserAnnotationSession,
  subscribeToBrowserAnnotationDocumentNavigation,
} from '../../../parser/page-preparation/annotations';
import type { InteractiveFrameComponent } from '../../../selection/frame-runtime/roots/component';
import type {
  ContentAppModeControls,
  ContentAppModeFlags,
  ContentAppVisibilityState,
} from '../mode';
import { useFrameManager } from '../../../selection/frame-runtime/react/useFrameManager';
import { useFrameUIController } from '../../../selection/frame-runtime/ui-controller';
import { useModeDisabledListener } from '../../../application/mode-session/disabled-listener';
import { useQuickActionHotkeys } from '../../toolbar/quick-action-hotkeys';
import { useShowToolbarButton } from '../../toolbar/show-button';

interface ContentAppBindingsParams {
  countdownActive: boolean;
  InteractiveFrameComponent: InteractiveFrameComponent;
  modeControls: Pick<
    ContentAppModeControls,
    | 'setAiPickMode'
    | 'setDesignReviewMode'
    | 'setHighlighterMode'
    | 'setQuickEditDocumentMode'
    | 'setQuickEditMode'
  > &
    Pick<ContentAppVisibilityState, 'setIsToolbarVisible'>;
  modeFlags: ContentAppModeFlags;
  visibilityState: Pick<
    ContentAppVisibilityState,
    'isCompletelyHidden' | 'isToolbarVisible' | 'setPinnedToolbarVisible'
  >;
}

function useNavigationLockCleanup(modeFlags: ContentAppModeFlags) {
  useEffect(() => {
    if (
      modeFlags.screenshotMode ||
      modeFlags.highlighterMode ||
      modeFlags.quickEditMode ||
      modeFlags.aiPickMode ||
      modeFlags.designReviewMode
    ) {
      return;
    }

    disableNavigationLock();
  }, [
    modeFlags.aiPickMode,
    modeFlags.designReviewMode,
    modeFlags.highlighterMode,
    modeFlags.quickEditMode,
    modeFlags.screenshotMode,
  ]);
}

function usePagePreparationHistoryReset(screenshotMode: boolean) {
  const prevScreenshotModeRef = useRef(screenshotMode);

  useEffect(() => {
    if (prevScreenshotModeRef.current && !screenshotMode) {
      pagePreparationHistory.clear();
    }

    prevScreenshotModeRef.current = screenshotMode;
  }, [screenshotMode]);
}

function useBrowserAnnotationDocumentReset(clearFrames: () => void) {
  useEffect(
    () =>
      subscribeToBrowserAnnotationDocumentNavigation({
        onNavigation: () => {
          clearFrames();
          browserAnnotationSession.resetForDocument();
          pagePreparationHistory.clear();
        },
      }),
    [clearFrames]
  );
}

function useFrameCallbackRegistration(args: {
  addFrame: (element: HTMLElement) => void;
  addFreeFrame: ReturnType<typeof useFrameManager>['addFreeFrame'];
  clearFrames: () => void;
  hasFrameForElement: (element: HTMLElement) => boolean;
  removeFrame: (frameId: string) => void;
}) {
  const { addFrame, addFreeFrame, clearFrames, hasFrameForElement, removeFrame } = args;
  const addFrameRef = useRef(addFrame);
  const addFreeFrameRef = useRef(addFreeFrame);
  const removeFrameRef = useRef(removeFrame);
  const clearFramesRef = useRef(clearFrames);
  const hasFrameForElementRef = useRef(hasFrameForElement);

  addFrameRef.current = addFrame;
  addFreeFrameRef.current = addFreeFrame;
  removeFrameRef.current = removeFrame;
  clearFramesRef.current = clearFrames;
  hasFrameForElementRef.current = hasFrameForElement;

  useEffect(() => {
    registerFrameCallbacks(
      (...args) => addFrameRef.current(...args),
      (input) => addFreeFrameRef.current(input),
      (...args) => removeFrameRef.current(...args),
      () => clearFramesRef.current(),
      (...args) => hasFrameForElementRef.current(...args)
    );
  }, []);
}

export function useContentAppBindings(params: ContentAppBindingsParams) {
  const { modeControls } = params;
  const { setPinnedToolbarVisible } = params.visibilityState;
  const {
    setAiPickMode,
    setDesignReviewMode,
    setHighlighterMode,
    setQuickEditDocumentMode,
    setQuickEditMode,
  } = modeControls;
  const frameManager = useFrameManager({
    InteractiveFrameComponent: params.InteractiveFrameComponent,
  });
  const handleShowToolbar = useCallback(() => {
    setPinnedToolbarVisible(true);
  }, [setPinnedToolbarVisible]);

  useFrameUIController({ frames: frameManager.frames });
  useBrowserAnnotationDocumentReset(frameManager.clearFrames);
  useQuickActionHotkeys();
  useNavigationLockCleanup(params.modeFlags);
  usePagePreparationHistoryReset(params.modeFlags.screenshotMode);
  useFrameCallbackRegistration({
    addFrame: frameManager.addFrame,
    addFreeFrame: frameManager.addFreeFrame,
    clearFrames: frameManager.clearFrames,
    hasFrameForElement: frameManager.hasFrameForElement,
    removeFrame: frameManager.removeFrame,
  });
  useShowToolbarButton({
    countdownActive: params.countdownActive,
    screenshotMode: params.modeFlags.screenshotMode,
    isToolbarVisible: params.visibilityState.isToolbarVisible,
    isCompletelyHidden: params.visibilityState.isCompletelyHidden,
    onShowToolbar: handleShowToolbar,
  });
  useModeDisabledListener({
    aiPickMode: params.modeFlags.aiPickMode,
    designReviewMode: params.modeFlags.designReviewMode,
    highlighterMode: params.modeFlags.highlighterMode,
    quickEditMode: params.modeFlags.quickEditMode,
    setAiPickMode,
    setDesignReviewMode,
    setHighlighterMode,
    setQuickEditDocumentMode,
    setQuickEditMode,
  });

  return frameManager;
}
