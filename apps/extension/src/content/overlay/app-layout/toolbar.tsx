import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { Toolbar } from '../toolbar/view';
import {
  exitScreenshotModeFromUserAction,
  finishScenarioRecorder,
  isScenarioByClickBlocked,
  resolveScenarioByClickTransition,
} from './scenario';
import { preloadContentScenarioRecorderSidebar } from './sidebar-lazy';
import type {
  ContentAppScenarioActions,
  ContentAppLayoutScenarioProps,
  ContentAppLayoutToolbarProps,
  ContentAppScenarioState,
} from './types';
import type { CaptureActionType } from '../../../contracts/settings';
import { clearAllPagePreparationChanges } from '../../application/page-preparation-reset';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../platform/i18n';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';

const logger = createLogger({ namespace: 'ContentToolbarShell' });

type ContentToolbarShellProps = {
  designReview: {
    panel: { open: boolean; toggle: () => void };
  };
  scenario: ContentAppLayoutScenarioProps;
  toolbar: ContentAppLayoutToolbarProps;
};

function useScenarioByClickBlockSync(args: {
  blocked: boolean;
  captureMode: ContentAppScenarioState['scenarioCaptureMode'];
  setCaptureMode: ContentAppScenarioActions['setCaptureMode'];
}) {
  const { blocked, captureMode, setCaptureMode } = args;
  const scenarioByClickRestoreStateRef = useRef({
    restoreByClickAfterUnblock: false,
  });

  useEffect(() => {
    const transition = resolveScenarioByClickTransition({
      blocked,
      captureMode,
      restoreState: scenarioByClickRestoreStateRef.current,
    });

    if (transition === 'force-manual') {
      scenarioByClickRestoreStateRef.current.restoreByClickAfterUnblock = true;
      void setCaptureMode('manual');
      return;
    }

    if (transition === 'restore-by-click') {
      scenarioByClickRestoreStateRef.current.restoreByClickAfterUnblock = false;
      void setCaptureMode('by-click');
    }
  }, [blocked, captureMode, setCaptureMode]);
}

function buildScenarioToolbarProps(args: {
  blocked: boolean;
  actions: ContentAppScenarioActions;
  state: ContentAppScenarioState;
  onFinishScenario: () => Promise<void>;
}) {
  function warmScenarioRecorderSidebar() {
    preloadContentScenarioRecorderSidebar().catch((error) => {
      logger.warn('Failed to preload scenario recorder sidebar chunk', error);
    });
  }

  return {
    byClickDisabled: args.blocked,
    captureMode: args.state.scenarioCaptureMode,
    enabled: args.state.scenarioEnabled,
    onCaptureActionSelected: (action: CaptureActionType) => {
      if (action === 'scenario') {
        warmScenarioRecorderSidebar();
      }
      return args.actions.applyCaptureAction(action);
    },
    onCreateProject: (name: string) => args.actions.createProject(name),
    onFinishScenario: args.onFinishScenario,
    onOpenEditor: (stepId?: string | null) => void args.actions.openEditor(stepId),
    onProjectSelect: (projectId: string) => void args.actions.selectProject(projectId),
    onSetCaptureMode: (captureMode: 'manual' | 'by-click') =>
      void args.actions.setCaptureMode(captureMode),
    onToggleSidebar: () => {
      if (!args.state.sidebarVisible) {
        warmScenarioRecorderSidebar();
      }
      return args.actions.setSidebarVisible(!args.state.sidebarVisible);
    },
    projectId: args.state.scenarioProjectId,
    projectName: args.state.scenarioProjectName,
    projects: args.state.projects,
    pendingProjectSelection: args.state.pendingProjectSelection,
    sidebarVisible: args.state.sidebarVisible,
  };
}

function createFinishScenarioHandler(args: {
  onDisableScreenshotMode: () => void;
  scenarioActions: Pick<ContentAppScenarioActions, 'handleScreenshotModeDisabled' | 'openEditor'>;
}) {
  return () =>
    finishScenarioRecorder({
      onDisableScreenshotMode: args.onDisableScreenshotMode,
      scenarioController: args.scenarioActions,
    });
}

function createScreenshotModeToggleHandler(args: {
  modeController: ContentAppLayoutToolbarProps['modeController'];
  onDisableScreenshotMode: () => void;
  scenarioActions: Pick<ContentAppScenarioActions, 'handleScreenshotModeDisabled'>;
}) {
  return (enabled: boolean) => {
    if (enabled) {
      args.modeController.handleToggleScreenshotMode(true);
      return;
    }

    args.onDisableScreenshotMode();
    void args.scenarioActions.handleScreenshotModeDisabled();
  };
}

