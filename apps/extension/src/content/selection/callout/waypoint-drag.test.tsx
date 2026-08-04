// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { PointerDragStartEvent } from '../pointer-drag-session';
import { useCalloutWaypointDrag } from './waypoint-drag';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init);
    this.pointerId = init.pointerId;
  }
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let drag: ReturnType<typeof useCalloutWaypointDrag> | null = null;
const onChange = vi.fn();

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  drag = null;
  onChange.mockReset();
});

function renderHarness() {
  function Harness() {
    drag = useCalloutWaypointDrag({
      axis: 'y',
      defaultPoint: { x: 185, y: 4 },
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      isEditing: false,
      onChange,
      position: undefined,
      snapPoints: [
        { x: 150, y: 20 },
        { x: 220, y: 100 },
      ],
    });
    return null;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
}

function startDrag() {
  act(() => {
    drag?.handlePointerDown({
      button: 0,
      currentTarget: { setPointerCapture: vi.fn() },
      nativeEvent: { stopImmediatePropagation: vi.fn() },
      pointerId: 7,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as PointerDragStartEvent);
  });
}

function dispatchPointer(type: string, x: number, y: number) {
  act(() => {
    document.dispatchEvent(
      new TestPointerEvent(type, { button: 0, clientX: x, clientY: y, pointerId: 7 })
    );
  });
}

it('moves only the channel axis and snaps it to a nearby endpoint axis', () => {
  renderHarness();
  startDrag();
  dispatchPointer('pointermove', 900, 25);

  expect(drag?.draftPosition).toEqual({ centerOffsetX: 5, centerOffsetY: -140 });

  dispatchPointer('pointerup', 900, 25);
  expect(onChange).toHaveBeenCalledWith({ centerOffsetX: 5, centerOffsetY: -140 });
});
