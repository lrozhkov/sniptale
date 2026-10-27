// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStepBadgePointDrag } from './drag';
import { createScaledFrameAnnotationCoordinateSpace } from '../coordinate-space';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, x: number, y: number, pointerId = 7) {
    super(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    this.pointerId = pointerId;
  }
}
let host: HTMLDivElement;
let root: Root;
let drag: ReturnType<typeof useStepBadgePointDrag>;
const commit = vi.fn();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  commit.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(scale = 1) {
  function Harness() {
    drag = useStepBadgePointDrag({
      point: { x: 20, y: 30 },
      onPositionChange: commit,
      coordinateSpace: createScaledFrameAnnotationCoordinateSpace({
        origin: { x: 0, y: 0 },
        scale,
        viewport: { width: 800, height: 600 },
      }),
    });
    return <button onPointerDown={drag.handlePointerDown} onKeyDown={drag.handleKeyDown} />;
  }
  act(() => root.render(<Harness />));
}
function start() {
  act(() => {
    host.querySelector('button')!.dispatchEvent(new TestPointerEvent('pointerdown', 100, 100));
  });
}
function move(x: number, y: number, pointerId = 7) {
  act(() => {
    document.dispatchEvent(new TestPointerEvent('pointermove', x, y, pointerId));
  });
}
function finish(x: number, y: number) {
  act(() => {
    document.dispatchEvent(new TestPointerEvent('pointerup', x, y));
  });
}

it('moves a standalone point beyond frame-boundary limits and commits once', () => {
  render();
  start();
  move(500, 350);
  expect(drag.draftPoint).toEqual({ x: 420, y: 280 });
  expect(commit).not.toHaveBeenCalled();
  finish(500, 350);
  expect(commit).toHaveBeenCalledExactlyOnceWith({ x: 420, y: 280 });
  expect(drag.draftPoint).toBeNull();
  expect(drag.isDragging).toBe(false);
  finish(500, 350);
  expect(commit).toHaveBeenCalledOnce();
});

it('uses logical coordinates under editor scale', () => {
  render(2);
  start();
  move(400, 300);
  finish(400, 300);
  expect(commit).toHaveBeenCalledExactlyOnceWith({ x: 170, y: 130 });
});

it.each(['Escape', 'pointercancel'] as const)('restores the point after %s', (reason) => {
  render();
  start();
  move(500, 350, 8);
  expect(drag.draftPoint).toBeNull();
  move(500, 350);
  act(() => {
    if (reason === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    else document.dispatchEvent(new TestPointerEvent('pointercancel', 500, 350));
  });
  expect(drag.draftPoint).toBeNull();
  expect(drag.isDragging).toBe(false);
  finish(500, 350);
  expect(commit).not.toHaveBeenCalled();
});

it('supports keyboard point movement without changing frame-boundary placement', () => {
  render();
  act(() => {
    host.querySelector('button')!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
  });
  expect(commit).toHaveBeenCalledExactlyOnceWith({ x: 30, y: 30 });
});
