type ScenarioBlockedModes = {
  aiPickMode: boolean;
  designReviewMode: boolean;
  drawingMode?: boolean;
  highlighterMode: boolean;
  quickEditMode: boolean;
};

type ScenarioByClickRestoreState = {
  restoreByClickAfterUnblock: boolean;
};

type FinishScenarioRecorderArgs = {
  onDisableScreenshotMode: () => void;
  scenarioController: {
    finishRecording: () => Promise<void>;
  };
};

type UserScreenshotModeExitArgs = {
  modeController: {
    handleToggleScreenshotMode: (enabled: boolean) => void;
  };
  setPinToTab: (value: boolean) => void;
  keepPinnedForAutoBlur?: boolean;
};

export function isScenarioByClickBlocked(modes: ScenarioBlockedModes) {
  return Boolean(
    modes.aiPickMode ||
    modes.designReviewMode ||
    modes.drawingMode ||
    modes.highlighterMode ||
    modes.quickEditMode
  );
}

export function resolveScenarioByClickTransition(args: {
  blocked: boolean;
  captureMode: 'manual' | 'by-click';
  restoreState: ScenarioByClickRestoreState;
}): 'force-manual' | 'restore-by-click' | null {
  if (args.blocked) {
    return args.captureMode === 'by-click' && !args.restoreState.restoreByClickAfterUnblock
      ? 'force-manual'
      : null;
  }

  return args.restoreState.restoreByClickAfterUnblock && args.captureMode === 'manual'
    ? 'restore-by-click'
    : null;
}

export function exitScreenshotModeFromUserAction(args: UserScreenshotModeExitArgs): void {
  args.modeController.handleToggleScreenshotMode(false);
  if (!args.keepPinnedForAutoBlur) {
    args.setPinToTab(false);
  }
}

export async function finishScenarioRecorder(args: FinishScenarioRecorderArgs) {
  await args.scenarioController.finishRecording();
  args.onDisableScreenshotMode();
}
