// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { PointerDragStartEvent } from '../pointer-drag-session';
import { useCalloutCurveHandleDrag } from './curve-handle-drag';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init);
    this.pointerId = init.pointerId;
  }
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let drag: ReturnType<typeof useCalloutCurveHandleDrag> | null = null;
const onChange = vi.fn();

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  drag = null;
  onChange.mockReset();
});

function renderHarness(storedOffset?: { x: number; y: number }) {
  function Harness() {
    drag = useCalloutCurveHandleDrag({
      defaultPoint: { x: 125, y: 80 },
      isEditing: false,
      maximumDistance: 50,
      onChange,
      origin: { x: 100, y: 100 },
      storedOffset,
    });
    return null;
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
}

it('stores a dragged bezier handle relative to its endpoint origin', () => {
  renderHarness();
  act(() =>
    drag?.handlePointerDown({
      button: 0,
      currentTarget: { setPointerCapture: vi.fn() },
      nativeEvent: { stopImmediatePropagation: vi.fn() },
      pointerId: 4,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as PointerDragStartEvent)
  );
  act(() =>
    document.dispatchEvent(
      new TestPointerEvent('pointermove', { clientX: 135, clientY: 70, pointerId: 4 })
    )
  );

  expect(drag?.draftOffset).toEqual({ x: 35, y: -30 });

  act(() =>
    document.dispatchEvent(
      new TestPointerEvent('pointerup', { clientX: 135, clientY: 70, pointerId: 4 })
    )
  );
  expect(onChange).toHaveBeenCalledWith({ x: 35, y: -30 });
  expect(drag?.draftOffset).toEqual({ x: 35, y: -30 });
});

it('keeps a pointer handle inside its compact endpoint control zone', () => {
  renderHarness();
  act(() =>
    drag?.handlePointerDown({
      button: 0,
      currentTarget: { setPointerCapture: vi.fn() },
      nativeEvent: { stopImmediatePropagation: vi.fn() },
      pointerId: 4,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as PointerDragStartEvent)
  );
  act(() =>
    document.dispatchEvent(
      new TestPointerEvent('pointermove', { clientX: 400, clientY: 100, pointerId: 4 })
    )
  );

  expect(drag?.draftOffset).toEqual({ x: 50, y: 0 });
});

it('moves an existing handle by keyboard without creating a waypoint', () => {
  renderHarness({ x: 12, y: -6 });
  const event = {
    key: 'ArrowRight',
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };

  act(() => drag?.handleKeyDown(event));

  expect(onChange).toHaveBeenCalledWith({ x: 17, y: -6 });
  expect(drag?.draftOffset).toEqual({ x: 17, y: -6 });
  expect(event.preventDefault).toHaveBeenCalledOnce();
});
