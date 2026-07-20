import { vi } from 'vitest';
import {
  createScenarioProjectV3,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { listBundledScenarioTemplates } from '../../features/scenario/project/v3/templates';
import type { ScenarioV3EditorShellContent } from './shell-content';
import type { useScenarioV3TemplateState } from './template-state';
import {
  createScenarioV3ElementActionStubs,
  createScenarioV3SlideActionStubs,
} from './test-editor-action-stubs.test-support';

export function createScenarioV3TemplateStateStub(): ReturnType<typeof useScenarioV3TemplateState> {
  return {
    closePanel: vi.fn(),
    createSlide: vi.fn(),
    deleteLibrary: vi.fn(),
    libraries: [],
    openManager: vi.fn(),
    panelMode: null,
    saveLibrary: vi.fn(),
    templates: [...listBundledScenarioTemplates()],
    toggleLibrary: vi.fn(),
  };
}

export function createScenarioV3ShellContentEditorStub(args: {
  applyProject?: (project: ScenarioProjectV3) => void;
  project: ScenarioProjectV3;
  selectedElementId?: string | null;
  selectedSlideId?: string;
  selectElement?: (elementId: string) => void;
}): Parameters<typeof ScenarioV3EditorShellContent>[0]['editor'] {
  const selectedSlide =
    args.project.slides.find((slide) => slide.id === args.selectedSlideId) ??
    args.project.slides[0]!;
  const selectedElement =
    selectedSlide.elements.find((element) => element.id === args.selectedElementId) ?? null;

  return {
    canRedo: false,
    canUndo: false,
    elementActions: createScenarioV3ElementActionStubs(
      args.selectElement ? { selectElement: args.selectElement } : {}
    ),
    elements: selectedSlide.elements,
    getCurrentProject: () => args.project,
    history: { redo: vi.fn(), undo: vi.fn() },
    operationError: null,
    project: args.project,
    projectActions: {
      applyProject: args.applyProject ?? vi.fn(),
      updatePresentation: vi.fn(),
    },
    selectedElement,
    selectedElementId: args.selectedElementId ?? null,
    selectedSlide,
    slideActions: createScenarioV3SlideActionStubs(),
  };
}

export function createScenarioV3LayerClipboardProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Clipboard');
  return {
    ...project,
    slides: [
      {
        ...project.slides[0]!,
        elements: [
          {
            ...createScenarioTextElement({
              frame: { height: 80, width: 200, x: 40, y: 60 },
              text: 'Layer',
            }),
            id: 'text-1',
          },
        ],
        id: 'slide-1',
      },
      { ...createScenarioSlide({ title: 'Second' }), elements: [], id: 'slide-2' },
    ],
  };
}

export function createScenarioV3ClipboardData(): Pick<DataTransfer, 'getData' | 'setData'> {
  const values = new Map<string, string>();
  return {
    getData: (type) => values.get(type) ?? '',
    setData: (type, value) => {
      values.set(type, value);
    },
  };
}

export function createScenarioV3ClipboardEvent(
  type: 'copy' | 'paste',
  clipboardData: Pick<DataTransfer, 'getData' | 'setData'>
): ClipboardEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: clipboardData,
  });
  return event;
}

export function clickScenarioCanvasAt(
  container: ParentNode | null,
  clientX: number,
  clientY: number
) {
  const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');
  if (!stage) {
    throw new Error('Missing scenario canvas stage');
  }
  stage.dispatchEvent(createScenarioPointerEvent('pointerdown', clientX, clientY));
  stage.dispatchEvent(createScenarioPointerEvent('pointerup', clientX, clientY));
}

function createScenarioPointerEvent(type: string, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}
