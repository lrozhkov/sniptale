// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CalloutManualPlacement } from '@sniptale/runtime-contracts/highlighter/callout';
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

function renderHarness(manualPlacement?: CalloutManualPlacement) {
  function Harness(props: { manualPlacement: CalloutManualPlacement | undefined }) {
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    drag = useCalloutDrag({
      dimensions: { width: 100, height: 40 },
      frameRect: { x: 100, y: 100, width: 120, height: 80 },
      isEditing: false,
      manualPlacement: props.manualPlacement,
      onPositionChange,
      wrapperRef,
    });
    return <div ref={wrapperRef} data-ui="callout-wrapper" />;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness manualPlacement={manualPlacement} />));
  const wrapper = container.querySelector<HTMLElement>('[data-ui="callout-wrapper"]');
  vi.spyOn(wrapper!, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 200, 100, 40));
  return {
    rerender: (nextPlacement: CalloutManualPlacement) => {
      act(() => root?.render(<Harness manualPlacement={nextPlacement} />));
    },
  };
}

function startDrag(modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {}) {
  act(() => {
    const event: CalloutDragStartEvent = {
      button: 0,
      clientX: 210,
      clientY: 210,
      ctrlKey: modifiers.ctrlKey ?? false,
      currentTarget: { setPointerCapture: vi.fn() },
      nativeEvent: { stopImmediatePropagation: vi.fn() },
      pointerId: 7,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      shiftKey: modifiers.shiftKey ?? false,
    };
    drag?.handlePointerDown(event);
  });
}

function dispatchPointer(
  type: string,
  x: number,
  y: number,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {}
) {
  act(() => {
    document.dispatchEvent(
      new TestPointerEvent(type, {
        button: 0,
        clientX: x,
        clientY: y,
        ctrlKey: modifiers.ctrlKey ?? false,
        pointerId: 7,
        shiftKey: modifiers.shiftKey ?? false,
      })
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
    const harness = renderHarness();
    startDrag();
    dispatchPointer('pointermove', 260, 250);

    expect(drag?.draft?.placement).toEqual({ centerOffsetX: 140, centerOffsetY: 120 });
    expect(onPositionChange).not.toHaveBeenCalled();

    dispatchPointer('pointerup', 260, 250);

    expect(onPositionChange).toHaveBeenCalledOnce();
    expect(onPositionChange).toHaveBeenCalledWith(
      { centerOffsetX: 140, centerOffsetY: 120 },
      { translateConnectorGeometry: false }
    );
    expect(drag?.draft?.placement).toEqual({ centerOffsetX: 140, centerOffsetY: 120 });

    harness.rerender({ centerOffsetX: 140, centerOffsetY: 120 });
    expect(drag?.draft).toBeNull();
  });

  it('rolls back without a commit when pointer capture is lost', () => {
    renderHarness();
    startDrag();
    dispatchPointer('pointermove', 260, 250);
    act(() => document.dispatchEvent(new Event('lostpointercapture')));

    expect(drag?.draft).toBeNull();
    expect(drag?.isDragging).toBe(false);
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('keeps the committed draft when lost capture follows pointerup in the same event turn', () => {
    renderHarness();
    startDrag();
    dispatchPointer('pointermove', 260, 250);

    act(() => {
      document.dispatchEvent(
        new TestPointerEvent('pointerup', {
          button: 0,
          clientX: 260,
          clientY: 250,
          pointerId: 7,
        })
      );
      document.dispatchEvent(new Event('lostpointercapture'));
    });

    expect(onPositionChange).toHaveBeenCalledOnce();
    expect(drag?.draft?.placement).toEqual({ centerOffsetX: 140, centerOffsetY: 120 });
  });

  it('moves and clamps the comment through arrow-key operations', () => {
    renderHarness();
    const event = keyboardEvent('ArrowRight');

    act(() => drag?.handleKeyDown(event));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onPositionChange).toHaveBeenCalledWith(
      { centerOffsetX: 95, centerOffsetY: 80 },
      { translateConnectorGeometry: false }
    );
  });

  it('moves connector geometry with the comment during Ctrl arrow-key operations', () => {
    renderHarness();
    const event = { ...keyboardEvent('ArrowRight'), ctrlKey: true };

    act(() => drag?.handleKeyDown(event));

    expect(onPositionChange).toHaveBeenCalledWith(
      { centerOffsetX: 95, centerOffsetY: 80 },
      { translateConnectorGeometry: true }
    );
  });

  it('constrains pointer movement to the dominant axis while Shift is held', () => {
    renderHarness();
    startDrag();
    dispatchPointer('pointermove', 280, 230, { shiftKey: true });

    expect(drag?.draft?.placement).toEqual({ centerOffsetX: 160, centerOffsetY: 80 });
  });

  it('translates connector geometry only while Ctrl is held during the drag', () => {
    renderHarness();
    startDrag({ ctrlKey: true });
    dispatchPointer('pointermove', 260, 250, { ctrlKey: true });

    expect(drag?.draft?.translateConnectorGeometry).toBe(true);
    dispatchPointer('pointerup', 260, 250, { ctrlKey: true });
    expect(onPositionChange).toHaveBeenCalledWith(
      { centerOffsetX: 140, centerOffsetY: 120 },
      { translateConnectorGeometry: true }
    );
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
