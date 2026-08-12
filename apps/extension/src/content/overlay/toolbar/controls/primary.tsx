import { ToolbarModeButtons } from './modes';
import type { useToolbarViewModel } from '../state/view-model';
import type { ToolbarPageEditingMode, ToolbarProps } from '../types';

type ToolbarViewModel = ReturnType<typeof useToolbarViewModel>;

export function ToolbarPrimaryControls(props: {
  toolbarProps: ToolbarProps;
  viewModel: ToolbarViewModel;
}) {
  const { toolbarProps, viewModel } = props;
  const modeButtonProps = {
    isCursorMode: toolbarProps.isCursorMode ?? true,
    aiPickMode: toolbarProps.aiPickMode ?? false,
    designReviewMode: toolbarProps.designReviewMode ?? false,
    drawingMode: toolbarProps.drawingMode ?? false,
    videoRecordingMode: toolbarProps.videoRecordingMode ?? false,
    videoRecordingModeLocked:
      toolbarProps.videoRecordingMode === true &&
      toolbarProps.videoRecording?.state.phase !== 'idle' &&
      toolbarProps.videoRecording?.state.phase !== 'error',
    compactMenus: viewModel.derivedState.compactMenus,
    displayMode: viewModel.derivedState.displayMode,
    sidebarVisible: toolbarProps.scenario?.sidebarVisible ?? false,
    quickEditDocumentMode: viewModel.quickEditDocumentMode,
    quickEditMode: viewModel.quickEditMode,
    highlighterMode: viewModel.highlighterMode,
    toolbarMenuState: viewModel.toolbarMenuState,
    pinToTab: toolbarProps.pinToTab ?? false,
    pinToTabAvailable: toolbarProps.pinToTabAvailable ?? false,
    pinToTabLocked: toolbarProps.pinToTabLocked ?? false,
    onPinToTabChange: toolbarProps.onPinToTabChange ?? (() => undefined),
    onHide: toolbarProps.onHide,
    ...(toolbarProps.onClearPagePreparation === undefined
      ? {}
      : { onClearPagePreparation: toolbarProps.onClearPagePreparation }),
    canClearPagePreparation: toolbarProps.canClearPagePreparation ?? false,
    ...(typeof viewModel.pendingInteractionMode === 'undefined'
      ? {}
      : { pendingMode: viewModel.pendingInteractionMode }),
    ...(typeof toolbarProps.onEnableCursorMode === 'undefined'
      ? {}
      : { onEnableCursorMode: toolbarProps.onEnableCursorMode }),
    ...(typeof toolbarProps.onDisableAiPickMode === 'undefined'
      ? {}
      : { onDisableAiPickMode: toolbarProps.onDisableAiPickMode }),
    onSelectPageEditingMode: (mode: ToolbarPageEditingMode) => {
      void viewModel.toggleMode(`page-editing:${mode}`);
    },
    onToggleDesignReview: () => toolbarProps.onToggleDesignReviewMode(!viewModel.designReviewMode),
    onToggleDrawing: () => toolbarProps.onToggleDrawingMode?.(!(toolbarProps.drawingMode ?? false)),
    onToggleQuickEdit: () => void viewModel.toggleMode('quickedit'),
    onToggleHighlighter: () => {
      void viewModel.toggleMode('highlighter');
    },
    onToggleVideoRecording: (activationEvent?: Event) =>
      toolbarProps.onToggleVideoRecordingMode?.(
        !(toolbarProps.videoRecordingMode ?? false),
        activationEvent
      ),
  };

  return <ToolbarModeButtons {...modeButtonProps} />;
}
