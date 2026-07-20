// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { resolveScenarioStageLayout } from '../../../features/scenario/stage/layout';
import {
  handleQuickEditStagePointerDown,
  resolveStagePoint,
  ScenarioQuickEditStageSurface,
  type ScenarioQuickEditStageSurfaceProps,
} from './stage.surface';

const { createOverlayFromToolMock } = vi.hoisted(() => ({
  createOverlayFromToolMock: vi.fn(),
}));

vi.mock('./capture-stage', () => ({
  ScenarioCaptureStage: () => <div data-testid="capture-stage" />,
}));

vi.mock('./ScenarioQuickEditOverlayLayer', () => ({
  ScenarioQuickEditStageOverlayLayer: () => <div data-testid="overlay-layer" />,
}));

vi.mock('./stage.interactions', () => ({
  createOverlayFromTool: createOverlayFromToolMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    body: 'Body',
    title: 'Step',
  });
}

function createSurfaceProps(): ScenarioQuickEditStageSurfaceProps {
  const step = createStep();
  return {
    activeTool: 'select',
    layout: resolveScenarioStageLayout(step, { width: 1280, height: 720 }),
    onActiveToolChange: vi.fn(),
    onSelectOverlay: vi.fn(),
    onStepChange: vi.fn(),
    selectedOverlayId: null,
    setDragState: vi.fn(),
    stageRef: { current: null },
    step,
  };
}

async function renderSurface(props: ScenarioQuickEditStageSurfaceProps) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ScenarioQuickEditStageSurface {...props} />);
  });
}

function createPointerDownEvent(args: { clientX: number; clientY: number }) {
  return {
    clientX: args.clientX,
    clientY: args.clientY,
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  createOverlayFromToolMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function runResolveStagePointTest() {
  it('resolves and clamps stage coordinates', () => {
    const stage = document.createElement('div');
    Object.defineProperty(stage, 'getBoundingClientRect', {
      value: () => ({ left: 10, top: 20 }),
    });

    expect(resolveStagePoint({ current: stage }, { clientX: 50, clientY: 70 })).toMatchObject({
      x: 40,
      y: 50,
    });
    expect(resolveStagePoint({ current: stage }, { clientX: -100, clientY: 2000 })).toMatchObject({
      x: 0,
      y: 420,
    });
  });
}

function runPanPointerDownTest() {
  it('starts pan drag when pan tool is active', () => {
    const props = createSurfaceProps();
    props.activeTool = 'pan';
    props.stageRef = { current: document.createElement('div') };
    Object.defineProperty(props.stageRef.current, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0 }),
    });

    handleQuickEditStagePointerDown(props, createPointerDownEvent({ clientX: 30, clientY: 40 }));

    expect(props.setDragState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'pan',
        origin: { x: 30, y: 40 },
      })
    );
  });
}

function runCreateOverlayPointerDownTest() {
  it('routes non-select tools through overlay creation seam', () => {
    const props = createSurfaceProps();
    props.activeTool = 'rectangle';
    props.stageRef = { current: document.createElement('div') };
    Object.defineProperty(props.stageRef.current, 'getBoundingClientRect', {
      value: () => ({ left: 10, top: 20 }),
    });

    handleQuickEditStagePointerDown(props, createPointerDownEvent({ clientX: 50, clientY: 70 }));

    expect(createOverlayFromToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTool: 'rectangle',
        stagePoint: { x: 40, y: 50 },
      })
    );
  });
}

function runSelectPointerDownTest() {
  it('clears overlay selection and starts pan session in select mode', () => {
    const props = createSurfaceProps();
    props.stageRef = { current: document.createElement('div') };
    Object.defineProperty(props.stageRef.current, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0 }),
    });

    handleQuickEditStagePointerDown(props, createPointerDownEvent({ clientX: 12, clientY: 18 }));

    expect(props.onSelectOverlay).toHaveBeenCalledWith(null);
    expect(props.setDragState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'pan',
      })
    );
  });
}

function runSurfaceRenderTest() {
  it('renders capture stage and overlay layer only when layout exists', async () => {
    const props = createSurfaceProps();
    await renderSurface(props);

    const stage = container?.querySelector('[data-testid="capture-stage"]');
    const overlay = container?.querySelector('[data-testid="overlay-layer"]');
    expect(stage).not.toBeNull();
    expect(overlay).not.toBeNull();

    props.layout = null;
    await renderSurface(props);
    expect(container?.querySelector('[data-testid="overlay-layer"]')).toBeNull();
  });
}

function runWheelZoomTest() {
  it('commits zoom patch through wheel interaction', async () => {
    const props = createSurfaceProps();
    await renderSurface(props);

    const stage = container?.querySelector('.touch-none') as HTMLDivElement | null;
    expect(stage).not.toBeNull();

    await act(async () => {
      stage?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 10 }));
    });

    expect(props.onStepChange).toHaveBeenCalledWith(
      expect.objectContaining({
        imageTransform: expect.objectContaining({ scale: 0.92 }),
      })
    );
  });
}

function runScenarioQuickEditStageSurfaceSuite() {
  runResolveStagePointTest();
  runPanPointerDownTest();
  runCreateOverlayPointerDownTest();
  runSelectPointerDownTest();
  runSurfaceRenderTest();
  runWheelZoomTest();
}

describe('scenario quick-edit stage surface', runScenarioQuickEditStageSurfaceSuite);
