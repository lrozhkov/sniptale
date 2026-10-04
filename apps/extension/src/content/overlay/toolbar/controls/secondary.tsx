import { ToolbarCaptureActions } from '../capture';
import type { useToolbarViewModel } from '../state/view-model';
import type { ToolbarProps } from '../types';
import { ToolbarUtilityButtons } from './utilities';
import { ToolbarDesignReviewControls } from './design-review';
import { ToolbarDrawingControls } from './drawing';
import { ToolbarVideoRecordingControls } from '../video-recording/controls';

type ToolbarViewModel = ReturnType<typeof useToolbarViewModel>;

export function shouldProjectVideoRecordingControls(
  toolbarProps: {
    aiPickMode?: boolean;
    drawingMode?: boolean;
    videoRecording?: unknown;
    videoRecordingMode?: boolean;
  },
  viewModel: Pick<ToolbarViewModel, 'designReviewMode' | 'highlighterMode' | 'quickEditMode'>
): boolean {
  return Boolean(
    toolbarProps.videoRecordingMode &&
    toolbarProps.videoRecording &&
    !toolbarProps.aiPickMode &&
    !toolbarProps.drawingMode &&
    !viewModel.designReviewMode &&
    !viewModel.highlighterMode &&
    !viewModel.quickEditMode
  );
}

function resolveEffectiveInteractionMode(
  toolbarProps: ToolbarProps,
  viewModel: ToolbarViewModel
): 'cursor' | 'highlighter' | 'quick-edit' | 'ai' {
  if (viewModel.pendingInteractionMode) {
    return viewModel.pendingInteractionMode;
  }

  if (toolbarProps.aiPickMode) {
    return 'ai';
  }

  if (viewModel.quickEditMode) {
    return 'quick-edit';
  }

  if (viewModel.highlighterMode) {
    return 'highlighter';
  }

  if (toolbarProps.isCursorMode === false) {
    return 'quick-edit';
  }

  return 'cursor';
}

function resolveScenarioCaptureProps(
  toolbarProps: ToolbarProps,
  viewModel: ToolbarViewModel
): ToolbarProps['scenario'] | undefined {
  return viewModel.screenshotMode && viewModel.capture.action === 'scenario'
    ? toolbarProps.scenario
    : undefined;
}

function createUtilityButtonsProps(args: {
  interactionMode: ReturnType<typeof resolveEffectiveInteractionMode>;
  toolbarProps: ToolbarProps;
  viewModel: ToolbarViewModel;
}) {
  return {
    screenshotMode: args.viewModel.screenshotMode,
    isCursorMode: args.interactionMode === 'cursor',
    highlighterMode: args.interactionMode === 'highlighter',
    isLoading: args.viewModel.derivedState.isLoading,
    navigationLockEnabled: args.viewModel.derivedState.navigationLockEnabled,
    lockDisabled: args.viewModel.derivedState.lockDisabled,
    toggleNavigationLock: args.viewModel.derivedState.toggleNavigationLock,
    toolbarMenuState: args.viewModel.toolbarMenuState,
    compactMenus: args.viewModel.derivedState.compactMenus,
    displayMode: args.viewModel.derivedState.displayMode,
    freePlacement: args.viewModel.derivedState.freePlacement,
    onFreePlacementChange: args.viewModel.derivedState.setFreePlacement,
    sidebarVisible: args.toolbarProps.scenario?.sidebarVisible ?? false,
    ...(args.toolbarProps.autoBlur === undefined ? {} : { autoBlur: args.toolbarProps.autoBlur }),
    ...(args.toolbarProps.futureFrameStyle === undefined ||
    args.toolbarProps.onFutureFrameEffectModeChange === undefined
      ? {}
      : {
          futureFrameStyle: args.toolbarProps.futureFrameStyle,
          onFutureFrameEffectModeChange: args.toolbarProps.onFutureFrameEffectModeChange,
          ...(args.toolbarProps.futureFrameCalloutActions === undefined
            ? {}
            : { futureFrameCalloutActions: args.toolbarProps.futureFrameCalloutActions }),
          ...(args.toolbarProps.futureFrameStepBadgeActions === undefined
            ? {}
            : { futureFrameStepBadgeActions: args.toolbarProps.futureFrameStepBadgeActions }),
        }),
  };
}

