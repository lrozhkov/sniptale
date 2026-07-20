// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioLineElement,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { createEmptyScenarioDrawingDocument as emptyDrawing } from '../drawing';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioCanvasStage } from './stage';
import type { ScenarioCanvasViewportController } from './viewport-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createCanvasTestSlide(): ScenarioSlide {
  const textElement = {
    ...createScenarioTextElement({
      frame: { height: 80, width: 260, x: 100, y: 120 },
      name: 'Title text',
      text: 'Title',
    }),
    id: 'text-1',
  };

  return createScenarioSlide({
    elements: [textElement],
    title: 'Canvas',
  });
}

function createCanvasLineSlide(): ScenarioSlide {
  const line = {
    ...createScenarioLineElement({
      end: { x: 280, y: 180 },
      frame: { height: 120, width: 220, x: 80, y: 100 },
      start: { x: 100, y: 120 },
    }),
    id: 'line-1',
  };

  return createScenarioSlide({
    elements: [line],
    title: 'Line',
  });
}

function renderStage(props: Partial<Parameters<typeof ScenarioCanvasStage>[0]> = {}) {
  const onSelectElement = vi.fn();
  const onSelectSlide = vi.fn();
  const onDeleteElement = vi.fn();
  const onBeginElementTransaction = vi.fn();
  const onCancelElementTransaction = vi.fn();
  const onCommitElementTransaction = vi.fn();
  const onUpdateElement = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioCanvasStage
        onBeginElementTransaction={onBeginElementTransaction}
        onCancelElementTransaction={onCancelElementTransaction}
        onCommitElementTransaction={onCommitElementTransaction}
        onDeleteElement={onDeleteElement}
        onSelectElement={onSelectElement}
        onSelectSlide={onSelectSlide}
        onUpdateElement={onUpdateElement}
        selectedElementId={null}
        slide={createCanvasTestSlide()}
        {...props}
      />
    );
  });

  return {
    onBeginElementTransaction,
    onCancelElementTransaction,
    onCommitElementTransaction,
    onDeleteElement,
    onSelectElement,
    onSelectSlide,
    onUpdateElement,
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

function getElementOverlay(): HTMLButtonElement {
  const overlay = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.canvas.element-overlay"]'
  );
  expect(overlay).not.toBeNull();
  if (!overlay) {
    throw new Error('Expected canvas element overlay');
  }

  return overlay;
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  return new PointerEvent(type, { bubbles: true, clientX, clientY });
}

function createViewportController(scale = 1): ScenarioCanvasViewportController {
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
      scale,
      snapToGrid: false,
      zoomMode: 'custom',
    },
    gridVisible: true,
    magnetEnabled: false,
    scale,
    snapToGrid: false,
    viewportRef: { current: null },
  };
}

it('selects elements through the canvas overlay', () => {
  const { onSelectElement } = renderStage({ drawingDocument: emptyDrawing('slide-1') });

  act(() => {
    getElementOverlay().dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(container?.querySelector('[data-ui="scenario.drawing.layer"]')).not.toBeNull();
  expect(onSelectElement).toHaveBeenCalledWith('text-1');
});

it('routes active insert tools through canvas point placement instead of marquee selection', () => {
  const onInsertElementAtPoint = vi.fn();
  const { onSelectSlide } = renderStage({
    activeInsertKind: 'shape',
    onInsertElementAtPoint,
    viewportController: createViewportController(),
  });
  const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    stage?.dispatchEvent(pointerEvent('pointerdown', 30, 40));
    stage?.dispatchEvent(pointerEvent('pointerup', 30, 40));
  });

  expect(onInsertElementAtPoint).toHaveBeenCalledWith('shape', { x: 30, y: 40 });
  expect(onSelectSlide).not.toHaveBeenCalled();
});

it('commits unlocked element movement as a frame patch', () => {
  const { onBeginElementTransaction, onCommitElementTransaction, onUpdateElement } = renderStage();
  const overlay = getElementOverlay();
  const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    overlay.dispatchEvent(pointerEvent('pointerdown', 10, 10));
  });
  act(() => {
    stage?.dispatchEvent(pointerEvent('pointermove', 30, 40));
  });
  act(() => {
    stage?.dispatchEvent(pointerEvent('pointerup', 30, 40));
  });

  expect(onUpdateElement).toHaveBeenCalledWith('text-1', {
    frame: expect.objectContaining({ x: 120, y: 150 }),
  });
  expect(onBeginElementTransaction).toHaveBeenCalledWith('text-1', 'move');
  expect(onCommitElementTransaction).toHaveBeenCalledWith('text-1', 'move');
});

it('does not start drag sessions for locked elements', () => {
  const slide = createCanvasTestSlide();
  const lockedSlide = {
    ...slide,
    elements: slide.elements.map((element) => ({ ...element, locked: true })),
  };
  const { onUpdateElement } = renderStage({ slide: lockedSlide });

  act(() => {
    getElementOverlay().dispatchEvent(pointerEvent('pointerdown', 10, 10));
  });

  expect(onUpdateElement).not.toHaveBeenCalled();
});

it('commits selected element resize from canvas handles', () => {
  const { onUpdateElement } = renderStage({ selectedElementId: 'text-1' });
  const handle = container?.querySelector<HTMLButtonElement>('[aria-label="Resize se"]');
  const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    handle?.dispatchEvent(pointerEvent('pointerdown', 10, 10));
  });
  act(() => {
    stage?.dispatchEvent(pointerEvent('pointermove', 40, 50));
  });
  act(() => {
    stage?.dispatchEvent(pointerEvent('pointerup', 40, 50));
  });

  expect(onUpdateElement).toHaveBeenCalledWith('text-1', {
    frame: expect.objectContaining({ height: 120, width: 290 }),
  });
});

it('handles keyboard nudging and deleting for the selected unlocked element', () => {
  const { onDeleteElement, onUpdateElement } = renderStage({ selectedElementId: 'text-1' });
  const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    stage?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    stage?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown', shiftKey: true })
    );
    stage?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
  });

  expect(onUpdateElement).toHaveBeenCalledWith('text-1', {
    frame: expect.objectContaining({ x: 101, y: 120 }),
  });
  expect(onUpdateElement).toHaveBeenCalledWith('text-1', {
    frame: expect.objectContaining({ x: 100, y: 130 }),
  });
  expect(onDeleteElement).toHaveBeenCalledWith('text-1');
});

it('cancels active pointer transactions on Escape', () => {
  const { onCancelElementTransaction, onSelectSlide } = renderStage({
    selectedElementId: 'text-1',
  });
  const overlay = getElementOverlay();
  const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    overlay.dispatchEvent(pointerEvent('pointerdown', 10, 10));
  });
  act(() => {
    stage?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  expect(onCancelElementTransaction).toHaveBeenCalledWith('text-1', 'move');
  expect(onSelectSlide).toHaveBeenCalledTimes(1);
});

it('commits line endpoint movement from canvas handles', () => {
  const { onUpdateElement } = renderStage({
    selectedElementId: 'line-1',
    slide: createCanvasLineSlide(),
  });
  const handle = container?.querySelector<HTMLButtonElement>(
    `[aria-label="${translate('scenario.editor.moveStartEndpoint')}"]`
  );
  const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    handle?.dispatchEvent(pointerEvent('pointerdown', 10, 10));
  });
  act(() => {
    stage?.dispatchEvent(pointerEvent('pointerup', 40, 50));
  });

  expect(onUpdateElement).toHaveBeenCalledWith('line-1', {
    start: { x: 130, y: 160 },
  });
});
