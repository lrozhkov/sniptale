import { ToolbarCaptureActions } from '../capture';
import { ToolbarScenarioControls } from '../scenario/controls';
import type { useToolbarViewModel } from '../state/view-model';
import type { ToolbarProps } from '../types';
import { ToolbarUtilityButtons } from './utilities';

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

function shouldShowCompactScenarioControls(
  toolbarProps: ToolbarProps,
  viewModel: ToolbarViewModel,
  interactionMode: ReturnType<typeof resolveEffectiveInteractionMode>
): boolean {
  return (
    viewModel.screenshotMode &&
    viewModel.captureAction === 'scenario' &&
    Boolean(toolbarProps.scenario) &&
    interactionMode === 'cursor'
  );
}

function resolveScenarioCaptureProps(
  toolbarProps: ToolbarProps,
  viewModel: ToolbarViewModel
): ToolbarProps['scenario'] | undefined {
  return viewModel.screenshotMode && viewModel.captureAction === 'scenario'
    ? toolbarProps.scenario
    : undefined;
}

function renderCompactScenarioControls(args: {
  showScenarioControls: boolean;
  toolbarProps: ToolbarProps;
  viewModel: ToolbarViewModel;
}) {
  return args.showScenarioControls ? (
    <ToolbarScenarioControls
      compactMenus={args.viewModel.derivedState.compactMenus}
      displayMode={args.viewModel.derivedState.displayMode}
      scenario={args.toolbarProps.scenario!}
      showWorkflowActions={false}
      toolbarMenuState={args.viewModel.toolbarMenuState}
    />
  ) : null;
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
    captureAction: args.viewModel.captureAction,
    compactMenus: args.viewModel.derivedState.compactMenus,
    displayMode: args.viewModel.derivedState.displayMode,
    pinToTab: args.toolbarProps.pinToTab ?? false,
    pinToTabLocked: args.toolbarProps.pinToTabLocked ?? false,
    onCompactMenusChange: args.viewModel.derivedState.setCompactMenus,
    onDisplayModeChange: args.viewModel.derivedState.setDisplayMode,
    onPinToTabChange: args.toolbarProps.onPinToTabChange ?? (() => undefined),
    onCaptureActionChange: args.viewModel.setCaptureAction,
    onClose: args.toolbarProps.onHide,
    onDisableScreenshotMode: () => {
      void args.viewModel.toggleMode('screenshot');
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
  const showScenarioControls = shouldShowCompactScenarioControls(
    props.toolbarProps,
    props.viewModel,
    interactionMode
  );
  const scenarioCaptureProps = resolveScenarioCaptureProps(props.toolbarProps, props.viewModel);

  return {
    interactionMode,
    showScenarioControls,
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
  const { captureActionProps, interactionMode, showScenarioControls } =
    createSecondaryControlsRenderState(props);

  return (
    <>
      {renderCompactScenarioControls({ showScenarioControls, toolbarProps, viewModel })}

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
