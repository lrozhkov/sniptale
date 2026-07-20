// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ArrowEndpointHandles,
  ArrowMoveHandle,
  RectResizeHandles,
} from './ScenarioQuickEditOverlayLayer.handles';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function createStep() {
  return {
    id: 'step-1',
    kind: 'capture',
  } as never;
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

function verifiesArrowHandleDrags() {
  const beginDrag = vi.fn();
  const onSelectOverlay = vi.fn();

  renderNode(
    <>
      <ArrowMoveHandle
        beginDrag={beginDrag}
        center={{ x: 50, y: 60 }}
        onSelectOverlay={onSelectOverlay}
        overlayId="overlay-1"
        step={createStep()}
      />
      <ArrowEndpointHandles
        beginDrag={beginDrag}
        end={{ x: 80, y: 90 }}
        overlayId="overlay-1"
        start={{ x: 20, y: 30 }}
        step={createStep()}
      />
    </>
  );

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  act(() => {
    buttons[0]?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 20 })
    );
    buttons[1]?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 30, clientY: 40 })
    );
    buttons[2]?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 60 })
    );
  });

  expect(onSelectOverlay).toHaveBeenCalledWith('overlay-1');
  expect(beginDrag).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'move-overlay', overlayId: 'overlay-1' })
  );
  expect(beginDrag).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'move-arrow-endpoint', endpoint: 'start' })
  );
  expect(beginDrag).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'move-arrow-endpoint', endpoint: 'end' })
  );
}

function verifiesRectResizeHandles() {
  const beginDrag = vi.fn();

  renderNode(
    <>
      {RectResizeHandles({
        beginDrag,
        overlayId: 'overlay-2',
        rect: { x: 10, y: 20, width: 100, height: 80 },
        step: createStep(),
      })}
    </>
  );

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  expect(buttons).toHaveLength(4);

  act(() => {
    buttons[0]?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 6 })
    );
    buttons[3]?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 7, clientY: 8 })
    );
  });

  expect(beginDrag).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'resize-overlay', handle: 'nw' })
  );
  expect(beginDrag).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'resize-overlay', handle: 'se' })
  );
}

function runScenarioQuickEditOverlayLayerHandlesSuite() {
  it('starts arrow move and endpoint drags from handle buttons', verifiesArrowHandleDrags);
  it('renders resize handles for every rect corner', verifiesRectResizeHandles);
}

describe('ScenarioQuickEditOverlayLayer handles', runScenarioQuickEditOverlayLayerHandlesSuite);
