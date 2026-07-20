import { useCallback, useEffect, useRef } from 'react';

import { registerFrameCallbacks } from '../../../selection/highlighter';
import { disableNavigationLock } from '../../../selection/locker';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
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
    'setAiPickMode' | 'setHighlighterMode' | 'setQuickEditDocumentMode' | 'setQuickEditMode'
  > &
    Pick<ContentAppVisibilityState, 'setIsToolbarVisible'>;
  modeFlags: ContentAppModeFlags;
  visibilityState: Pick<ContentAppVisibilityState, 'isCompletelyHidden' | 'isToolbarVisible'>;
}

function useNavigationLockCleanup(modeFlags: ContentAppModeFlags) {
  useEffect(() => {
    if (
      modeFlags.screenshotMode ||
      modeFlags.highlighterMode ||
      modeFlags.quickEditMode ||
      modeFlags.aiPickMode
    ) {
      return;
    }

    disableNavigationLock();
  }, [
    modeFlags.aiPickMode,
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

function useFrameCallbackRegistration(args: {
  addFrame: (element: HTMLElement) => void;
  clearFrames: () => void;
  hasFrameForElement: (element: HTMLElement) => boolean;
  removeFrame: (frameId: string) => void;
}) {
  const { addFrame, clearFrames, hasFrameForElement, removeFrame } = args;
  const addFrameRef = useRef(addFrame);
  const removeFrameRef = useRef(removeFrame);
  const clearFramesRef = useRef(clearFrames);
  const hasFrameForElementRef = useRef(hasFrameForElement);

  addFrameRef.current = addFrame;
  removeFrameRef.current = removeFrame;
  clearFramesRef.current = clearFrames;
  hasFrameForElementRef.current = hasFrameForElement;

  useEffect(() => {
    registerFrameCallbacks(
      (...args) => addFrameRef.current(...args),
      (...args) => removeFrameRef.current(...args),
      () => clearFramesRef.current(),
      (...args) => hasFrameForElementRef.current(...args)
    );
  }, []);
}

export function useContentAppBindings(params: ContentAppBindingsParams) {
  const { modeControls } = params;
  const {
    setAiPickMode,
    setHighlighterMode,
    setIsToolbarVisible,
    setQuickEditDocumentMode,
    setQuickEditMode,
  } = modeControls;
  const frameManager = useFrameManager({
    InteractiveFrameComponent: params.InteractiveFrameComponent,
  });
  const handleShowToolbar = useCallback(() => {
    setIsToolbarVisible(true);
  }, [setIsToolbarVisible]);

  useFrameUIController({ frames: frameManager.frames });
  useQuickActionHotkeys();
  useNavigationLockCleanup(params.modeFlags);
  usePagePreparationHistoryReset(params.modeFlags.screenshotMode);
  useFrameCallbackRegistration({
    addFrame: frameManager.addFrame,
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
    highlighterMode: params.modeFlags.highlighterMode,
    quickEditMode: params.modeFlags.quickEditMode,
    setAiPickMode,
    setHighlighterMode,
    setQuickEditDocumentMode,
    setQuickEditMode,
  });

  return frameManager;
}
