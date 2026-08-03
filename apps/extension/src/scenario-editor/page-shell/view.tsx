import { useCallback, useEffect, useState } from 'react';
import { useScenarioEditorDeckAiState } from '../project/ai';
import { listBundledScenarioTemplates } from '../../features/scenario/project/v3/templates';
import { resolveEditModeClickIndex } from './click-preview';
import { SCENARIO_EDITOR_MODES, type ScenarioEditorMode } from './presentation/mode';
import { ScenarioV3EditorShellContent } from './shell-content';
import { useScenarioV3EditorState } from './state';
import type { ScenarioV3EditorShellProps } from './types';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;

export function ScenarioV3EditorShell(props: ScenarioV3EditorShellProps) {
  const editor = useScenarioV3EditorState(props);
  const aiState = useScenarioEditorDeckAiState();
  const ui = useScenarioShellUiState(editor);

  return (
    <ScenarioV3EditorShellContent
      {...createScenarioShellContentProps({
        aiState,
        editor,
        modeChange: ui.setMode,
        props,
        templates: listBundledScenarioTemplates(),
        ui,
      })}
    />
  );
}

function createScenarioShellContentProps(args: {
  aiState: ReturnType<typeof useScenarioEditorDeckAiState>;
  editor: ScenarioV3EditorState;
  modeChange: (mode: ScenarioEditorMode) => void;
  props: ScenarioV3EditorShellProps;
  templates: ReturnType<typeof listBundledScenarioTemplates>;
  ui: ReturnType<typeof useScenarioShellUiState>;
}) {
  return {
    aiPanelOpen: args.ui.aiPanelOpen,
    aiState: args.aiState,
    clickIndex: args.ui.clickIndex,
    editingImageElementId: args.ui.editingImageElementId,
    editor: args.editor,
    exportDialogOpen: args.ui.exportDialogOpen,
    mode: args.ui.mode,
    saveStatus: args.props.saveStatus,
    templates: args.templates,
    onClickIndexChange: args.ui.setClickIndex,
    onCloseAi: args.ui.closeAiPanel,
    onCloseExport: args.ui.closeExportDialog,
    onCloseImageElement: args.ui.closeImageElement,
    onEditImageElement: args.ui.setEditingImageElementId,
    onModeChange: args.modeChange,
    onOpenExport: args.ui.openExportDialog,
    onToggleAi: args.ui.toggleAiPanel,
  };
}

function useScenarioShellUiState(editor: ScenarioV3EditorState) {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [mode, setMode] = useState<ScenarioEditorMode>(SCENARIO_EDITOR_MODES.edit);
  const [clickIndex, setClickIndex] = useScenarioV3ClickPreview(editor, mode);
  const [editingImageElementId, setEditingImageElementId] = useState<string | null>(null);
  return {
    aiPanelOpen,
    clickIndex,
    closeAiPanel: useCallback(() => setAiPanelOpen(false), []),
    closeExportDialog: useCallback(() => setExportDialogOpen(false), []),
    closeImageElement: useCallback(() => setEditingImageElementId(null), []),
    editingImageElementId,
    exportDialogOpen,
    mode,
    openExportDialog: useCallback(() => setExportDialogOpen(true), []),
    setClickIndex,
    setEditingImageElementId,
    setMode,
    toggleAiPanel: useCallback(() => setAiPanelOpen((open) => !open), []),
  };
}

function useScenarioV3ClickPreview(editor: ScenarioV3EditorState, mode: ScenarioEditorMode) {
  const [clickIndex, setClickIndex] = useState(() => editor.selectedSlide.clicks.initialIndex);
  const selectedSlideClickCount = editor.selectedSlide.clicks.count;
  const selectedSlideId = editor.selectedSlide.id;
  const selectedSlideInitialIndex = editor.selectedSlide.clicks.initialIndex;

  useEffect(() => {
    setClickIndex(Math.min(selectedSlideClickCount, Math.max(0, selectedSlideInitialIndex)));
  }, [selectedSlideClickCount, selectedSlideId, selectedSlideInitialIndex]);

  useEffect(() => {
    if (mode !== SCENARIO_EDITOR_MODES.edit) {
      return;
    }

    setClickIndex((currentClickIndex) =>
      resolveEditModeClickIndex({
        clickIndex: currentClickIndex,
        selectedElement: editor.selectedElement,
        slide: editor.selectedSlide,
      })
    );
  }, [
    editor.selectedElement,
    editor.selectedSlide,
    mode,
    selectedSlideClickCount,
    selectedSlideId,
  ]);

  return [clickIndex, setClickIndex] as const;
}
