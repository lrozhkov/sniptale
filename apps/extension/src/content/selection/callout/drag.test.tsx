// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useCalloutDrag, type CalloutDragStartEvent } from './drag';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init);
    this.pointerId = init.pointerId;
  }
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let drag: ReturnType<typeof useCalloutDrag> | null = null;
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
  vi.useRealTimers();
  onPositionChange.mockReset();
});

function renderHarness() {
  function Harness() {
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    drag = useCalloutDrag({
      dimensions: { width: 100, height: 40 },
      frameRect: { x: 100, y: 100, width: 120, height: 80 },
      isEditing: false,
      manualPlacement: undefined,
      onPositionChange,
      wrapperRef,
    });
    return <div ref={wrapperRef} data-ui="callout-wrapper" />;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  const wrapper = container.querySelector<HTMLElement>('[data-ui="callout-wrapper"]');
  vi.spyOn(wrapper!, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 200, 100, 40));
}

function startDrag() {
  act(() => {
    const event: CalloutDragStartEvent = {
      button: 0,
      clientX: 210,
      clientY: 210,
      currentTarget: { setPointerCapture: vi.fn() },
      nativeEvent: { stopImmediatePropagation: vi.fn() },
      pointerId: 7,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    drag?.handlePointerDown(event);
  });
}

function dispatchPointer(type: string, x: number, y: number) {
  act(() => {
    document.dispatchEvent(
      new TestPointerEvent(type, { button: 0, clientX: x, clientY: y, pointerId: 7 })
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

describe('useCalloutDrag', () => {
  it('previews movement locally and commits one placement on pointerup', () => {
    renderHarness();
    startDrag();
    dispatchPointer('pointermove', 260, 250);

    expect(drag?.draftPlacement).toEqual({ centerOffsetX: 140, centerOffsetY: 120 });
    expect(onPositionChange).not.toHaveBeenCalled();

    dispatchPointer('pointerup', 260, 250);

    expect(onPositionChange).toHaveBeenCalledOnce();
    expect(onPositionChange).toHaveBeenCalledWith({ centerOffsetX: 140, centerOffsetY: 120 });
  });

  it('rolls back without a commit when pointer capture is lost', () => {
    renderHarness();
    startDrag();
    dispatchPointer('pointermove', 260, 250);
    act(() => document.dispatchEvent(new Event('lostpointercapture')));

    expect(drag?.draftPlacement).toBeNull();
    expect(drag?.isDragging).toBe(false);
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('moves and clamps the comment through arrow-key operations', () => {
    renderHarness();
    const event = keyboardEvent('ArrowRight');

    act(() => drag?.handleKeyDown(event));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onPositionChange).toHaveBeenCalledWith({ centerOffsetX: 95, centerOffsetY: 80 });
  });

  it('reveals the handle while it owns keyboard focus', () => {
    vi.useFakeTimers();
    renderHarness();

    act(() => drag?.handleFocus());
    expect(drag?.isHandleVisible).toBe(true);

    act(() => drag?.handleBlur());
    expect(drag?.isHandleVisible).toBe(true);
    act(() => vi.advanceTimersByTime(320));
    expect(drag?.isHandleVisible).toBe(false);
  });

  it('keeps distant endpoint controls visible while the pointer crosses the connector', () => {
    vi.useFakeTimers();
    renderHarness();

    act(() => drag?.handleMouseEnter());
    act(() => drag?.handleMouseLeave());
    act(() => vi.advanceTimersByTime(200));
    expect(drag?.isHandleVisible).toBe(true);

    act(() => drag?.handleMouseEnter());
    act(() => vi.advanceTimersByTime(400));
    expect(drag?.isHandleVisible).toBe(true);

    act(() => drag?.handleMouseLeave());
    act(() => vi.advanceTimersByTime(320));
    expect(drag?.isHandleVisible).toBe(false);
  });
});
