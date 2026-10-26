import { createLogger } from '@sniptale/platform/observability/logger';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../platform/i18n';
import { teardownDesignReviewSessionAfterUiTransition } from '../design-review/runtime/session-teardown';

const logger = createLogger({ namespace: 'ContentToolbarExit' });

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
  setPinToTab: (value: boolean) => void | Promise<boolean>;
  onClosed?: () => void | Promise<void>;
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
  let unpin: void | Promise<boolean>;
  void teardownDesignReviewSessionAfterUiTransition(() => {
    args.modeController.handleToggleScreenshotMode(false);
    if (!args.keepPinnedForAutoBlur) unpin = args.setPinToTab(false);
  })
    .then(async () => {
      if ((await unpin) === false) throw new Error('Toolbar unpin was refused');
      await args.onClosed?.();
    })
    .catch((error) => {
      logger.error('Failed to restore page changes before toolbar exit', error);
      showToast(translate('content.toolbar.screenshotDisableError'), 'error');
    });
}

export async function finishScenarioRecorder(args: FinishScenarioRecorderArgs) {
  await args.scenarioController.finishRecording();
  args.onDisableScreenshotMode();
}
