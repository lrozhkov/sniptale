// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioProjectV3,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import type { ScenarioCanvasViewportController } from '../canvas/viewport-state';
import { SCENARIO_EDITOR_MODES } from './presentation/mode';
import { createScenarioV3TemplateStateStub } from './test-support';
import { ScenarioV3Workspace } from './workspace';
import type { useScenarioV3EditorState } from './state';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders presenter and overview modes through the presentation surfaces', () => {
  const presenter = renderWorkspace(SCENARIO_EDITOR_MODES.presenter, { aiPanelOpen: true });
  expect(container?.querySelector('[data-ui="scenario.editor.v3.presenter"]')).not.toBeNull();
  presenter.editor.slideActions.selectSlide('noop');

  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const overview = renderWorkspace(SCENARIO_EDITOR_MODES.overview);
  act(() => {
    container?.querySelector<HTMLButtonElement>('main button')?.click();
  });

  expect(container?.querySelector('[data-ui="scenario.editor.v3.overview"]')).not.toBeNull();
  expect(overview.editor.slideActions.selectSlide).toHaveBeenCalledWith('slide-1');
});

function renderWorkspace(
  mode: (typeof SCENARIO_EDITOR_MODES)[keyof typeof SCENARIO_EDITOR_MODES],
  args: { aiPanelOpen?: boolean } = {}
) {
  const editor = createEditor();
  act(() => {
    root?.render(
      <ScenarioV3Workspace
        aiPanelOpen={args.aiPanelOpen ?? false}
        audienceOpening={false}
        canvasViewport={createCanvasViewport()}
        clickIndex={0}
        editor={editor}
        elapsedSeconds={0}
        inspectorTool={null}
        mode={mode}
        timelineHidden={false}
        onToggleAi={vi.fn()}
        onOpenExport={vi.fn()}
        templates={createScenarioV3TemplateStateStub()}
        templatePickerOpen={false}
        onClearInspectorTool={vi.fn()}
        onClickIndexChange={vi.fn()}
        onEditImageElement={vi.fn()}
        onModeChange={vi.fn()}
        onOpenAudienceScreen={vi.fn()}
        onTimelineHiddenChange={vi.fn()}
        onToggleTemplatePicker={vi.fn()}
        onPresentationPositionChange={vi.fn()}
      />
    );
  });
  return { editor };
}

function createEditor(): ScenarioV3EditorState {
  const project = createScenarioProjectV3('Workspace deck');
  const firstSlide = {
    ...project.slides[0]!,
    elements: [{ ...createScenarioTextElement({ text: 'Build text' }), id: 'text-1' }],
    id: 'slide-1',
    title: 'Intro',
  };
  const nextProject = { ...project, slides: [firstSlide, { ...firstSlide, id: 'slide-2' }] };

  return {
    elementActions: {
      deleteElement: vi.fn(),
      insertElementAtPoint: vi.fn(),
      insertElementFromDrag: vi.fn(),
      insertImageFile: vi.fn(),
      moveElement: vi.fn(),
      selectElement: vi.fn(),
      selectSlideSurface: vi.fn(),
      updateElement: vi.fn(),
    },
    elements: firstSlide.elements,
    canRedo: true,
    canUndo: true,
    history: { redo: vi.fn(), undo: vi.fn() },
    project: nextProject,
    projectActions: { applyProject: vi.fn(), updatePresentation: vi.fn() },
    selectedElementId: null,
    selectedSlide: firstSlide,
    slideActions: {
      addSlide: vi.fn(),
      deleteSlide: vi.fn(),
      duplicateSlide: vi.fn(),
      moveSlide: vi.fn(),
      selectSlide: vi.fn(),
      updateSlide: vi.fn(),
    },
  } as unknown as ScenarioV3EditorState;
}

function createCanvasViewport(): ScenarioCanvasViewportController {
  return {
    controls: {
      gridVisible: true,
      magnetEnabled: false,
      onFit: vi.fn(),
      onSetGridVisible: vi.fn(),
      onSetMagnetEnabled: vi.fn(),
      onSetSnapToGrid: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOne: vi.fn(),
      onZoomOut: vi.fn(),
      scale: 1,
      snapToGrid: false,
      zoomMode: 'fit',
    },
    gridVisible: true,
    magnetEnabled: false,
    scale: 1,
    snapToGrid: false,
    viewportRef: createRef<HTMLDivElement>(),
  };
}
