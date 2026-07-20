import { useEffect, useState } from 'react';
import { createScenarioEditorDeckAiSubmitAction } from '../project/ai';
import type { useScenarioEditorDeckAiState } from '../project/ai';
import { ScenarioEditorDeckAiPanel } from '../project/ai/deck-panel';
import { ScenarioTemplateManager } from '../project/templates';
import { useScenarioCanvasViewport } from '../canvas/viewport-state';
import { ScenarioImageElementEditorMount } from './image-editor';
import {
  createScenarioLayerClipboardText,
  insertScenarioLayerClipboardPayload,
  readScenarioLayerClipboardPayloadFromData,
  writeScenarioLayerClipboardTextToData,
} from './layer-clipboard';
import { ScenarioV3DeckExportDialogMount } from './deck-export-dialog-mount';
import { SCENARIO_EDITOR_MODES, type ScenarioEditorMode } from './presentation/mode';
import type { useScenarioV3EditorState } from './state';
import type { useScenarioV3TemplateState } from './template-state';
import type { ScenarioV3EditorSaveStatus } from './types';
import { resolveScenarioFloatingChromeCanvasInsets } from './floating-chrome/canvas-insets';
import { ScenarioV3Workspace } from './workspace';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;
interface ScenarioV3EditorShellContentProps {
  aiPanelOpen: boolean;
  aiState: ReturnType<typeof useScenarioEditorDeckAiState>;
  audienceOpening: boolean;
  clickIndex: number;
  editingImageElementId: string | null;
  editor: ScenarioV3EditorState;
  elapsedSeconds: number;
  exportDialogOpen: boolean;
  mode: ScenarioEditorMode;
  presentationError: string | null;
  saveStatus?: ScenarioV3EditorSaveStatus | undefined;
  onClickIndexChange: (clickIndex: number) => void;
  onCloseAi: () => void;
  onCloseExport: () => void;
  onCloseImageElement: () => void;
  onEditImageElement: (elementId: string | null) => void;
  onModeChange: (mode: ScenarioEditorMode) => void;
  onOpenAudienceScreen: () => void;
  onOpenExport: () => void;
  onPresentationPositionChange: (position: { clickIndex: number; slideId: string }) => void;
  onToggleAi: () => void;
  templates: ReturnType<typeof useScenarioV3TemplateState>;
}