function createCaptureActionProps(args: {
  interactionMode: ReturnType<typeof resolveEffectiveInteractionMode>;
  onViewportChange: (viewport: { width: number; height: number } | null) => void;
  scenarioCaptureProps: ToolbarProps['scenario'] | undefined;
  toolbarProps: ToolbarProps;
  viewModel: ToolbarViewModel;
}) {
  return {
    screenshotMode: args.viewModel.screenshotMode,
    videoRecordingMode: args.toolbarProps.videoRecordingMode ?? false,
    isNavigationMode:
      args.interactionMode === 'cursor' &&
      !args.toolbarProps.drawingMode &&
      !args.viewModel.designReviewMode &&
      !args.toolbarProps.videoRecordingMode,
    autoBlurEnabled: args.toolbarProps.autoBlur?.autoApplyEnabled ?? false,
    isLoading: args.viewModel.derivedState.isLoading,
    captureAction: args.viewModel.capture.action,
    compactMenus: args.viewModel.derivedState.compactMenus,
    displayMode: args.viewModel.derivedState.displayMode,
    freePlacement: args.viewModel.derivedState.freePlacement,
    onFreePlacementChange: args.viewModel.derivedState.setFreePlacement,
    pinToTab: args.toolbarProps.pinToTab ?? false,
    pinToTabAvailable: args.toolbarProps.pinToTabAvailable ?? false,
    pinToTabLocked: args.toolbarProps.pinToTabLocked ?? false,
    onCompactMenusChange: args.viewModel.derivedState.setCompactMenus,
    onDisplayModeChange: args.viewModel.derivedState.setDisplayMode,
    onPinToTabChange: args.toolbarProps.onPinToTabChange ?? (() => undefined),
    onCaptureActionChange: args.viewModel.capture.setAction,
    onClose: args.toolbarProps.onHide,
    ...(args.toolbarProps.onClearPagePreparation === undefined
      ? {}
      : { onClearPagePreparation: args.toolbarProps.onClearPagePreparation }),
    canClearPagePreparation: args.toolbarProps.canClearPagePreparation ?? false,
    resetScope: args.toolbarProps.resetScope ?? 'all',
    onDisableScreenshotMode: (activationEvent?: Event) => {
      void args.viewModel.toggleMode('screenshot', activationEvent);
    },
    timerDelay: args.toolbarProps.timerDelay,
    onTimerDelayChange: args.toolbarProps.onTimerDelayChange,
    ...(args.toolbarProps.windowSize ? { windowSize: args.toolbarProps.windowSize } : {}),
    currentViewport: args.toolbarProps.windowSize?.onlyDuringCapture
      ? args.toolbarProps.windowSize.selection
      : args.viewModel.derivedState.currentViewport,
    onViewportChange: args.onViewportChange,
    toolbarMenuState: args.viewModel.toolbarMenuState,
    onTakeScreenshot: args.toolbarProps.onTakeScreenshot,
    ...(args.toolbarProps.scenario?.onCaptureActionSelected === undefined
      ? {}
      : { onCaptureActionCommitted: args.toolbarProps.scenario.onCaptureActionSelected }),
    ...(args.scenarioCaptureProps === undefined ? {} : { scenario: args.scenarioCaptureProps }),
  };
}

function createSecondaryControlsRenderState(props: {
  toolbarProps: ToolbarProps;
  viewModel: ToolbarViewModel;
  onViewportChange: (viewport: { width: number; height: number } | null) => void;
}) {
  const interactionMode = resolveEffectiveInteractionMode(props.toolbarProps, props.viewModel);
  const scenarioCaptureProps = resolveScenarioCaptureProps(props.toolbarProps, props.viewModel);

  return {
    interactionMode,
    captureActionProps: createCaptureActionProps({
      interactionMode,
      onViewportChange: props.onViewportChange,
      scenarioCaptureProps,
      toolbarProps: props.toolbarProps,
      viewModel: props.viewModel,
    }),
  };
}

export function ToolbarSecondaryControls(props: {
  toolbarProps: ToolbarProps;
  viewModel: ToolbarViewModel;
  onViewportChange: (viewport: { width: number; height: number } | null) => void;
}) {
  const { toolbarProps, viewModel } = props;
  const { captureActionProps, interactionMode } = createSecondaryControlsRenderState(props);

  if (shouldProjectVideoRecordingControls(toolbarProps, viewModel)) {
    const recording = toolbarProps.videoRecording!;
    return (
      <ToolbarVideoRecordingControls
        compactMenus={viewModel.derivedState.compactMenus}
        displayMode={viewModel.derivedState.displayMode}
        freePlacement={viewModel.derivedState.freePlacement}
        onFreePlacementChange={viewModel.derivedState.setFreePlacement}
        onCollapse={toolbarProps.onHide}
        onCompactMenusChange={viewModel.derivedState.setCompactMenus}
        onDisplayModeChange={viewModel.derivedState.setDisplayMode}
        recording={recording}
        toolbarMenuState={viewModel.toolbarMenuState}
      />
    );
  }

  return (
    <>
      {viewModel.designReviewMode ? (
        <ToolbarDesignReviewControls
          compactMenus={viewModel.derivedState.compactMenus}
          displayMode={viewModel.derivedState.displayMode}
          panelOpen={toolbarProps.designReviewPanelOpen ?? false}
          toolbarMenuState={viewModel.toolbarMenuState}
          onTogglePanel={toolbarProps.onToggleDesignReviewPanel ?? (() => undefined)}
        />
      ) : null}
      {toolbarProps.drawingMode && toolbarProps.drawingController ? (
        <ToolbarDrawingControls
          controller={toolbarProps.drawingController}
          displayMode={viewModel.derivedState.displayMode}
        />
      ) : null}
      <ToolbarUtilityButtons
        {...createUtilityButtonsProps({
          interactionMode,
          toolbarProps,
          viewModel,
        })}
      />

      <ToolbarCaptureActions {...captureActionProps} />
    </>
  );
}
