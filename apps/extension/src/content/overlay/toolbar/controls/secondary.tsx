import { ToolbarCaptureActions } from '../capture';
import type { useToolbarViewModel } from '../state/view-model';
import type { ToolbarProps } from '../types';
import { ToolbarUtilityButtons } from './utilities';
import { ToolbarDesignReviewControls } from './design-review';

type ToolbarViewModel = ReturnType<typeof useToolbarViewModel>;

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
    framesCount: args.toolbarProps.framesCount ?? 0,
    navigationLockEnabled: args.viewModel.derivedState.navigationLockEnabled,
    lockDisabled: args.viewModel.derivedState.lockDisabled,
    toggleNavigationLock: args.viewModel.derivedState.toggleNavigationLock,
    onClearHighlights: args.toolbarProps.onClearHighlights,
    toolbarMenuState: args.viewModel.toolbarMenuState,
    compactMenus: args.viewModel.derivedState.compactMenus,
    displayMode: args.viewModel.derivedState.displayMode,
    sidebarVisible: args.toolbarProps.scenario?.sidebarVisible ?? false,
    ...(args.toolbarProps.autoBlur === undefined ? {} : { autoBlur: args.toolbarProps.autoBlur }),
  };
}

function createCaptureActionProps(args: {
  onViewportChange: (viewport: { width: number; height: number } | null) => void;
  scenarioCaptureProps: ToolbarProps['scenario'] | undefined;
  toolbarProps: ToolbarProps;
  viewModel: ToolbarViewModel;
}) {
  return {
    screenshotMode: args.viewModel.screenshotMode,
    isLoading: args.viewModel.derivedState.isLoading,
    captureAction: args.viewModel.capture.action,
    compactMenus: args.viewModel.derivedState.compactMenus,
    displayMode: args.viewModel.derivedState.displayMode,
    pinToTab: args.toolbarProps.pinToTab ?? false,
    pinToTabAvailable: args.toolbarProps.pinToTabAvailable ?? false,
    pinToTabLocked: args.toolbarProps.pinToTabLocked ?? false,
    onCompactMenusChange: args.viewModel.derivedState.setCompactMenus,
    onDisplayModeChange: args.viewModel.derivedState.setDisplayMode,
    onPinToTabChange: args.toolbarProps.onPinToTabChange ?? (() => undefined),
    onCaptureActionChange: args.viewModel.capture.setAction,
    onClose: args.toolbarProps.onHide,
    onDisableScreenshotMode: (activationEvent?: Event) => {
      void args.viewModel.toggleMode('screenshot', activationEvent);
    },
    timerDelay: args.toolbarProps.timerDelay,
    onTimerDelayChange: args.toolbarProps.onTimerDelayChange,
    currentViewport: args.viewModel.derivedState.currentViewport,
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
