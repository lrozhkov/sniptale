// @vitest-environment jsdom

import { act, createRef, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import {
  createScenarioProjectV3,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioCanvasViewportController } from '../canvas/viewport-state';
import { SCENARIO_EDITOR_MODES } from './presentation/mode';
import { ScenarioV3Workspace } from './workspace';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createCanvasSelectionProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Canvas selection');
  return {
    ...project,
    slides: [
      {
        ...project.slides[0]!,
        elements: [
          {
            ...createScenarioTextElement({
              name: 'Canvas note',
              text: 'Canvas body',
            }),
            id: 'text-1',
          },
        ],
        id: 'slide-1',
        title: 'Intro',
      },
    ],
  };
}

function CanvasSelectionHarness() {
  const project = useMemo(createCanvasSelectionProject, []);
  const editor = useCanvasSelectionEditor(project);

  return (
    <ScenarioV3Workspace
      canvasViewport={createViewportController()}
      clickIndex={0}
      editor={editor}
      inspectorTool={null}
      mode={SCENARIO_EDITOR_MODES.edit}
      onToggleAi={vi.fn()}
      onOpenExport={vi.fn()}
      onClickIndexChange={vi.fn()}
      onClearInspectorTool={vi.fn()}
      onEditImageElement={vi.fn()}
      onModeChange={vi.fn()}
    />
  );
}

function useCanvasSelectionEditor(project: ScenarioProjectV3) {
  const slide = project.slides[0]!;
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const selectedElement =
    slide.elements.find((element) => element.id === selectedElementId) ?? null;

  return {
    canRedo: false,
    canUndo: false,
    elementActions: createElementActions(setSelectedElementId),
    elements: slide.elements,
    history: {
      redo: vi.fn(),
      undo: vi.fn(),
    },
    operationError: null,
    project,
    projectActions: {
      applyProject: vi.fn(),
      commitAggregateMutation: vi.fn(),
      getCurrentProject: () => project,
    },
    selectedElement,
    selectedElementId,
    selectedSlide: slide,
    slideActions: createSlideActions(),
  } satisfies Parameters<typeof ScenarioV3Workspace>[0]['editor'];
}

function createElementActions(selectElement: (id: string | null) => void) {
  return {
    deleteElement: vi.fn(),
    insertElement: vi.fn(),
    insertImageFile: vi.fn(),
    selectElement,
    selectSlideSurface: () => selectElement(null),
    updateElement: vi.fn(),
  };
}

function createSlideActions() {
  return {
    addSlide: vi.fn(),
    deleteSlide: vi.fn(),
    duplicateSlide: vi.fn(),
    moveSlide: vi.fn(),
    replaceSelectedSlide: vi.fn(),
    selectSlide: vi.fn(),
    updateSlide: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('opens element parameters from a canvas pointer selection', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<CanvasSelectionHarness />);
  });
  act(() => {
    getElementOverlay().dispatchEvent(pointerEvent('pointerdown', 10, 12));
  });

  expect(container.querySelector('[role="tablist"]')).toBeNull();
  expect(container.querySelector('[data-ui="scenario.inspector.panel"]')?.textContent).toContain(
    translate('scenario.editor.opacity')
  );
});

function createViewportController(): ScenarioCanvasViewportController {
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

function getElementOverlay(): HTMLButtonElement {
  const overlay = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.canvas.element-overlay"]'
  );
  if (!overlay) {
    throw new Error('Expected scenario canvas element overlay');
  }

  return overlay;
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  return new PointerEvent(type, { bubbles: true, clientX, clientY });
}
