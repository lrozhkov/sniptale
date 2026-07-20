import { ToolbarModeButtons } from './modes';
import type { useToolbarViewModel } from '../state/view-model';
import type { ToolbarProps } from '../types';

type ToolbarViewModel = ReturnType<typeof useToolbarViewModel>;

export function ToolbarPrimaryControls(props: {
  toolbarProps: ToolbarProps;
  viewModel: ToolbarViewModel;
}) {
  const { toolbarProps, viewModel } = props;
  const modeButtonProps = {
    isCursorMode: toolbarProps.isCursorMode ?? true,
    aiPickMode: toolbarProps.aiPickMode ?? false,
    compactMenus: viewModel.derivedState.compactMenus,
    displayMode: viewModel.derivedState.displayMode,
    sidebarVisible: toolbarProps.scenario?.sidebarVisible ?? false,
    quickEditDocumentMode: viewModel.quickEditDocumentMode,
    quickEditMode: viewModel.quickEditMode,
    highlighterMode: viewModel.highlighterMode,
    toolbarMenuState: viewModel.toolbarMenuState,
    ...(typeof viewModel.pendingInteractionMode === 'undefined'
      ? {}
      : { pendingMode: viewModel.pendingInteractionMode }),
    ...(typeof toolbarProps.pageStyleInspector === 'undefined'
      ? {}
      : {
          pageStyleInspectorOpen: toolbarProps.pageStyleInspector.open,
          onTogglePageStyleInspector: toolbarProps.pageStyleInspector.onToggle,
        }),
    ...(typeof toolbarProps.onEnableCursorMode === 'undefined'
      ? {}
      : { onEnableCursorMode: toolbarProps.onEnableCursorMode }),
    ...(typeof toolbarProps.onDisableAiPickMode === 'undefined'
      ? {}
      : { onDisableAiPickMode: toolbarProps.onDisableAiPickMode }),
    onAiPickContentStart: toolbarProps.onAiPickContentStart,
    onToggleQuickEditDocumentMode: toolbarProps.onToggleQuickEditDocumentMode,
    onToggleQuickEdit: () => void viewModel.toggleMode('quickedit'),
    onToggleHighlighter: () => {
      void viewModel.toggleMode('highlighter');
    },
  };

  return <ToolbarModeButtons {...modeButtonProps} />;
}
