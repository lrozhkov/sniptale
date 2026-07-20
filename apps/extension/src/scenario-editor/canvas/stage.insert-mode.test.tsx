// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createScenarioSlide, createScenarioTextElement } from '../../features/scenario/project/v3';
import { ScenarioCanvasStage } from './stage';
import type { ScenarioCanvasViewportController } from './viewport-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createViewportController(): ScenarioCanvasViewportController {
  return {
    controls: {
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
      scale: 1,
      snapToGrid: false,
      zoomMode: 'custom',
    },
    gridVisible: true,
    magnetEnabled: false,
    scale: 1,
    snapToGrid: false,
    viewportRef: { current: null },
  };
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

afterEach(() => {
  root?.unmount();
  container?.remove();
  root = null;
  container = null;
});

it('routes active insert tools through drawn canvas frames with preview feedback', () => {
  const onInsertElementAtPoint = vi.fn();
  const onInsertElementFromDrag = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioCanvasStage
        activeInsertKind="shape"
        onDeleteElement={vi.fn()}
        onInsertElementAtPoint={onInsertElementAtPoint}
        onInsertElementFromDrag={onInsertElementFromDrag}
        onSelectElement={vi.fn()}
        onSelectSlide={vi.fn()}
        onUpdateElement={vi.fn()}
        selectedElementId={null}
        slide={createScenarioSlide({ title: 'Insert' })}
        viewportController={createViewportController()}
      />
    );
  });
  const stage = container.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    stage?.dispatchEvent(pointerEvent('pointerdown', 30, 40));
    stage?.dispatchEvent(pointerEvent('pointermove', 130, 140));
  });

  expect(container.querySelector('[data-ui="scenario.canvas.insert-preview"]')).not.toBeNull();

  act(() => {
    stage?.dispatchEvent(pointerEvent('pointerup', 130, 140));
  });

  expect(onInsertElementFromDrag).toHaveBeenCalledWith(
    'shape',
    { x: 30, y: 40 },
    { x: 130, y: 140 }
  );
  expect(onInsertElementAtPoint).not.toHaveBeenCalled();
  expect(container.querySelector('[data-ui="scenario.canvas.insert-preview"]')).toBeNull();
});

it('prioritizes active insert tools over existing element overlays', () => {
  const onInsertElementAtPoint = vi.fn();
  const onSelectElement = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioCanvasStage
        activeInsertKind="text"
        onDeleteElement={vi.fn()}
        onInsertElementAtPoint={onInsertElementAtPoint}
        onSelectElement={onSelectElement}
        onSelectSlide={vi.fn()}
        onUpdateElement={vi.fn()}
        selectedElementId={null}
        slide={createScenarioSlide({
          elements: [
            {
              ...createScenarioTextElement({
                frame: { height: 80, width: 260, x: 100, y: 120 },
                name: 'Title text',
                text: 'Title',
              }),
              id: 'text-1',
            },
          ],
          title: 'Insert',
        })}
        viewportController={createViewportController()}
      />
    );
  });
  const overlay = container.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.canvas.element-overlay"]'
  );
  const stage = container.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    overlay?.dispatchEvent(pointerEvent('pointerdown', 140, 160));
    stage?.dispatchEvent(pointerEvent('pointerup', 140, 160));
  });

  expect(onInsertElementAtPoint).toHaveBeenCalledWith('text', { x: 140, y: 160 });
  expect(onSelectElement).not.toHaveBeenCalled();
});

it('clears active insert tools on Escape without routing element keyboard actions', () => {
  const onClearActiveInsertKind = vi.fn();
  const onDeleteElement = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioCanvasStage
        activeInsertKind="shape"
        onClearActiveInsertKind={onClearActiveInsertKind}
        onDeleteElement={onDeleteElement}
        onSelectElement={vi.fn()}
        onSelectSlide={vi.fn()}
        onUpdateElement={vi.fn()}
        selectedElementId="shape-1"
        slide={createScenarioSlide({ title: 'Insert' })}
        viewportController={createViewportController()}
      />
    );
  });
  const stage = container.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    stage?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  expect(onClearActiveInsertKind).toHaveBeenCalledTimes(1);
  expect(onDeleteElement).not.toHaveBeenCalled();
});

it('drops local insert preview and session when active insert is cleared externally', () => {
  const onInsertElementAtPoint = vi.fn();
  const onInsertElementFromDrag = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const renderStage = (activeInsertKind: 'shape' | null) => {
    root?.render(
      <ScenarioCanvasStage
        activeInsertKind={activeInsertKind}
        onDeleteElement={vi.fn()}
        onInsertElementAtPoint={onInsertElementAtPoint}
        onInsertElementFromDrag={onInsertElementFromDrag}
        onSelectElement={vi.fn()}
        onSelectSlide={vi.fn()}
        onUpdateElement={vi.fn()}
        selectedElementId={null}
        slide={createScenarioSlide({ title: 'Insert' })}
        viewportController={createViewportController()}
      />
    );
  };

  act(() => {
    renderStage('shape');
  });
  const stage = container.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    stage?.dispatchEvent(pointerEvent('pointerdown', 30, 40));
    stage?.dispatchEvent(pointerEvent('pointermove', 130, 140));
  });
  expect(container.querySelector('[data-ui="scenario.canvas.insert-preview"]')).not.toBeNull();

  act(() => {
    renderStage(null);
  });
  expect(container.querySelector('[data-ui="scenario.canvas.insert-preview"]')).toBeNull();

  act(() => {
    stage?.dispatchEvent(pointerEvent('pointerup', 130, 140));
  });
  expect(onInsertElementAtPoint).not.toHaveBeenCalled();
  expect(onInsertElementFromDrag).not.toHaveBeenCalled();
});
