// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { CalloutConnectorWaypoint } from '@sniptale/runtime-contracts/highlighter/callout';
import type { PointerDragStartEvent } from '../pointer-drag-session';
import { snapPolylineControlPoint, type PolylineAngleSnap } from './polyline-control';
import type { ElbowWaypointConstraint } from './elbow-control';
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

function renderHarness(
  axis: 'x' | 'y' | 'both' = 'y',
  angleSnap?: PolylineAngleSnap,
  elbowConstraint?: ElbowWaypointConstraint,
  defaultPoint = { x: 185, y: 4 }
) {
  let position: CalloutConnectorWaypoint | undefined;
  function Harness() {
    drag = useCalloutWaypointDrag({
      ...(angleSnap ? { angleSnap } : {}),
      ...(elbowConstraint ? { elbowConstraint } : {}),
      axis,
      defaultPoint,
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      isEditing: false,
      onChange,
      position,
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
  return (nextPosition: CalloutConnectorWaypoint | undefined) => {
    position = nextPosition;
    act(() => root?.render(<Harness />));
  };
}

function startDrag(clientX = 185, clientY = 4) {
  act(() => {
    drag?.handlePointerDown({
      button: 0,
      clientX,
      clientY,
      currentTarget: { setPointerCapture: vi.fn() },
      nativeEvent: { stopImmediatePropagation: vi.fn() },
      pointerId: 7,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as PointerDragStartEvent & { clientX: number; clientY: number });
  });
}

function dispatchPointer(type: string, x: number, y: number, shiftKey = false) {
  act(() => {
    document.dispatchEvent(
      new TestPointerEvent(type, {
        button: 0,
        clientX: x,
        clientY: y,
        pointerId: 7,
        shiftKey,
      })
    );
  });
}

it('moves only the channel axis and snaps it to a nearby endpoint axis', () => {
  const updatePosition = renderHarness();
  startDrag();
  dispatchPointer('pointermove', 900, 25);

  expect(drag?.draftPosition).toEqual({ centerOffsetX: 5, centerOffsetY: -140 });

  dispatchPointer('pointerup', 900, 25);
  expect(onChange).toHaveBeenCalledWith({ centerOffsetX: 5, centerOffsetY: -140 });
  expect(drag?.draftPosition).toEqual({ centerOffsetX: 5, centerOffsetY: -140 });

  updatePosition({ centerOffsetX: 5, centerOffsetY: -140 });
  expect(drag?.draftPosition).toBeNull();
});

it('preserves the pointer grab offset instead of pulling the bend away from the cursor', () => {
  renderHarness();
  startDrag(190, 9);
  dispatchPointer('pointermove', 190, -1);

  expect(drag?.draftPosition).toEqual({ centerOffsetX: 5, centerOffsetY: -166 });
});

it('moves a perpendicular-route control point along both axes', () => {
  renderHarness('both');
  startDrag();
  dispatchPointer('pointermove', 240, 40);

  expect(drag?.draftPosition).toEqual({ centerOffsetX: 60, centerOffsetY: -120 });

  dispatchPointer('pointerup', 240, 40);
  expect(onChange).toHaveBeenCalledWith({ centerOffsetX: 60, centerOffsetY: -120 });
});

it('uses strict 15 degree snapping for an angled route while Shift is held', () => {
  const angleSnap = {
    fixedPoint: { x: 220, y: 100 },
    railPoint: { x: 185, y: 4 },
    side: 'top' as const,
  };
  renderHarness('y', angleSnap);
  startDrag();
  dispatchPointer('pointermove', 900, -47, true);

  const point = snapPolylineControlPoint({
    point: { x: 185, y: -47 },
    snap: angleSnap,
    strict: true,
  });
  expect(drag?.draftPosition).toEqual({
    centerOffsetX: point.x - 180,
    centerOffsetY: point.y - 160,
  });
});

it('pins an orthogonal corner at its valid limit and keeps dragging after capture is lost', () => {
  const constraint = {
    blockPoint: { x: 220, y: 4 },
    blockSide: 'top' as const,
    framePoint: { x: 220, y: 100 },
    frameSide: 'right' as const,
  };
  renderHarness('both', undefined, constraint, { x: 220, y: 4 });
  startDrag(220, 4);
  dispatchPointer('pointermove', 100, 100);

  expect(drag?.draftPosition).toEqual({ centerOffsetX: 40, centerOffsetY: -156 });
  act(() => document.dispatchEvent(new Event('lostpointercapture')));
  expect(drag?.isDragging).toBe(true);

  dispatchPointer('pointermove', 80, 120);
  expect(drag?.draftPosition).toEqual({ centerOffsetX: 40, centerOffsetY: -156 });
  dispatchPointer('pointerup', 80, 120);
  expect(onChange).toHaveBeenCalledWith({ centerOffsetX: 40, centerOffsetY: -156 });
});
