import { useState } from 'react';
import { useToolbarNavigationLock } from '../shell/navigation-lock';
import { useToolbarDerivedEffects } from './derived-effects';
import { createToolbarDerivedStateResult } from './derived.result';
import { useToolbarViewportState } from './derived.viewport';
import { useToolbarRefsAndPosition } from './refs-and-position';

type ToolbarDerivedStateParams = {
  aiPickMode: boolean;
  highlighterMode: boolean;
  isCursorMode: boolean;
  quickEditMode: boolean;
  scenarioCaptureMode?: 'manual' | 'by-click';
  scenarioEnabled?: boolean;
  screenshotMode: boolean;
  propHighlighterMode?: boolean;
  propQuickEditMode?: boolean;
  propViewport?: { width: number; height: number } | null;
  onViewportChange?: (viewport: { width: number; height: number } | null) => void;
  onToggleNavigationLock?: (enabled: boolean) => void;
};

export function useToolbarDerivedState(params: ToolbarDerivedStateParams) {
  const [isLoading, setIsLoading] = useState(false);
  const viewportState = useToolbarViewportState({
    ...(params.propViewport === undefined ? {} : { propViewport: params.propViewport }),
    ...(params.onViewportChange === undefined ? {} : { onViewportChange: params.onViewportChange }),
  });
  const refsAndPosition = useToolbarRefsAndPosition(viewportState.currentViewport);

  const navigation = useToolbarNavigationLock({
    highlighterMode: params.highlighterMode,
    isCursorMode: params.isCursorMode,
    quickEditMode: params.quickEditMode,
    screenshotMode: params.screenshotMode,
    aiPickMode: params.aiPickMode,
    ...(params.scenarioCaptureMode === undefined
      ? {}
      : { scenarioCaptureMode: params.scenarioCaptureMode }),
    ...(params.scenarioEnabled === undefined ? {} : { scenarioEnabled: params.scenarioEnabled }),
    ...(params.onToggleNavigationLock === undefined
      ? {}
      : { onToggleNavigationLock: params.onToggleNavigationLock }),
  });

  useToolbarDerivedEffects({
    setCurrentViewport: viewportState.setCurrentViewport,
  });

  return createToolbarDerivedStateResult({
    currentViewport: viewportState.currentViewport,
    setCurrentViewport: viewportState.setCurrentViewport,
    isLoading,
    setIsLoading,
    refsAndPosition,
    navigation,
  });
}
