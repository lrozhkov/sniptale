// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioProjectV3,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import type { ScenarioCanvasViewportController } from '../canvas/viewport-state';
import { SCENARIO_EDITOR_MODES } from './presentation/mode';
import { createScenarioV3TemplateStateStub } from './test-support';
import { ScenarioV3Workspace } from './workspace';
import type { useScenarioV3EditorState } from './state';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;

const assetMocks = vi.hoisted(() => ({
  blobToDataUrl: vi.fn(),
  getScenarioAssetBlob: vi.fn(),
  getScenarioAssetEntry: vi.fn(),
  measureImageBlob: vi.fn(),
}));

vi.mock('../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/data-url')>()),
  blobToDataUrl: assetMocks.blobToDataUrl,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: assetMocks.measureImageBlob,
}));

vi.mock('../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/scenario/store/public')>()),
  getScenarioAssetBlob: assetMocks.getScenarioAssetBlob,
  getScenarioAssetEntry: assetMocks.getScenarioAssetEntry,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createWorkspaceProject(): ReturnType<typeof createScenarioProjectV3> {
  const project = createScenarioProjectV3('Workspace deck');
  const firstSlide = {
    ...project.slides[0]!,
    clicks: { count: 1, initialIndex: 0 },
    elements: [{ ...createScenarioTextElement({ text: 'Build text' }), id: 'text-1' }],
    id: 'slide-1',
    title: 'Intro',
  };
  return { ...project, slides: [firstSlide, { ...firstSlide, id: 'slide-2', title: 'Next' }] };
}

function createEditor(project = createWorkspaceProject()): ScenarioV3EditorState {
  return {
    elementActions: {
      deleteElement: vi.fn(),
      insertImageFile: vi.fn(),
      moveElement: vi.fn(),
      selectElement: vi.fn(),
      selectSlideSurface: vi.fn(),
      updateElement: vi.fn(),
    },
    elements: project.slides[0]!.elements,
    canRedo: true,
    canUndo: true,
    history: { redo: vi.fn(), undo: vi.fn() },
    project,
    projectActions: { applyProject: vi.fn(), updatePresentation: vi.fn() },
    selectedElementId: null,
    selectedSlide: project.slides[0]!,
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
      onZoomOut: vi.fn(),
      onZoomOne: vi.fn(),
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
function renderWorkspace(args: {
  aiPanelOpen?: boolean;
  clickIndex?: number;
  editor?: ScenarioV3EditorState;
  mode: (typeof SCENARIO_EDITOR_MODES)[keyof typeof SCENARIO_EDITOR_MODES];
}) {
  const onClickIndexChange = vi.fn();
  const onEditImageElement = vi.fn();
  const editor = args.editor ?? createEditor();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ScenarioV3Workspace
        aiPanelOpen={args.aiPanelOpen ?? false}
        canvasViewport={createCanvasViewport()}
        clickIndex={args.clickIndex ?? 0}
        editor={editor}
        elapsedSeconds={0}
        inspectorTool={null}
        mode={args.mode}
        timelineHidden={false}
        onToggleAi={vi.fn()}
        onOpenExport={vi.fn()}
        templates={createScenarioV3TemplateStateStub()}
        templatePickerOpen={false}
        audienceOpening={false}
        onClickIndexChange={onClickIndexChange}
        onClearInspectorTool={vi.fn()}
        onEditImageElement={onEditImageElement}
        onModeChange={vi.fn()}
        onOpenAudienceScreen={vi.fn()}
        onTimelineHiddenChange={vi.fn()}
        onToggleTemplatePicker={vi.fn()}
        onPresentationPositionChange={vi.fn()}
      />
    );
  });

  return { editor, onClickIndexChange, onEditImageElement };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  assetMocks.blobToDataUrl.mockResolvedValue('data:image/png;base64,workspace');
  assetMocks.getScenarioAssetBlob.mockResolvedValue(new Blob(['asset'], { type: 'image/png' }));
  assetMocks.getScenarioAssetEntry.mockResolvedValue({ height: 720, width: 1280 });
  assetMocks.measureImageBlob.mockResolvedValue({ height: 720, width: 1280 });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('places inspector, canvas, build timeline, and slide rail in edit mode', () => {
  const { onClickIndexChange } = renderWorkspace({
    mode: SCENARIO_EDITOR_MODES.edit,
  });

  act(() => {
    clickByLabel(`${translate('scenario.editor.buildStep')} 1`);
  });

  expect(container?.querySelector('[data-ui="scenario.inspector.panel"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="scenario.canvas.stage"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="scenario.canvas.floating-controls"]')).toBeNull();
  expect(container?.querySelector('[data-ui="scenario.editor.build-timeline"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="scenario.slide-rail.panel"]')).not.toBeNull();
  expect(onClickIndexChange).toHaveBeenCalledWith(1);

  renderWorkspace({ aiPanelOpen: true, mode: SCENARIO_EDITOR_MODES.edit });

  expect(container?.querySelector('[data-ui="scenario.inspector.panel"]')).toBeNull();
  expect(container?.querySelector('[data-ui="scenario.slide-rail.panel"]')).not.toBeNull();
});

