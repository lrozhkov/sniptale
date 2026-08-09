import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  resolveToolbarLockPresentation,
  useToolbarManagedNavigationEffect,
} from './navigation-lock-helpers';
import { createToolbarNavigationLockToggle } from './navigation-lock.toggle';

export function useToolbarNavigationLock(params: {
  designReviewMode: boolean;
  drawingMode: boolean;
  scenarioCaptureMode?: 'manual' | 'by-click';
  scenarioEnabled?: boolean;
  highlighterMode: boolean;
  quickEditMode: boolean;
  screenshotMode: boolean;
  aiPickMode: boolean;
  isCursorMode: boolean;
  onToggleNavigationLock?: (enabled: boolean) => void;
}) {
  const scenarioByClickActive = Boolean(
    params.scenarioEnabled && params.scenarioCaptureMode === 'by-click'
  );
  const [navigationLockEnabled, setNavigationLockEnabled] = useState(true);

  useToolbarNavigationLockEffectState({
    ...params,
    scenarioByClickActive,
    setNavigationLockEnabled,
  });

  const toggleNavigationLock = createToolbarNavigationLockToggle({
    navigationLockEnabled,
    setNavigationLockEnabled,
    ...(params.onToggleNavigationLock === undefined
      ? {}
      : { onToggleNavigationLock: params.onToggleNavigationLock }),
  });

  return {
    navigationLockEnabled,
    toggleNavigationLock,
    ...resolveToolbarNavigationLockPresentation({
      ...params,
      navigationLockEnabled,
      scenarioByClickActive,
    }),
  };
}

function useToolbarNavigationLockEffectState(params: {
  aiPickMode: boolean;
  designReviewMode: boolean;
  drawingMode: boolean;
  highlighterMode: boolean;
  isCursorMode: boolean;
  quickEditMode: boolean;
  scenarioByClickActive: boolean;
  scenarioCaptureMode?: 'manual' | 'by-click';
  scenarioEnabled?: boolean;
  screenshotMode: boolean;
  setNavigationLockEnabled: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    aiPickMode,
    designReviewMode,
    drawingMode,
    highlighterMode,
    isCursorMode,
    quickEditMode,
    scenarioByClickActive,
    scenarioCaptureMode,
    scenarioEnabled,
    screenshotMode,
  } = params;

  useToolbarManagedNavigationEffect({
    aiPickMode,
    designReviewMode,
    drawingMode,
    highlighterMode,
    isCursorMode,
    quickEditMode,
    scenarioByClickActive,
    screenshotMode,
    setNavigationLockEnabled: params.setNavigationLockEnabled,
    ...(scenarioCaptureMode === undefined ? {} : { scenarioCaptureMode }),
    ...(scenarioEnabled === undefined ? {} : { scenarioEnabled }),
  });
}

function resolveToolbarNavigationLockPresentation(params: {
  aiPickMode: boolean;
  designReviewMode: boolean;
  drawingMode: boolean;
  highlighterMode: boolean;
  isCursorMode: boolean;
  navigationLockEnabled: boolean;
  quickEditMode: boolean;
  scenarioByClickActive: boolean;
  screenshotMode: boolean;
}) {
  return resolveToolbarLockPresentation({
    aiPickMode: params.aiPickMode,
    designReviewMode: params.designReviewMode,
    drawingMode: params.drawingMode,
    highlighterMode: params.highlighterMode,
    isCursorMode: params.isCursorMode,
    navigationLockEnabled: params.navigationLockEnabled,
    quickEditMode: params.quickEditMode,
    scenarioByClickActive: params.scenarioByClickActive,
    screenshotMode: params.screenshotMode,
  });
}
