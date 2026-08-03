import { vi } from 'vitest';
import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { SCENARIO_EDITOR_MODES } from '../presentation/mode';
import {
  createScenarioV3ElementActionStubs,
  createScenarioV3SlideActionStubs,
} from '../test-editor-action-stubs.test-support';
import type { ScenarioV3FloatingChromeProps, ScenarioV3FloatingEditor } from './types';

type FloatingPropsOverrides = Omit<Partial<ScenarioV3FloatingChromeProps>, 'canvasControls'> & {
  canvasControls?: Partial<ScenarioV3FloatingChromeProps['canvasControls']>;
};

export function createFloatingProps(
  overrides: FloatingPropsOverrides = {}
): ScenarioV3FloatingChromeProps {
  const project = createScenarioProjectV3('Floating deck');
  const editor = createFloatingEditor(project);
  const { canvasControls: canvasControlOverrides, ...restOverrides } = overrides;

  return {
    assets: new Map(),
    canvasControls: createFloatingCanvasControls(canvasControlOverrides),
    editor,
    inspectorTool: null,
    mode: SCENARIO_EDITOR_MODES.edit,
    onClearInspectorTool: vi.fn(),
    onEditImageElement: vi.fn(),
    onModeChange: vi.fn(),
    onOpenExport: vi.fn(),
    onToggleAi: vi.fn(),
    ...restOverrides,
  };
}

function createFloatingCanvasControls(
  overrides: FloatingPropsOverrides['canvasControls']
): ScenarioV3FloatingChromeProps['canvasControls'] {
  return {
    gridVisible: true,
    magnetEnabled: false,
    navigatorVisible: false,
    onFit: vi.fn(),
    onSetGridVisible: vi.fn(),
    onSetMagnetEnabled: vi.fn(),
    onSetNavigatorVisible: vi.fn(),
    onSetSnapToGrid: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOne: vi.fn(),
    onZoomOut: vi.fn(),
    scale: 0.8,
    snapToGrid: false,
    zoomMode: 'fit',
    ...overrides,
  };
}

function createFloatingEditor(
  project: ReturnType<typeof createScenarioProjectV3>
): ScenarioV3FloatingEditor {
  const slide = project.slides[0]!;
  return {
    canRedo: true,
    canUndo: true,
    elementActions: createScenarioV3ElementActionStubs(),
    elements: slide.elements,
    getCurrentProject: () => project,
    history: { redo: vi.fn(), undo: vi.fn() },
    operationError: null,
    project,
    projectActions: { applyProject: vi.fn() },
    selectedElement: null,
    selectedElementId: null,
    selectedSlide: slide,
    slideActions: createScenarioV3SlideActionStubs(),
  };
}
