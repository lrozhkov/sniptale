type ScenarioBlockedModes = {
  aiPickMode: boolean;
  designReviewMode: boolean;
  highlighterMode: boolean;
  quickEditMode: boolean;
};

type ScenarioByClickRestoreState = {
  restoreByClickAfterUnblock: boolean;
};

type FinishScenarioRecorderArgs = {
  onDisableScreenshotMode: () => void;
  scenarioController: {
    handleScreenshotModeDisabled: () => Promise<void>;
    openEditor: (stepId?: string | null) => Promise<void>;
  };
};

type UserScreenshotModeExitArgs = {
  modeController: {
    handleToggleScreenshotMode: (enabled: boolean) => void;
  };
  setPinToTab: (value: boolean) => void;
};

export function isScenarioByClickBlocked(modes: ScenarioBlockedModes) {
  return modes.aiPickMode || modes.designReviewMode || modes.highlighterMode || modes.quickEditMode;
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
  args.setPinToTab(false);
}

export async function finishScenarioRecorder(args: FinishScenarioRecorderArgs) {
  args.onDisableScreenshotMode();
  await args.scenarioController.handleScreenshotModeDisabled();
  await args.scenarioController.openEditor();
}
