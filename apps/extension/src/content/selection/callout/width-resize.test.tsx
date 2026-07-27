// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useCalloutWidthResize, type CalloutWidthResizeStartEvent } from './width-resize';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init);
    this.pointerId = init.pointerId;
  }
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let resize: ReturnType<typeof useCalloutWidthResize> | null = null;
const onWidthChange = vi.fn();

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  resize = null;
  onWidthChange.mockReset();
  vi.restoreAllMocks();
});

function renderHarness(maxWidth = 200, dimensions = { width: 224, height: 64 }) {
  function Harness(props: { dimensions: { width: number; height: number }; maxWidth: number }) {
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    resize = useCalloutWidthResize({
      frameRect: { x: 100, y: 100, width: 120, height: 80 },
      dimensions: props.dimensions,
      isEditing: false,
      manualPlacement: undefined,
      maxWidth: props.maxWidth,
      onWidthChange,
      wrapperRef,
    });
    return <div ref={wrapperRef} data-ui="callout-wrapper" />;
  }

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness dimensions={dimensions} maxWidth={maxWidth} />));
  const wrapper = container.querySelector<HTMLElement>('[data-ui="callout-wrapper"]');
  vi.spyOn(wrapper!, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 200, 224, 64));
  return {
    rerender: (nextMaxWidth: number, nextDimensions = dimensions) =>
      act(() => root?.render(<Harness dimensions={nextDimensions} maxWidth={nextMaxWidth} />)),
  };
}

function startResize(side: 'left' | 'right') {
  const event: CalloutWidthResizeStartEvent = {
    button: 0,
    clientX: side === 'left' ? 200 : 424,
    currentTarget: { setPointerCapture: vi.fn() },
    nativeEvent: { stopImmediatePropagation: vi.fn() },
    pointerId: 9,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  act(() => resize?.handlePointerDown(side, event));
}

function dispatchPointer(type: string, x: number) {
  act(() => {
    document.dispatchEvent(
      new TestPointerEvent(type, { button: 0, clientX: x, clientY: 232, pointerId: 9 })
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

describe('useCalloutWidthResize', () => {
  it('previews only maxWidth and commits right-edge resize once with automatic height', () => {
    const harness = renderHarness();
    startResize('right');
    dispatchPointer('pointermove', 484);
    harness.rerender(200, { width: 284, height: 80 });

    expect(resize?.draftMaxWidth).toBe(260);
    expect(onWidthChange).not.toHaveBeenCalled();

    dispatchPointer('pointerup', 484);

    expect(onWidthChange).toHaveBeenCalledOnce();
    expect(onWidthChange).toHaveBeenCalledWith(260, {
      centerOffsetX: 182,
      centerOffsetY: 92,
    });
    expect(resize?.draftMaxWidth).toBe(260);

    harness.rerender(260);
    expect(resize?.draftMaxWidth).toBeNull();
  });

  it('keeps the right edge fixed while the left handle changes the width', () => {
    const harness = renderHarness();
    startResize('left');
    dispatchPointer('pointermove', 240);
    harness.rerender(200, { width: 184, height: 80 });

    expect(resize?.draftMaxWidth).toBe(160);
    expect(resize?.draftPlacement).toEqual({
      centerOffsetX: 172,
      centerOffsetY: 92,
    });
  });

  it('rolls back width and placement when the resize gesture is cancelled', () => {
    renderHarness();
    startResize('right');
    dispatchPointer('pointermove', 484);
    act(() => document.dispatchEvent(new Event('pointercancel')));

    expect(resize?.draftMaxWidth).toBeNull();
    expect(resize?.draftPlacement).toBeNull();
    expect(onWidthChange).not.toHaveBeenCalled();
  });

  it('resizes each side in its visual arrow direction through the keyboard', () => {
    renderHarness();
    const rightEvent = keyboardEvent('ArrowRight');

    act(() => resize?.handleKeyDown('right', rightEvent));

    expect(rightEvent.preventDefault).toHaveBeenCalledOnce();
    expect(onWidthChange).toHaveBeenCalledWith(205, {
      centerOffsetX: 152,
      centerOffsetY: 92,
    });

    onWidthChange.mockClear();
    const leftEvent = keyboardEvent('ArrowLeft', true);
    act(() => resize?.handleKeyDown('left', leftEvent));

    expect(onWidthChange).toHaveBeenCalledWith(210, {
      centerOffsetX: 152,
      centerOffsetY: 92,
    });
  });

  it('does not commit keyboard input beyond the minimum width', () => {
    renderHarness(100);
    const event = keyboardEvent('ArrowRight');

    act(() => resize?.handleKeyDown('left', event));

    expect(onWidthChange).not.toHaveBeenCalled();
  });
});
