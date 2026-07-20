import { useCallback, useEffect, useState } from 'react';
import type { CaptureActionType } from '../../../../contracts/settings';
import type { ToolbarProps } from '../types';
import { useToolbarDerivedState } from './derived';
import { useToolbarMenuState } from './menu';
import { useToolbarModeToggles } from './mode-toggles';

function useCaptureActionState(
  captureActionProp: CaptureActionType | undefined,
  onCaptureActionChange: ToolbarProps['onCaptureActionChange']
) {
  const [captureAction, setCaptureAction] = useState<CaptureActionType>(
    captureActionProp ?? 'download_default'
  );

  useEffect(() => {
    if (captureActionProp) {
      setCaptureAction(captureActionProp);
    }
  }, [captureActionProp]);

  const handleCaptureActionChange = useCallback(
    (action: CaptureActionType) => {
      setCaptureAction(action);
      onCaptureActionChange?.(action);
    },
    [onCaptureActionChange]
  );

  return { captureAction, handleCaptureActionChange };
}

function createToolbarDerivedStateArgs(
  props: ToolbarProps,
  args: {
    highlighterMode: boolean;
    quickEditMode: boolean;
    screenshotMode: boolean;
  }
) {
  return {
    aiPickMode: props.aiPickMode ?? false,
    highlighterMode: args.highlighterMode,
    isCursorMode: props.isCursorMode ?? true,
    quickEditMode: args.quickEditMode,
    screenshotMode: args.screenshotMode,
    ...(props.scenario?.captureMode === undefined
      ? {}
      : { scenarioCaptureMode: props.scenario.captureMode }),
    ...(props.scenario === undefined ? {} : { scenarioEnabled: true }),
    ...(props.highlighterMode === undefined ? {} : { propHighlighterMode: props.highlighterMode }),
    ...(props.quickEditMode === undefined ? {} : { propQuickEditMode: props.quickEditMode }),
    ...(props.currentViewport === undefined ? {} : { propViewport: props.currentViewport }),
    ...(props.onViewportChange === undefined ? {} : { onViewportChange: props.onViewportChange }),
    ...(props.onToggleNavigationLock === undefined
      ? {}
      : { onToggleNavigationLock: props.onToggleNavigationLock }),
  };
}

function createToolbarModeToggleArgs(
  props: ToolbarProps,
  derivedState: ReturnType<typeof useToolbarDerivedState>,
  args: {
    highlighterMode: boolean;
    quickEditMode: boolean;
    screenshotMode: boolean;
  }
) {
  return {
    aiPickMode: props.aiPickMode ?? false,
    screenshotMode: args.screenshotMode,
    highlighterMode: args.highlighterMode,
    quickEditMode: args.quickEditMode,
    onToggleScreenshotMode: props.onToggleScreenshotMode,
    onToggleHighlighterMode: props.onToggleHighlighterMode,
    onToggleQuickEditMode: props.onToggleQuickEditMode,
    onClearHighlights: props.onClearHighlights,
    setIsLoading: derivedState.setIsLoading,
    ...(props.highlighterMode === undefined ? {} : { propHighlighterMode: props.highlighterMode }),
    ...(props.quickEditMode === undefined ? {} : { propQuickEditMode: props.quickEditMode }),
    ...(props.onDisableAiPickMode === undefined
      ? {}
      : { onDisableAiPickMode: props.onDisableAiPickMode }),
  };
}

function resolveToolbarModeFlags(props: ToolbarProps) {
  return {
    highlighterMode: props.highlighterMode ?? false,
    quickEditDocumentMode: props.quickEditDocumentMode ?? false,
    quickEditMode: props.quickEditMode ?? false,
    screenshotMode: props.screenshotMode ?? false,
  };
}

/**
 * Builds the Toolbar view-model while keeping the render shell thin.
 */
export function useToolbarViewModel(props: ToolbarProps) {
  const { highlighterMode, quickEditDocumentMode, quickEditMode, screenshotMode } =
    resolveToolbarModeFlags(props);
  const { captureAction, handleCaptureActionChange } = useCaptureActionState(
    props.captureAction,
    props.onCaptureActionChange
  );
  const modeFlags = { highlighterMode, quickEditMode, screenshotMode };
  const toolbarMenuState = useToolbarMenuState();

  const derivedState = useToolbarDerivedState(createToolbarDerivedStateArgs(props, modeFlags));

  const { pendingInteractionMode, toggleMode } = useToolbarModeToggles(
    createToolbarModeToggleArgs(props, derivedState, modeFlags)
  );

  return {
    highlighterMode,
    quickEditDocumentMode,
    quickEditMode,
    pendingInteractionMode,
    screenshotMode,
    captureAction,
    setCaptureAction: handleCaptureActionChange,
    derivedState,
    toolbarMenuState,
    toggleMode,
  };
}
