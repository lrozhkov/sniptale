// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ScenarioRenderedElement } from '../project/stage-render/slide';
import { createScenarioTextElement } from '../../features/scenario/project/v3';
import { ScenarioCanvasSelectionOverlay } from './selection-overlay';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderOverlay(element: ScenarioRenderedElement = createRenderedElement()) {
  const callbacks = {
    onDragStart: vi.fn(),
    onSelectElement: vi.fn(),
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ScenarioCanvasSelectionOverlay elements={[element]} {...callbacks} />);
  });

  return callbacks;
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

it('selects an unlocked element before starting drag capture', () => {
  const { onDragStart, onSelectElement } = renderOverlay();

  act(() => {
    getOverlay().dispatchEvent(pointerEvent('pointerdown', 10, 12));
  });

  expect(onSelectElement).toHaveBeenCalledWith('text-1');
  expect(onDragStart).toHaveBeenCalledWith(
    expect.objectContaining({
      element: expect.objectContaining({ id: 'text-1' }),
      originClientX: 10,
      originClientY: 12,
    }),
    expect.objectContaining({ type: 'pointerdown' })
  );
});

it('keeps locked elements selectable without starting a drag session', () => {
  const { onDragStart, onSelectElement } = renderOverlay(createRenderedElement({ locked: true }));

  act(() => {
    getOverlay().dispatchEvent(pointerEvent('pointerdown', 10, 12));
  });

  expect(onSelectElement).toHaveBeenCalledWith('text-1');
  expect(onDragStart).not.toHaveBeenCalled();
});

it('keeps keyboard activation selecting the overlay element', () => {
  const { onSelectElement } = renderOverlay();

  act(() => {
    getOverlay().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  });

  expect(onSelectElement).toHaveBeenCalledWith('text-1');
});

function getOverlay(): HTMLButtonElement {
  const overlay = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.canvas.element-overlay"]'
  );
  if (!overlay) {
    throw new Error('Expected scenario canvas element overlay');
  }

  return overlay;
}

function createRenderedElement(options: { locked?: boolean; selected?: boolean } = {}) {
  const element = {
    ...createScenarioTextElement({
      frame: { height: 80, width: 240, x: 100, y: 120 },
      name: 'Canvas note',
      text: 'Body',
    }),
    id: 'text-1',
    locked: options.locked ?? false,
  };

  return {
    box: { centerX: 220, centerY: 160, height: 80, width: 240, x: 100, y: 120 },
    element,
    kind: element.kind,
    selected: options.selected ?? false,
  } satisfies ScenarioRenderedElement;
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  return new PointerEvent(type, { bubbles: true, clientX, clientY });
}