function createToolbarAutoBlurProps(
  autoBlurController: ContentAppLayoutToolbarProps['autoBlurController']
) {
  return {
    autoApplyAllowed: autoBlurController.autoApplyAllowed,
    autoApplyEnabled: autoBlurController.autoApplyEnabled,
    isApplying: autoBlurController.isApplying,
    onApplyOnce: autoBlurController.applyOnce,
    onOpenAutoApplySettings: autoBlurController.openForAutoApply,
    onOpenSettings: autoBlurController.open,
    onToggleAutoApply: autoBlurController.toggleAutoApply,
  };
}

function clearPagePreparation(
  toolbar: ContentAppLayoutToolbarProps,
  modeController: ContentAppLayoutToolbarProps['modeController']
) {
  toolbar.drawingController?.finalizeInteraction();
  const fullyCleared = clearAllPagePreparationChanges({
    clearHighlights: modeController.handleClearHighlights,
    history: pagePreparationHistory,
    resetAnnotations: browserAnnotationSession.resetForDocument,
  });
  showToast(
    translate(
      fullyCleared
        ? 'content.toolbar.allChangesCleared'
        : 'content.toolbar.someChangesCouldNotBeCleared'
    ),
    fullyCleared ? 'info' : 'error'
  );
}

function createVideoRecordingModeToggleHandler(toolbar: ContentAppLayoutToolbarProps) {
  const { modeController } = toolbar;
  return async (enabled: boolean, activationEvent?: Event): Promise<boolean> => {
    if (!toolbar.videoRecording) return false;
    try {
      if (!enabled) {
        const deactivated = await toolbar.videoRecording.onDeactivate();
        if (deactivated) toolbar.setVideoRecordingMode?.(false);
        return deactivated;
      }
      const activated = await toolbar.videoRecording.onActivate(activationEvent);
      if (!activated) return false;
      modeController.handleToggleHighlighterMode(false);
      modeController.handleToggleDesignReviewMode(false);
      modeController.handleToggleQuickEditMode(false);
      modeController.handleToggleDrawingMode?.(false);
      toolbar.setPinnedToolbarVisible(true);
      toolbar.setVideoRecordingMode?.(true);
      return true;
    } catch (error) {
      logger.error(
        enabled
          ? 'Failed to activate video recording toolbar'
          : 'Failed to release video recording toolbar',
        error
      );
      showToast(translate('content.toolbar.videoRecordingActionFailed'), 'error');
      return false;
    }
  };
}

