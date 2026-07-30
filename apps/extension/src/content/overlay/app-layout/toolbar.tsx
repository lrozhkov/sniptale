import { useEffect, useRef } from 'react';
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

const logger = createLogger({ namespace: 'ContentToolbarShell' });

type ContentToolbarShellProps = {
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
    onOpenSettings: autoBlurController.open,
    onToggleAutoApply: autoBlurController.toggleAutoApply,
  };
}

function renderToolbarShell(args: {
  handleToggleScreenshotMode: (enabled: boolean) => void;
  scenarioToolbarProps: ReturnType<typeof buildScenarioToolbarProps>;
  toolbar: ContentAppLayoutToolbarProps;
}) {
  const { modeController, modes } = args.toolbar;
  const autoBlur = createToolbarAutoBlurProps(args.toolbar.autoBlurController);
  const handleHideToolbar = () => {
    args.toolbar.setPinnedToolbarVisible(false);
  };

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
        highlighterMode={modes.highlighterMode}
        quickEditDocumentMode={modes.quickEditDocumentMode}
        quickEditMode={modes.quickEditMode}
        screenshotMode={modes.screenshotMode}
        pinToTab={args.toolbar.pinToTab}
        pinToTabAvailable={args.toolbar.pinToTabAvailable}
        pinToTabLocked={args.toolbar.captureAction === 'scenario' && modes.screenshotMode}
        onCaptureActionChange={args.toolbar.setCaptureAction}
        onDisableAiPickMode={args.toolbar.aiController.handleDisableAiPickMode}
        onPinToTabChange={args.toolbar.setPinToTab}
        onTakeScreenshot={args.toolbar.handleTakeScreenshot}
        onHide={handleHideToolbar}
        onClearHighlights={modeController.handleClearHighlights}
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
      />
    </div>
  );
}

export function ContentToolbarShell({ scenario, toolbar }: ContentToolbarShellProps) {
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
    handleToggleScreenshotMode,
    scenarioToolbarProps,
    toolbar,
  });
}
