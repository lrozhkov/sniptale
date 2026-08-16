// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createDefaultCalloutSettings } from './model';
import { useCalloutInteractionLayout } from './interaction-layout';
import type { CalloutTailDragStartEvent } from './tail-drag';
import type { CalloutDragStartEvent } from './drag';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init);
    this.pointerId = init.pointerId;
  }
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let interaction: ReturnType<typeof useCalloutInteractionLayout> | null = null;

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  interaction = null;
});

it('renders the wedge frame endpoint live before committing the pointer drag', () => {
  const onTailFramePositionChange = vi.fn();
  const settings = createDefaultCalloutSettings();
  settings.placement.connectorAttachments = {
    block: { mode: 'auto' },
    frame: { mode: 'auto' },
  };

  function Harness() {
    interaction = useCalloutInteractionLayout({
      dimensions: { height: 60, width: 160 },
      frameBorderWidth: 2,
      frameRect: { height: 100, width: 200, x: 100, y: 100 },
      isEditing: false,
      onCurveChange: vi.fn(),
      onPositionChange: vi.fn(),
      onTailBaseRangeChange: vi.fn(),
      onTailFramePositionChange,
      onWaypointChange: vi.fn(),
      onWidthChange: vi.fn(),
      settings,
      visualScale: 1,
      wrapperRef: { current: null },
      zIndex: 20,
    });
    return null;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  const initialTip = interaction?.layout.dynamicTail?.attachment.tipPoint;
  expect(initialTip).toBeDefined();

  const startEvent: CalloutTailDragStartEvent = {
    button: 0,
    currentTarget: { setPointerCapture: vi.fn() },
    nativeEvent: { stopImmediatePropagation: vi.fn() },
    pointerId: 7,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  act(() => interaction?.handles.tailFrameDrag.handlePointerDown(startEvent));
  act(() => {
    document.dispatchEvent(
      new TestPointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        clientX: 250,
        clientY: 100,
        pointerId: 7,
      })
    );
  });

  const draftTip = interaction?.layout.dynamicTail?.attachment.tipPoint;
  expect(interaction?.effectiveSettings.placement.connectorAttachments?.frame).toEqual({
    mode: 'free',
    perimeterPosition: 0.75,
  });
  expect(draftTip?.x).not.toBe(initialTip?.x);
  expect(onTailFramePositionChange).not.toHaveBeenCalled();

  act(() => {
    document.dispatchEvent(
      new TestPointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: 250,
        clientY: 100,
        pointerId: 7,
      })
    );
  });
  expect(onTailFramePositionChange).toHaveBeenCalledWith(0.75);
});

it('moves the complete wedge base live while preserving its width', () => {
  const onTailBaseRangeChange = vi.fn();
  const settings = createDefaultCalloutSettings();

  function Harness() {
    interaction = useCalloutInteractionLayout({
      dimensions: { height: 60, width: 160 },
      frameBorderWidth: 2,
      frameRect: { height: 100, width: 200, x: 100, y: 100 },
      isEditing: false,
      onCurveChange: vi.fn(),
      onPositionChange: vi.fn(),
      onTailBaseRangeChange,
      onTailFramePositionChange: vi.fn(),
      onWaypointChange: vi.fn(),
      onWidthChange: vi.fn(),
      settings,
      visualScale: 1,
      wrapperRef: { current: null },
      zIndex: 20,
    });
    return null;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  const initialPosition = interaction?.effectiveSettings.placement.connectorBasePosition ?? 0.5;
  const layout = interaction!.layout;
  const side = layout.dynamicTail!.side;
  const horizontal = side === 'top' || side === 'bottom';
  const attachment = layout.dynamicTail!.attachment;
  if (!('baseEdgeA' in attachment) || !attachment.baseEdgeA || !attachment.baseEdgeB) {
    throw new Error('Expected a wedge base');
  }
  const initialWidth = horizontal
    ? Math.abs(attachment.baseEdgeB.x - attachment.baseEdgeA.x) / layout.calloutDimensions.width
    : Math.abs(attachment.baseEdgeB.y - attachment.baseEdgeA.y) / layout.calloutDimensions.height;
  const centerX = layout.calloutPos.x + layout.calloutDimensions.width / 2;
  const centerY = layout.calloutPos.y + layout.calloutDimensions.height / 2;
  const startEvent: CalloutTailDragStartEvent = {
    button: 0,
    currentTarget: { setPointerCapture: vi.fn() },
    nativeEvent: { stopImmediatePropagation: vi.fn() },
    pointerId: 8,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };

  act(() => interaction?.handles.tailBaseRangeDrag.handlePointerDown(startEvent));
  act(() => {
    document.dispatchEvent(
      new TestPointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        clientX: horizontal ? centerX + 30 : centerX,
        clientY: horizontal ? centerY : centerY + 20,
        pointerId: 8,
      })
    );
  });

  expect(interaction?.effectiveSettings.placement.connectorBasePosition).not.toBe(initialPosition);
  expect(interaction?.effectiveSettings.placement.connectorBaseWidth).toBeCloseTo(initialWidth);
  expect(onTailBaseRangeChange).not.toHaveBeenCalled();

  act(() => {
    document.dispatchEvent(
      new TestPointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: horizontal ? centerX + 30 : centerX,
        clientY: horizontal ? centerY : centerY + 20,
        pointerId: 8,
      })
    );
  });
  const committedRange = onTailBaseRangeChange.mock.calls[0];
  expect(committedRange?.[0]).toEqual(expect.any(Number));
  expect(committedRange?.[1]).toBeCloseTo(initialWidth);
});

it('projects whole-callout dragging through the effective shared connector settings', () => {
  const onPositionChange = vi.fn();
  const settings = createDefaultCalloutSettings();
  settings.style.connector.kind = 'line';
  function Harness() {
    const wrapperRef = { current: document.querySelector<HTMLDivElement>('[data-wrapper]') };
    interaction = useCalloutInteractionLayout({
      dimensions: { height: 60, width: 160 },
      frameBorderWidth: 2,
      frameRect: { height: 100, width: 200, x: 100, y: 100 },
      isEditing: false,
      onCurveChange: vi.fn(),
      onPositionChange,
      onTailBaseRangeChange: vi.fn(),
      onTailFramePositionChange: vi.fn(),
      onWaypointChange: vi.fn(),
      onWidthChange: vi.fn(),
      settings,
      visualScale: 1,
      wrapperRef,
      zIndex: 20,
    });
    return <div data-wrapper />;
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  act(() => root?.render(<Harness />));
  const wrapper = container.querySelector<HTMLElement>('[data-wrapper]')!;
  vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 20, 160, 60));
  const startEvent: CalloutDragStartEvent = {
    button: 0,
    clientX: 210,
    clientY: 30,
    ctrlKey: true,
    currentTarget: { setPointerCapture: vi.fn() },
    nativeEvent: { stopImmediatePropagation: vi.fn() },
    pointerId: 7,
    preventDefault: vi.fn(),
    shiftKey: false,
    stopPropagation: vi.fn(),
  };
  act(() => interaction?.handles.drag.handlePointerDown(startEvent));
  act(() =>
    document.dispatchEvent(
      new TestPointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        clientX: 260,
        clientY: 80,
        ctrlKey: true,
        pointerId: 7,
      })
    )
  );
  expect(interaction?.effectiveSettings.placement.manualPlacement).toBeDefined();
  act(() =>
    document.dispatchEvent(
      new TestPointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: 260,
        clientY: 80,
        ctrlKey: true,
        pointerId: 7,
      })
    )
  );
  expect(onPositionChange).toHaveBeenCalled();
});
