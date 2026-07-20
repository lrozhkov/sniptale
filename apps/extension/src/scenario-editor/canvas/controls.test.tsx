// @vitest-environment jsdom

import { act } from 'react';
import type { ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createScenarioTextElement } from '../../features/scenario/project/v3';
import { ScenarioCanvasFloatingControls } from './controls';
import { createElementFrameMovePatch } from './drag';
import { createEndpointMovePatch } from './endpoint';
import type { ScenarioCanvasMagnetContext } from './magnet';
import { createElementFrameResizePatch } from './resize';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type FloatingControlsProps = ComponentProps<typeof ScenarioCanvasFloatingControls>;

function createMagnetContext(): ScenarioCanvasMagnetContext {
  return {
    activeElementId: 'active',
    elements: [
      {
        ...createScenarioTextElement({ frame: { height: 40, width: 80, x: 100, y: 100 } }),
        id: 'active',
      },
      {
        ...createScenarioTextElement({ frame: { height: 60, width: 120, x: 160, y: 96 } }),
        id: 'sibling',
      },
    ],
    slide: { height: 480, width: 640 },
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ScenarioCanvasFloatingControls', () => {
  registerToolbarActionTests();
  registerGeometryAdapterTests();
});

function createFloatingControlsProps(
  overrides: Partial<FloatingControlsProps> = {}
): FloatingControlsProps {
  return {
    gridVisible: false,
    magnetEnabled: true,
    navigatorVisible: false,
    onFit: vi.fn(),
    onSetGridVisible: vi.fn(),
    onSetMagnetEnabled: vi.fn(),
    onSetNavigatorVisible: vi.fn(),
    onSetSnapToGrid: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOne: vi.fn(),
    onZoomOut: vi.fn(),
    scale: 0.75,
    snapToGrid: false,
    zoomMode: 'fit',
    ...overrides,
  };
}

function renderFloatingControls(props: FloatingControlsProps) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => root?.render(<ScenarioCanvasFloatingControls {...props} />));
}

function clickFloatingControl(index: number) {
  act(() => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .at(index)
      ?.click();
  });
}

function clickAllFloatingControls() {
  act(() => {
    container?.querySelector('[data-ui="scenario.canvas.floating-controls"]');
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).forEach((button) =>
      button.click()
    );
  });
}

function registerToolbarActionTests() {
  it('routes zoom and alignment actions through compact toolbar buttons', () => {
    const props = createFloatingControlsProps();

    renderFloatingControls(props);
    clickAllFloatingControls();

    expect(props.onZoomOut).toHaveBeenCalledOnce();
    expect(props.onZoomOne).toHaveBeenCalledOnce();
    expect(props.onZoomIn).toHaveBeenCalledOnce();
    expect(props.onSetGridVisible).toHaveBeenCalledWith(true);
    expect(props.onSetMagnetEnabled).toHaveBeenCalledWith(false);
    expect(props.onSetSnapToGrid).toHaveBeenCalledWith(true);
    expect(props.onSetNavigatorVisible).toHaveBeenCalledWith(true);
  });

  it('keeps navigator toggle inert when the owner omits optional navigation state', () => {
    const props = createFloatingControlsProps({
      gridVisible: true,
      magnetEnabled: false,
      scale: 1,
      snapToGrid: true,
      zoomMode: 'custom',
    });

    renderFloatingControls(props);
    clickFloatingControl(6);

    expect(props.onSetGridVisible).not.toHaveBeenCalled();
  });
}

function registerGeometryAdapterTests() {
  registerBasicGeometryAdapterTests();
  registerMagnetGeometryAdapterTests();
  registerSnappingGeometryAdapterTests();
}

function registerBasicGeometryAdapterTests() {
  it('moves scenario element frames without magnet or grid fallback', () => {
    expect(
      createElementFrameMovePatch({
        frame: { height: 40, width: 80, x: 10, y: 20 },
        originClientX: 100,
        originClientY: 80,
        scale: 2,
        targetClientX: 160,
        targetClientY: 120,
      })
    ).toEqual({ height: 40, width: 80, x: 40, y: 40 });
  });

  it('resizes scenario element frames without magnet or grid fallback', () => {
    expect(
      createElementFrameResizePatch({
        frame: { height: 100, width: 120, x: 20, y: 30 },
        handle: 'nw',
        originClientX: 100,
        originClientY: 100,
        scale: 1,
        targetClientX: 300,
        targetClientY: 300,
      })
    ).toEqual({ height: 24, width: 24, x: 116, y: 106 });
  });

  it('moves connector endpoints without magnet or grid fallback', () => {
    expect(
      createEndpointMovePatch({
        end: { x: 100, y: 110 },
        handle: 'start',
        originClientX: 10,
        originClientY: 20,
        scale: 2,
        start: { x: 40, y: 50 },
        targetClientX: 30,
        targetClientY: 60,
      })
    ).toEqual({ start: { x: 50, y: 70 } });
  });
}

function registerMagnetGeometryAdapterTests() {
  it('snaps geometry adapters against magnet context', () => {
    const magnetContext = createMagnetContext();

    expect(
      createElementFrameMovePatch({
        frame: { height: 40, width: 80, x: 100, y: 100 },
        magnetContext,
        originClientX: 0,
        originClientY: 0,
        scale: 1,
        targetClientX: 58,
        targetClientY: -4,
      })
    ).toEqual({ height: 40, width: 80, x: 160, y: 96 });
    expect(
      createElementFrameResizePatch({
        frame: { height: 40, width: 58, x: 100, y: 100 },
        handle: 'se',
        magnetContext,
        originClientX: 0,
        originClientY: 0,
        scale: 1,
        targetClientX: 0,
        targetClientY: 56,
      })
    ).toEqual({ height: 96, width: 60, x: 100, y: 100 });
    expect(
      createEndpointMovePatch({
        end: { x: 100, y: 110 },
        handle: 'end',
        magnetContext,
        originClientX: 0,
        originClientY: 0,
        scale: 1,
        snapGridSize: 32,
        start: { x: 40, y: 50 },
        targetClientX: 58,
        targetClientY: -10,
      })
    ).toEqual({ end: { x: 160, y: 96 } });
  });
}

function registerSnappingGeometryAdapterTests() {
  it('snaps geometry adapters to grid fallback branches', () => {
    expect(
      createElementFrameMovePatch({
        frame: { height: 40, width: 80, x: 10, y: 20 },
        originClientX: 0,
        originClientY: 0,
        scale: 1,
        snapGridSize: 32,
        targetClientX: 11,
        targetClientY: 11,
      })
    ).toEqual({ height: 40, width: 80, x: 32, y: 32 });
    expect(
      createElementFrameResizePatch({
        frame: { height: 40, width: 58, x: 100, y: 100 },
        handle: 'se',
        originClientX: 0,
        originClientY: 0,
        scale: 1,
        snapGridSize: 32,
        targetClientX: 7,
        targetClientY: 19,
      })
    ).toEqual({ height: 60, width: 60, x: 100, y: 100 });
    expect(
      createEndpointMovePatch({
        end: { x: 100, y: 110 },
        handle: 'end',
        originClientX: 0,
        originClientY: 0,
        scale: 1,
        snapGridSize: 32,
        start: { x: 40, y: 50 },
        targetClientX: 11,
        targetClientY: 19,
      })
    ).toEqual({ end: { x: 96, y: 128 } });
  });
}
