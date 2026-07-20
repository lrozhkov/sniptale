type ScenarioBlockedModes = {
  aiPickMode: boolean;
  highlighterMode: boolean;
  quickEditMode: boolean;
};

type ScenarioByClickRestoreState = {
  restoreByClickAfterUnblock: boolean;
};

type FinishScenarioRecorderArgs = {
  modeController: {
    handleToggleScreenshotMode: (enabled: boolean) => void;
  };
  scenarioController: {
    handleScreenshotModeDisabled: () => Promise<void>;
    openEditor: (stepId?: string | null) => Promise<void>;
  };
};

export function isScenarioByClickBlocked(modes: ScenarioBlockedModes) {
  return modes.aiPickMode || modes.highlighterMode || modes.quickEditMode;
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

export async function finishScenarioRecorder(args: FinishScenarioRecorderArgs) {
  args.modeController.handleToggleScreenshotMode(false);
  await args.scenarioController.handleScreenshotModeDisabled();
  await args.scenarioController.openEditor();
}