export function ScenarioV3EditorShellContent(props: ScenarioV3EditorShellContentProps) {
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [timelineHidden, setTimelineHidden] = useState(false);
  const inspectorTool = props.exportDialogOpen ? 'export' : null;
  useScenarioLayerClipboard({
    editor: props.editor,
    enabled: props.mode === SCENARIO_EDITOR_MODES.edit,
  });

  return (
    <div
      data-ui="scenario.v3-shell.root"
      className="sniptale-extension-surface relative flex h-full min-h-0 flex-col overflow-hidden
        bg-[var(--sniptale-color-surface-canvas)] text-[var(--sniptale-color-text-primary)]"
    >
      <ScenarioV3OperationError message={props.editor.operationError ?? props.presentationError} />
      <ScenarioV3TemplatePanel templates={props.templates} />
      <ScenarioV3WorkspaceMount
        inspectorTool={inspectorTool}
        props={props}
        templatePickerOpen={templatePickerOpen}
        timelineHidden={timelineHidden}
        onTemplatePickerOpenChange={setTemplatePickerOpen}
        onTimelineHiddenChange={setTimelineHidden}
      />
      <ScenarioV3AiPanelMount
        aiState={props.aiState}
        editor={props.editor}
        onClose={props.onCloseAi}
        open={props.aiPanelOpen}
        templates={props.templates.templates}
      />
      <ScenarioV3DeckExportDialogMount
        editor={props.editor}
        onClose={props.onCloseExport}
        open={props.exportDialogOpen}
      />
      <ScenarioImageElementEditorMount
        editor={props.editor}
        elementId={props.editingImageElementId}
        onClose={props.onCloseImageElement}
      />
    </div>
  );
}
function ScenarioV3WorkspaceMount(args: {
  inspectorTool: 'export' | null;
  props: ScenarioV3EditorShellContentProps;
  templatePickerOpen: boolean;
  timelineHidden: boolean;
  onTemplatePickerOpenChange: (open: boolean | ((open: boolean) => boolean)) => void;
  onTimelineHiddenChange: (hidden: boolean) => void;
}) {
  return <ScenarioV3Workspace {...useScenarioWorkspaceProps(args)} />;
}
function useScenarioWorkspaceProps(args: {
  inspectorTool: 'export' | null;
  props: ScenarioV3EditorShellContentProps;
  templatePickerOpen: boolean;
  timelineHidden: boolean;
  onTemplatePickerOpenChange: (open: boolean | ((open: boolean) => boolean)) => void;
  onTimelineHiddenChange: (hidden: boolean) => void;
}) {
  const { props } = args;
  const canvasViewport = useScenarioCanvasViewport(props.editor.selectedSlide.canvas, {
    fitInsets: (viewport) =>
      resolveScenarioFloatingChromeCanvasInsets(viewport, { timelineHidden: args.timelineHidden }),
  });
  const clearInspectorTool = () => props.onCloseExport();
  const toggleTemplatePicker = () => {
    props.onCloseExport();
    args.onTemplatePickerOpenChange((open) => !open);
  };
  const createTemplateSlide = (template: Parameters<typeof props.templates.createSlide>[0]) => {
    props.templates.createSlide(template);
    args.onTemplatePickerOpenChange(false);
  };
  return {
    aiPanelOpen: props.aiPanelOpen,
    audienceOpening: props.audienceOpening,
    canvasViewport,
    clickIndex: props.clickIndex,
    editor: props.editor,
    elapsedSeconds: props.elapsedSeconds,
    inspectorTool: args.inspectorTool,
    mode: props.mode,
    saveStatus: props.saveStatus,
    templatePickerOpen: args.templatePickerOpen,
    templates: { ...props.templates, createSlide: createTemplateSlide },
    timelineHidden: args.timelineHidden,
    onClearInspectorTool: clearInspectorTool,
    onClickIndexChange: props.onClickIndexChange,
    onEditImageElement: props.onEditImageElement,
    onModeChange: props.onModeChange,
    onOpenAudienceScreen: props.onOpenAudienceScreen,
    onOpenExport: props.onOpenExport,
    onPresentationPositionChange: props.onPresentationPositionChange,
    onTimelineHiddenChange: args.onTimelineHiddenChange,
    onToggleAi: props.onToggleAi,
    onToggleTemplatePicker: toggleTemplatePicker,
  };
}
function useScenarioLayerClipboard(args: { editor: ScenarioV3EditorState; enabled: boolean }) {
  useEffect(() => {
    if (!args.enabled) {
      return undefined;
    }
    const { copy, paste } = createScenarioLayerClipboardHandlers(args.editor);
    window.addEventListener('copy', copy);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('copy', copy);
      window.removeEventListener('paste', paste);
    };
  }, [args.editor, args.enabled]);
}
function createScenarioLayerClipboardHandlers(editor: ScenarioV3EditorState) {
  const copy = (event: ClipboardEvent) => {
    if (isEditableClipboardTarget(event.target) || !editor.selectedElementId) {
      return;
    }
    const text = createScenarioLayerClipboardText({
      selectedElementIds: [editor.selectedElementId],
      slide: editor.selectedSlide,
    });
    if (text && writeScenarioLayerClipboardTextToData(event.clipboardData, text)) {
      event.preventDefault();
    }
  };
  const paste = (event: ClipboardEvent) => {
    if (isEditableClipboardTarget(event.target)) {
      return;
    }
    pasteScenarioLayerClipboard(event, editor);
  };
  return { copy, paste };
}
function pasteScenarioLayerClipboard(event: ClipboardEvent, editor: ScenarioV3EditorState) {
  const payload = readScenarioLayerClipboardPayloadFromData(event.clipboardData);
  if (!payload) {
    return;
  }
  const result = insertScenarioLayerClipboardPayload({
    payload,
    project: editor.project,
    targetSlideId: editor.selectedSlide.id,
  });
  const selectedElementId = result?.pastedElementIds.at(-1);
  if (!result || !selectedElementId) {
    return;
  }
  event.preventDefault();
  editor.projectActions.applyProject(result.project);
  editor.elementActions.selectElement(selectedElementId);
}
function isEditableClipboardTarget(target: EventTarget | null): boolean {
  const element =
    target instanceof HTMLElement
      ? target
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

  return Boolean(
    element?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
  );
}
function ScenarioV3AiPanelMount(props: {
  aiState: ReturnType<typeof useScenarioEditorDeckAiState>;
  editor: ScenarioV3EditorState;
  onClose: () => void;
  open: boolean;
  templates: ReturnType<typeof useScenarioV3TemplateState>['templates'];
}) {
  if (!props.open) {
    return null;
  }

  return (
    <ScenarioEditorDeckAiPanel
      aiState={props.aiState}
      onClose={props.onClose}
      onSubmit={createScenarioEditorDeckAiSubmitAction({
        aiState: props.aiState,
        applyProject: props.editor.projectActions.applyProject,
        getCurrentProject: props.editor.getCurrentProject,
        project: props.editor.project,
        selectedSlideId: props.editor.selectedSlide.id,
        templates: props.templates,
      })}
      project={props.editor.project}
      selectedElement={props.editor.selectedElement}
      selectedSlide={props.editor.selectedSlide}
    />
  );
}

function ScenarioV3OperationError(props: { message: string | null }) {
  if (!props.message) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute left-1/2 top-14 z-30 w-[min(420px,calc(100%-2rem))] -translate-x-1/2">
      <div
        className="rounded-[12px] border
          border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_34%,var(--sniptale-color-border-soft)_66%)]
          bg-[var(--sniptale-color-surface-panel)] px-4 py-3 text-sm
          text-[var(--sniptale-color-text-primary)] shadow-sm"
        data-ui="scenario.editor.v3-operation-error"
        role="alert"
      >
        {props.message}
      </div>
    </div>
  );
}

function ScenarioV3TemplatePanel(props: {
  templates: ReturnType<typeof useScenarioV3TemplateState>;
}) {
  return (
    <div className="absolute right-4 top-14 z-20 grid gap-3">
      {props.templates.panelMode === 'manager' ? (
        <ScenarioTemplateManager
          libraries={props.templates.libraries}
          onClose={props.templates.closePanel}
          onDeleteLibrary={props.templates.deleteLibrary}
          onSaveLibrary={props.templates.saveLibrary}
          onToggleLibrary={props.templates.toggleLibrary}
        />
      ) : null}
    </div>
  );
}
