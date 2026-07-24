// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useCalloutEdgeDrag, type CalloutTailDragStartEvent } from './tail-drag';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init);
    this.pointerId = init.pointerId;
  }
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let drag: ReturnType<typeof useCalloutEdgeDrag> | null = null;
const onPositionChange = vi.fn();

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  drag = null;
  vi.restoreAllMocks();
  onPositionChange.mockReset();
});

function renderHarness(side: 'top' | 'right' = 'top') {
  function Harness() {
    drag = useCalloutEdgeDrag({
      connectorSide: side,
      defaultPosition: 0.5,
      edgeRect: { x: 100, y: 50, width: 200, height: 80 },
      isEditing: false,
      onPositionChange,
      position: undefined,
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
    const event: CalloutTailDragStartEvent = {
      button: 0,
      currentTarget: { setPointerCapture: vi.fn() },
      nativeEvent: { stopImmediatePropagation: vi.fn() },
      pointerId: 9,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    drag?.handlePointerDown(event);
  });
}

function dispatchPointer(type: string, x: number, y: number) {
  act(() => {
    document.dispatchEvent(
      new TestPointerEvent(type, { button: 0, clientX: x, clientY: y, pointerId: 9 })
    );
  });
}

function keyboardEvent(key: string, shiftKey = false) {
  return {
    key,
    shiftKey,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe('useCalloutEdgeDrag', () => {
  it('moves a top/bottom base horizontally and commits once on pointerup', () => {
    renderHarness('top');
    startDrag();
    dispatchPointer('pointermove', 250, 500);

    expect(drag?.draftPosition).toBe(0.75);
    expect(onPositionChange).not.toHaveBeenCalled();

    dispatchPointer('pointerup', 250, 500);

    expect(onPositionChange).toHaveBeenCalledOnce();
    expect(onPositionChange).toHaveBeenCalledWith(0.75);
  });

  it('moves a left/right base vertically and rolls back on lost capture', () => {
    renderHarness('right');
    startDrag();
    dispatchPointer('pointermove', 500, 110);

    expect(drag?.draftPosition).toBe(0.75);
    act(() => document.dispatchEvent(new Event('lostpointercapture')));

    expect(drag?.draftPosition).toBeNull();
    expect(drag?.isDragging).toBe(false);
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('moves the base by keyboard only along its current boundary', () => {
    renderHarness('top');
    const alongBoundary = keyboardEvent('ArrowRight');
    const acrossBoundary = keyboardEvent('ArrowDown');

    act(() => drag?.handleKeyDown(alongBoundary));
    act(() => drag?.handleKeyDown(acrossBoundary));

    expect(onPositionChange).toHaveBeenCalledOnce();
    expect(onPositionChange).toHaveBeenCalledWith(0.525);
    expect(alongBoundary.preventDefault).toHaveBeenCalledOnce();
    expect(acrossBoundary.preventDefault).not.toHaveBeenCalled();
  });
});