it('advances builds before selecting the next slide in play mode', () => {
  const { editor, onClickIndexChange } = renderWorkspace({
    aiPanelOpen: true,
    mode: SCENARIO_EDITOR_MODES.play,
  });

  act(() => {
    clickByLabel(translate('scenario.editor.next'));
  });

  expect(onClickIndexChange).toHaveBeenCalledWith(1);
  expect(editor.slideActions.selectSlide).not.toHaveBeenCalled();
});

it('rewinds from the first build to the previous slide in play mode', () => {
  const editor = createEditor();
  editor.selectedSlide = editor.project.slides[1]!;
  editor.elements = editor.selectedSlide.elements;
  const { onClickIndexChange } = renderWorkspace({
    clickIndex: 0,
    editor,
    mode: SCENARIO_EDITOR_MODES.play,
  });

  act(() => {
    clickByLabel(translate('scenario.editor.previous'));
  });

  expect(editor.slideActions.selectSlide).toHaveBeenCalledWith('slide-1');
  expect(onClickIndexChange).toHaveBeenCalledWith(1);
});

it('loads stored image assets into the edit canvas render', async () => {
  const project = createWorkspaceProject();
  const imageSlide = {
    ...project.slides[0]!,
    elements: [
      {
        ...createScenarioImageElement({
          assetRef: { assetId: 'asset-1', galleryAssetId: null },
          frame: { height: 240, width: 360, x: 120, y: 140 },
        }),
        id: 'image-1',
      },
    ],
  };
  const editor = createEditor({ ...project, slides: [imageSlide] });

  renderWorkspace({ editor, mode: SCENARIO_EDITOR_MODES.edit });
  expect(container?.querySelector('[data-ui="scenario.canvas.asset-state"]')?.textContent).toBe(
    translate('scenario.editor.loadingAssets')
  );
  await flushReactWork();

  const renderedSvgs = decodeRenderedSvgs();
  expect(renderedSvgs.some((svg) => svg.includes('data:image/png;base64,workspace'))).toBe(true);
  expect(renderedSvgs.length).toBeGreaterThan(1);
  expect(assetMocks.getScenarioAssetBlob).toHaveBeenCalledWith('asset-1');
});

it('routes the selected image canvas edit button to the embedded editor action', () => {
  const project = createWorkspaceProject();
  const imageSlide = {
    ...project.slides[0]!,
    elements: [
      {
        ...createScenarioImageElement({
          assetRef: { assetId: 'asset-1', galleryAssetId: null },
          contentTransform: { scale: 1, x: 0, y: 0 },
          frame: { height: 240, width: 360, x: 120, y: 140 },
        }),
        id: 'image-1',
      },
    ],
  };
  const editor = createEditor({ ...project, slides: [imageSlide] });
  editor.elements = imageSlide.elements;
  editor.selectedElementId = 'image-1';
  editor.selectedSlide = imageSlide;
  const { onEditImageElement } = renderWorkspace({ editor, mode: SCENARIO_EDITOR_MODES.edit });

  act(() => {
    clickByLabel(translate('scenario.editor.editImage'));
  });

  expect(onEditImageElement).toHaveBeenCalledWith('image-1');
});

function clickByLabel(label: string) {
  container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
}
async function flushReactWork() {
  await act(async () => Promise.resolve());
}
function decodeRenderedSvgs() {
  return Array.from(container?.querySelectorAll<HTMLImageElement>('img') ?? []).map((image) => {
    const src = image.getAttribute('src')?.replace(/^data:image\/svg\+xml;charset=utf-8,/, '');
    return decodeURIComponent(src ?? '');
  });
}
