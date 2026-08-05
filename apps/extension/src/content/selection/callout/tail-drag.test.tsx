// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  getCalloutPerimeterAnchorPositions,
  getCalloutPerimeterPoint,
  getCalloutPerimeterPosition,
  getSnappedCalloutPerimeterPosition,
  useCalloutEdgeDrag,
  type CalloutTailDragStartEvent,
} from './tail-drag';

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

function renderHarness(side: 'top' | 'right' = 'top', perimeter = false) {
  function Harness() {
    drag = useCalloutEdgeDrag({
      connectorSide: side,
      defaultPosition: 0.5,
      edgeRect: { x: 100, y: 50, width: 200, height: 80 },
      isEditing: false,
      onPositionChange,
      perimeter,
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

  it('maps pointer movement to every side of a complete rectangular perimeter', () => {
    const rect = { x: 100, y: 50, width: 200, height: 80 };
    expect(getCalloutPerimeterPoint(rect, 0)).toEqual({ x: 100, y: 50 });
    expect(getCalloutPerimeterPoint(rect, 0.5)).toEqual({ x: 300, y: 130 });
    expect(getCalloutPerimeterPosition(rect, { x: 100, y: 130 })).toBeCloseTo(480 / 560);

    renderHarness('top', true);
    startDrag();
    dispatchPointer('pointermove', 100, 90);

    expect(drag?.draftPosition).toBeCloseTo(0.9286, 4);
  });

  it('defines corners and side centers as the eight canonical perimeter anchors', () => {
    const rect = { x: 100, y: 50, width: 200, height: 80 };
    expect(
      getCalloutPerimeterAnchorPositions(rect).map((position) =>
        getCalloutPerimeterPoint(rect, position)
      )
    ).toEqual([
      { x: 100, y: 50 },
      { x: 200, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 90 },
      { x: 300, y: 130 },
      { x: 200, y: 130 },
      { x: 100, y: 130 },
      { x: 100, y: 90 },
    ]);
  });

  it('adds title, divider, and body-center anchors to both sides of a comment card', () => {
    const rect = { x: 100, y: 50, width: 200, height: 120 };
    const anchors = getCalloutPerimeterAnchorPositions(rect, [70, 90, 130]).map((position) =>
      getCalloutPerimeterPoint(rect, position)
    );

    expect(anchors).toEqual(
      expect.arrayContaining([
        { x: 300, y: 70 },
        { x: 100, y: 70 },
        { x: 300, y: 90 },
        { x: 100, y: 90 },
        { x: 300, y: 130 },
        { x: 100, y: 130 },
      ])
    );
  });

  it('snaps to a supplied comment-section anchor with the same magnetic hysteresis', () => {
    const rect = { x: 100, y: 50, width: 200, height: 120 };
    const anchors = getCalloutPerimeterAnchorPositions(rect, [90]);
    const snapped = getSnappedCalloutPerimeterPosition(rect, { x: 294, y: 91 }, null, anchors);

    expect(getCalloutPerimeterPoint(rect, snapped.position)).toEqual({ x: 300, y: 90 });
    expect(snapped.snapPosition).toBe(snapped.position);
  });

  it('holds a perimeter anchor until the pointer crosses the wider release distance', () => {
    const rect = { x: 100, y: 50, width: 200, height: 80 };
    const entered = getSnappedCalloutPerimeterPosition(rect, { x: 293, y: 50 }, null);
    const held = getSnappedCalloutPerimeterPosition(rect, { x: 288, y: 50 }, entered.snapPosition);
    const released = getSnappedCalloutPerimeterPosition(rect, { x: 284, y: 50 }, held.snapPosition);

    expect(entered.position).toBeCloseTo(200 / 560);
    expect(held.position).toBe(entered.position);
    expect(released.snapPosition).toBeNull();
    expect(released.position).toBeCloseTo(184 / 560);
  });

  it('applies magnetic snapping while dragging around the full perimeter', () => {
    renderHarness('top', true);
    startDrag();
    dispatchPointer('pointermove', 293, 50);
    expect(drag?.draftPosition).toBeCloseTo(200 / 560);

    dispatchPointer('pointermove', 288, 50);
    expect(drag?.draftPosition).toBeCloseTo(200 / 560);

    dispatchPointer('pointermove', 284, 50);
    expect(drag?.draftPosition).toBeCloseTo(184 / 560);
  });

  it('commits a semantic anchor inside the magnetic zone and free mode outside it', () => {
    renderHarness('top', true);
    startDrag();
    dispatchPointer('pointermove', 293, 50);
    dispatchPointer('pointerup', 293, 50);

    expect(onPositionChange).toHaveBeenLastCalledWith(200 / 560, {
      anchorId: 'top-right',
      mode: 'anchor',
      perimeterPosition: 200 / 560,
    });

    onPositionChange.mockClear();
    startDrag();
    dispatchPointer('pointermove', 250, 50);
    dispatchPointer('pointerup', 250, 50);

    expect(onPositionChange).toHaveBeenLastCalledWith(150 / 560, {
      mode: 'free',
      perimeterPosition: 150 / 560,
    });
  });
});
