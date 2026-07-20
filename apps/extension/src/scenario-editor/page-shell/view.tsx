import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { openScenarioAudiencePage } from '../../platform/navigation/extension-pages';
import {
  createScenarioPresentationSession,
  endScenarioPresentationSession,
  updateScenarioPresentationPosition,
} from './presentation/session';
import { translate } from '../../platform/i18n';
import { useScenarioEditorDeckAiState } from '../project/ai';
import { resolveEditModeClickIndex } from './click-preview';
import { SCENARIO_EDITOR_MODES, type ScenarioEditorMode } from './presentation/mode';
import type { ScenarioPresentationPosition } from './presentation/navigation';
import { ScenarioV3EditorShellContent } from './shell-content';
import { useScenarioV3EditorState } from './state';
import { useScenarioV3TemplateState } from './template-state';
import type { ScenarioV3EditorShellProps } from './types';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;

export function ScenarioV3EditorShell(props: ScenarioV3EditorShellProps) {
  const editor = useScenarioV3EditorState(props);
  const templates = useScenarioV3TemplateState(editor);
  const aiState = useScenarioEditorDeckAiState();
  const ui = useScenarioShellUiState(editor);
  const audience = useScenarioAudienceController({
    clickIndex: ui.clickIndex,
    editor,
    saveProject: props.saveProject,
  });
  const handleModeChange = useCallback(
    (nextMode: ScenarioEditorMode) => {
      if (
        ui.mode === SCENARIO_EDITOR_MODES.presenter &&
        nextMode !== SCENARIO_EDITOR_MODES.presenter
      ) {
        audience.endSession();
      }
      ui.setMode(nextMode);
    },
    [audience, ui]
  );

  useEffect(() => audience.endSession, [audience.endSession]);

  return (
    <ScenarioV3EditorShellContent
      {...createScenarioShellContentProps({
        aiState,
        audience,
        editor,
        modeChange: handleModeChange,
        props,
        templates,
        ui,
      })}
    />
  );
}

function createScenarioShellContentProps(args: {
  aiState: ReturnType<typeof useScenarioEditorDeckAiState>;
  audience: ReturnType<typeof useScenarioAudienceController>;
  editor: ScenarioV3EditorState;
  modeChange: (mode: ScenarioEditorMode) => void;
  props: ScenarioV3EditorShellProps;
  templates: ReturnType<typeof useScenarioV3TemplateState>;
  ui: ReturnType<typeof useScenarioShellUiState>;
}) {
  return {
    aiPanelOpen: args.ui.aiPanelOpen,
    aiState: args.aiState,
    audienceOpening: args.audience.opening,
    clickIndex: args.ui.clickIndex,
    editingImageElementId: args.ui.editingImageElementId,
    editor: args.editor,
    elapsedSeconds: args.ui.elapsedSeconds,
    exportDialogOpen: args.ui.exportDialogOpen,
    mode: args.ui.mode,
    presentationError: args.audience.error,
    saveStatus: args.props.saveStatus,
    templates: args.templates,
    onClickIndexChange: args.ui.setClickIndex,
    onCloseAi: args.ui.closeAiPanel,
    onCloseExport: args.ui.closeExportDialog,
    onCloseImageElement: args.ui.closeImageElement,
    onEditImageElement: args.ui.setEditingImageElementId,
    onModeChange: args.modeChange,
    onOpenAudienceScreen: args.audience.openScreen,
    onOpenExport: args.ui.openExportDialog,
    onPresentationPositionChange: args.audience.updatePosition,
    onToggleAi: args.ui.toggleAiPanel,
  };
}

function useScenarioShellUiState(editor: ScenarioV3EditorState) {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [mode, setMode] = useState<ScenarioEditorMode>(SCENARIO_EDITOR_MODES.edit);
  const [clickIndex, setClickIndex] = useScenarioV3ClickPreview(editor, mode);
  const [editingImageElementId, setEditingImageElementId] = useState<string | null>(null);
  const elapsedSeconds = useScenarioPresenterElapsedSeconds(mode);
  return {
    aiPanelOpen,
    clickIndex,
    closeAiPanel: useCallback(() => setAiPanelOpen(false), []),
    closeExportDialog: useCallback(() => setExportDialogOpen(false), []),
    closeImageElement: useCallback(() => setEditingImageElementId(null), []),
    editingImageElementId,
    elapsedSeconds,
    exportDialogOpen,
    mode,
    openExportDialog: useCallback(() => setExportDialogOpen(true), []),
    setClickIndex,
    setEditingImageElementId,
    setMode,
    toggleAiPanel: useCallback(() => setAiPanelOpen((open) => !open), []),
  };
}

