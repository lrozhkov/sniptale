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
    activeInsertKind: null,
    assets: new Map(),
    canvasControls: createFloatingCanvasControls(canvasControlOverrides),
    clickIndex: 0,
    editor,
    inspectorTool: null,
    mode: SCENARIO_EDITOR_MODES.edit,
    timelineHidden: false,
    templatePickerOpen: false,
    templates: createFloatingTemplateState(),
    onClearInspectorTool: vi.fn(),
    onActiveInsertKindChange: vi.fn(),
    onClickIndexChange: vi.fn(),
    onEditImageElement: vi.fn(),
    onModeChange: vi.fn(),
    onOpenExport: vi.fn(),
    onPresentationPositionChange: vi.fn(),
    onTimelineHiddenChange: vi.fn(),
    onToggleAi: vi.fn(),
    onToggleTemplatePicker: vi.fn(),
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

function createFloatingTemplateState(): ScenarioV3FloatingChromeProps['templates'] {
  return {
    closePanel: vi.fn(),
    createSlide: vi.fn(),
    deleteLibrary: vi.fn(),
    libraries: [],
    openManager: vi.fn(),
    panelMode: null,
    saveLibrary: vi.fn(),
    templates: [],
    toggleLibrary: vi.fn(),
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
    projectActions: { applyProject: vi.fn(), updatePresentation: vi.fn() },
    selectedElement: null,
    selectedElementId: null,
    selectedSlide: slide,
    slideActions: createScenarioV3SlideActionStubs(),
  };
}
