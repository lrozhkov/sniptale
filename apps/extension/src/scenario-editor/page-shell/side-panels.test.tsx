// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioProjectV3,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import type { ScenarioCanvasViewportController } from '../canvas/viewport-state';
import { ScenarioV3LeftInspector, ScenarioV3RightRail } from './side-panels';
import type { useScenarioV3EditorState } from './state';
import { createScenarioV3TemplateStateStub } from './test-support';

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

it('clears active inspector tools before selecting layers and slides', () => {
  const editor = createEditor();
  const onClearInspectorTool = vi.fn();

  act(() => {
    root?.render(
      <>
        <ScenarioV3LeftInspector
          canvasControls={createCanvasControls()}
          editor={editor}
          inspectorTool={null}
          onClearInspectorTool={onClearInspectorTool}
          onEditImageElement={vi.fn()}
          onOpenExport={vi.fn()}
        />
        <ScenarioV3RightRail
          assets={{}}
          editor={editor}
          onClearInspectorTool={onClearInspectorTool}
          onCreateTemplateSlide={vi.fn()}
          onOpenTemplateManager={vi.fn()}
          onToggleTemplatePicker={vi.fn()}
          templatePickerOpen={false}
          templates={[]}
        />
      </>
    );
  });
  act(() => {
    container
      ?.querySelector('[data-ui="scenario.inspector.layers"]')
      ?.querySelector<HTMLButtonElement>('button')
      ?.click();
    container
      ?.querySelectorAll<HTMLButtonElement>(
        '[data-ui="scenario.slide-rail.panel"] button[aria-pressed]'
      )?.[1]
      ?.click();
  });

  expect(onClearInspectorTool).toHaveBeenCalledTimes(2);
  expect(editor.elementActions.selectElement).toHaveBeenCalledWith('text-1');
  expect(editor.slideActions.selectSlide).toHaveBeenCalledWith('slide-2');
});

it('opens template selection from the right rail and creates slides from layouts', () => {
  const editor = createEditor();
  const templates = createScenarioV3TemplateStateStub();
  const onToggleTemplatePicker = vi.fn();

  act(() => {
    root?.render(
      <ScenarioV3RightRail
        assets={{}}
        editor={editor}
        onClearInspectorTool={vi.fn()}
        onCreateTemplateSlide={templates.createSlide}
        onOpenTemplateManager={templates.openManager}
        onToggleTemplatePicker={onToggleTemplatePicker}
        templatePickerOpen
        templates={templates.templates}
      />
    );
  });
  act(() => {
    clickByLabel('Макеты');
    findButton('Добавить')?.click();
  });

  expect(onToggleTemplatePicker).toHaveBeenCalledTimes(1);
  expect(templates.createSlide).toHaveBeenCalledWith(
    expect.objectContaining({ templateId: 'screenshot-focus' })
  );
});

function createEditor(): ScenarioV3EditorState {
  const project = createScenarioProjectV3('Side panels');
  const firstSlide = {
    ...project.slides[0]!,
    elements: [{ ...createScenarioTextElement({ text: 'Layer' }), id: 'text-1' }],
    id: 'slide-1',
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

function createCanvasControls(): ScenarioCanvasViewportController['controls'] {
  return {
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
  };
}

function findButton(text: string) {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (button) => button.textContent?.trim() === text
  );
}

function clickByLabel(label: string) {
  container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
}