function useScenarioAudienceController(args: {
  clickIndex: number;
  editor: ScenarioV3EditorState;
  saveProject?: ScenarioV3EditorShellProps['saveProject'];
}) {
  const { clickIndex, editor, saveProject } = args;
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audienceSessionIdRef = useRef<string | null>(null);
  const audienceProjectUpdatedAtRef = useScenarioAudienceProjectUpdatedAtRef(
    editor.project.updatedAt
  );
  const endSession = useCallback(() => {
    const sessionId = audienceSessionIdRef.current;
    if (!sessionId) return;
    audienceSessionIdRef.current = null;
    void endScenarioPresentationSession(sessionId);
  }, []);
  const updatePosition = useCallback(
    (position: ScenarioPresentationPosition) => {
      const sessionId = audienceSessionIdRef.current;
      if (!sessionId) return;
      void updateScenarioPresentationPosition(
        sessionId,
        position,
        audienceProjectUpdatedAtRef.current
      ).catch(() => setError(translate('scenario.editor.audienceSyncFailed')));
    },
    [audienceProjectUpdatedAtRef]
  );
  const openScreen = useScenarioAudienceScreenOpener({
    audienceProjectUpdatedAtRef,
    audienceSessionIdRef,
    clickIndex,
    editor,
    saveProject,
    setError,
    setOpening,
  });
  return { endSession, error, openScreen, opening, updatePosition };
}

function useScenarioAudienceProjectUpdatedAtRef(projectUpdatedAt: number) {
  const projectUpdatedAtRef = useRef(projectUpdatedAt);
  useEffect(() => {
    projectUpdatedAtRef.current = projectUpdatedAt;
  }, [projectUpdatedAt]);
  return projectUpdatedAtRef;
}

function useScenarioAudienceScreenOpener(args: {
  audienceProjectUpdatedAtRef: MutableRefObject<number>;
  audienceSessionIdRef: MutableRefObject<string | null>;
  clickIndex: number;
  editor: ScenarioV3EditorState;
  saveProject?: ScenarioV3EditorShellProps['saveProject'];
  setError: (error: string | null) => void;
  setOpening: (opening: boolean) => void;
}) {
  const {
    audienceProjectUpdatedAtRef,
    audienceSessionIdRef,
    clickIndex,
    editor,
    saveProject,
    setError,
    setOpening,
  } = args;
  return useCallback(async () => {
    setOpening(true);
    setError(null);
    try {
      const session = await ensureScenarioAudienceSession({
        clickIndex,
        editor,
        saveProject,
        sessionId: audienceSessionIdRef.current,
      });
      audienceSessionIdRef.current = session.sessionId;
      audienceProjectUpdatedAtRef.current = session.projectUpdatedAt;
      await openScenarioAudiencePage(session.projectId, session.sessionId);
    } catch {
      setError(translate('scenario.editor.openAudienceScreenFailed'));
    } finally {
      setOpening(false);
    }
  }, [
    audienceProjectUpdatedAtRef,
    audienceSessionIdRef,
    clickIndex,
    editor,
    saveProject,
    setError,
    setOpening,
  ]);
}

async function ensureScenarioAudienceSession(args: {
  clickIndex: number;
  editor: ScenarioV3EditorState;
  saveProject?: ScenarioV3EditorShellProps['saveProject'];
  sessionId: string | null;
}) {
  const savedProject = (await args.saveProject?.(args.editor.project)) ?? args.editor.project;
  const position = { clickIndex: args.clickIndex, slideId: args.editor.selectedSlide.id };
  const session = args.sessionId
    ? await updateScenarioPresentationPosition(args.sessionId, position, savedProject.updatedAt)
    : await createScenarioPresentationSession(savedProject.id, position, savedProject.updatedAt);
  return {
    projectId: savedProject.id,
    projectUpdatedAt: savedProject.updatedAt,
    sessionId: session.sessionId,
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

function useScenarioPresenterElapsedSeconds(mode: ScenarioEditorMode): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (mode !== SCENARIO_EDITOR_MODES.presenter) {
      return undefined;
    }

    const nextStartedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - nextStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  return elapsedSeconds;
}