function renderToolbarShell(args: {
  canClearPagePreparation: boolean;
  designReview: ContentToolbarShellProps['designReview'];
  handleToggleScreenshotMode: (enabled: boolean) => void;
  scenarioToolbarProps: ReturnType<typeof buildScenarioToolbarProps>;
  toolbar: ContentAppLayoutToolbarProps;
}) {
  const { modeController, modes } = args.toolbar;
  const autoBlur = createToolbarAutoBlurProps(args.toolbar.autoBlurController);
  const handleHideToolbar = () => {
    args.toolbar.setPinnedToolbarVisible(false);
  };
  const handleToggleVideoRecordingMode = createVideoRecordingModeToggleHandler(args.toolbar);

  return (
    <div className="sniptale-app" data-hidden={args.toolbar.isCompletelyHidden ? 'true' : 'false'}>
      <Toolbar
        captureAction={args.toolbar.captureAction}
        onToggleScreenshotMode={args.handleToggleScreenshotMode}
        onToggleHighlighterMode={modeController.handleToggleHighlighterMode}
        onToggleDesignReviewMode={modeController.handleToggleDesignReviewMode}
        onToggleQuickEditDocumentMode={modeController.handleToggleQuickEditDocumentMode}
        onToggleQuickEditMode={modeController.handleToggleQuickEditMode}
        onAiPickContentStart={args.toolbar.aiController.handleAiPickContentStart}
        aiPickMode={modes.aiPickMode}
        designReviewMode={modes.designReviewMode}
        {...(modeController.handleToggleDrawingMode === undefined
          ? {}
          : { onToggleDrawingMode: modeController.handleToggleDrawingMode })}
        {...(modes.drawingMode === undefined ? {} : { drawingMode: modes.drawingMode })}
        {...(args.toolbar.drawingController === undefined
          ? {}
          : { drawingController: args.toolbar.drawingController })}
        designReviewPanelOpen={args.designReview.panel.open}
        highlighterMode={modes.highlighterMode}
        quickEditDocumentMode={modes.quickEditDocumentMode}
        quickEditMode={modes.quickEditMode}
        screenshotMode={modes.screenshotMode}
        {...(modes.videoRecordingMode === undefined
          ? {}
          : { videoRecordingMode: modes.videoRecordingMode })}
        {...(args.toolbar.videoRecording ? { videoRecording: args.toolbar.videoRecording } : {})}
        onToggleVideoRecordingMode={handleToggleVideoRecordingMode}
        pinToTab={Boolean(args.toolbar.pinToTab || modes.videoRecordingMode)}
        pinToTabAvailable={args.toolbar.pinToTabAvailable}
        pinToTabLocked={
          modes.videoRecordingMode ||
          (args.toolbar.captureAction === 'scenario' && modes.screenshotMode)
        }
        onCaptureActionChange={args.toolbar.setCaptureAction}
        onDisableAiPickMode={args.toolbar.aiController.handleDisableAiPickMode}
        onToggleDesignReviewPanel={args.designReview.panel.toggle}
        onPinToTabChange={args.toolbar.setPinToTab}
        onTakeScreenshot={args.toolbar.handleTakeScreenshot}
        onHide={handleHideToolbar}
        onClearHighlights={modeController.handleClearHighlights}
        onClearPagePreparation={() => clearPagePreparation(args.toolbar, modeController)}
        canClearPagePreparation={args.canClearPagePreparation}
        autoBlur={autoBlur}
        onToggleNavigationLock={modeController.handleToggleNavigationLock}
        timerDelay={args.toolbar.timerDelay}
        onTimerDelayChange={args.toolbar.setTimerDelay}
        currentViewport={args.toolbar.currentViewport}
        onViewportChange={args.toolbar.setCurrentViewport}
        {...(args.toolbar.mutateViewport === undefined
          ? {}
          : { mutateViewport: args.toolbar.mutateViewport })}
        scenario={args.scenarioToolbarProps}
        isCursorMode={args.toolbar.isCursorMode}
        onEnableCursorMode={modeController.handleEnableCursorMode}
        framesCount={args.toolbar.frameCount}
        futureFrameStyle={args.toolbar.futureFrameStyle}
        onFutureFrameEffectModeChange={args.toolbar.setFutureFrameEffectMode}
        {...(args.toolbar.futureFrameCalloutActions === undefined
          ? {}
          : { futureFrameCalloutActions: args.toolbar.futureFrameCalloutActions })}
        {...(args.toolbar.futureFrameStepBadgeActions === undefined
          ? {}
          : { futureFrameStepBadgeActions: args.toolbar.futureFrameStepBadgeActions })}
      />
    </div>
  );
}

export function ContentToolbarShell({ designReview, scenario, toolbar }: ContentToolbarShellProps) {
  const canClearPagePreparation = useSyncExternalStore(
    pagePreparationHistory.subscribe,
    () => pagePreparationHistory.getState().canUndo,
    () => false
  );
  const byClickBlocked = isScenarioByClickBlocked(toolbar.modes);
  const handleDisableScreenshotMode = () =>
    exitScreenshotModeFromUserAction({
      modeController: toolbar.modeController,
      setPinToTab: toolbar.setPinToTab,
    });
  const handleFinishScenario = createFinishScenarioHandler({
    onDisableScreenshotMode: handleDisableScreenshotMode,
    scenarioActions: scenario.actions,
  });
  const handleToggleScreenshotMode = createScreenshotModeToggleHandler({
    modeController: toolbar.modeController,
    onDisableScreenshotMode: handleDisableScreenshotMode,
    scenarioActions: scenario.actions,
  });

  useScenarioByClickBlockSync({
    blocked: byClickBlocked,
    captureMode: scenario.state.scenarioCaptureMode,
    setCaptureMode: scenario.actions.setCaptureMode,
  });

  if (!toolbar.isToolbarVisible) {
    return null;
  }

  const scenarioToolbarProps = buildScenarioToolbarProps({
    blocked: byClickBlocked,
    actions: scenario.actions,
    state: scenario.state,
    onFinishScenario: handleFinishScenario,
  });

  return renderToolbarShell({
    canClearPagePreparation,
    designReview,
    handleToggleScreenshotMode,
    scenarioToolbarProps,
    toolbar,
  });
}
