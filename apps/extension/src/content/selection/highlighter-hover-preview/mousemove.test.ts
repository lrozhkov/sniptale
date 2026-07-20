// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const eventFns = vi.hoisted(() => ({
  handleFrozenHoverPreview: vi.fn(),
  scheduleHoverOverlayUpdate: vi.fn(),
  shouldSkipHoverProcessing: vi.fn(),
}));

vi.mock('./events', () => eventFns);

import { createHoverMouseMoveHandler } from './mousemove';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function createProps() {
  return {
    getCallbacks: () => ({
      addFrame: vi.fn(),
      hasFrameForElement: vi.fn(() => false),
    }),
    getState: {
      isFrameEditing: () => false,
      isModeEnabled: () => true,
      isPaused: () => false,
      isTooltipVisible: () => false,
    },
    hoverState: {
      cachedHighlighterSettings: null,
      frameCache: new Map(),
      frameCacheDirty: false,
      hoverOverlay: null,
      overlayContainer: null,
      settingsLoadPromise: null,
    },
    hoverThrottleMs: 100,
    overlayActions: {
      hideHoverOverlay: vi.fn(),
      showHoverOverlay: vi.fn(),
    },
    trackingState: {
      hoverRafId: null as number | null,
      isHoverPreviewFrozen: false,
      lastHoverProcessTime: 0,
      lastHoverTarget: null as HTMLElement | null,
      lastHoverX: 0,
      lastHoverY: 0,
    },
  };
}

function shouldSkipProcessingWhenTheEventGateRejectsTheMove(): void {
  const props = createProps();
  const handler = createHoverMouseMoveHandler(props);
  eventFns.shouldSkipHoverProcessing.mockReturnValueOnce(true);

  handler(new MouseEvent('mousemove'));

  expect(eventFns.handleFrozenHoverPreview).not.toHaveBeenCalled();
  expect(eventFns.scheduleHoverOverlayUpdate).not.toHaveBeenCalled();
}

function shouldStopWhenFrozenHoverHandlingConsumesTheEvent(): void {
  const props = createProps();
  const handler = createHoverMouseMoveHandler(props);
  eventFns.shouldSkipHoverProcessing.mockReturnValueOnce(false);
  eventFns.handleFrozenHoverPreview.mockReturnValueOnce(true);

  handler(new MouseEvent('mousemove', { clientX: 12, clientY: 18 }));

  expect(eventFns.handleFrozenHoverPreview).toHaveBeenCalledOnce();
  expect(eventFns.scheduleHoverOverlayUpdate).not.toHaveBeenCalled();
}

function shouldScheduleOverlayUpdatesAndExposeMutators(): void {
  const props = createProps();
  const handler = createHoverMouseMoveHandler(props);
  const event = new MouseEvent('mousemove', { clientX: 20, clientY: 24 });
  const iframe = document.createElement('iframe');
  eventFns.shouldSkipHoverProcessing.mockReturnValueOnce(false);
  eventFns.handleFrozenHoverPreview.mockReturnValueOnce(false);

  handler(event, iframe);

  const scheduleCall = eventFns.scheduleHoverOverlayUpdate.mock.calls[0]?.[0];
  expect(scheduleCall.iframe).toBe(iframe);
  expect(scheduleCall.hoverRuntime.lastHoverX).toBe(0);

  scheduleCall.mutators.setHoverRafId(7);
  scheduleCall.mutators.setHoverPreviewFrozen(true);
  scheduleCall.mutators.setLastHoverProcessTime(42);
  scheduleCall.mutators.setLastHoverTarget(document.createElement('div'));
  scheduleCall.mutators.setLastHoverX(21);
  scheduleCall.mutators.setLastHoverY(22);

  expect(props.trackingState.hoverRafId).toBe(7);
  expect(props.trackingState.isHoverPreviewFrozen).toBe(true);
  expect(props.trackingState.lastHoverProcessTime).toBe(42);
  expect(props.trackingState.lastHoverX).toBe(21);
  expect(props.trackingState.lastHoverY).toBe(22);
  scheduleCall.mutators.hideHoverOverlay();
  scheduleCall.mutators.showHoverOverlay({
    hoveredElement: document.createElement('div'),
    rect: new DOMRect(0, 0, 10, 10),
  });
  expect(props.overlayActions.hideHoverOverlay).toHaveBeenCalledOnce();
  expect(props.overlayActions.showHoverOverlay).toHaveBeenCalledOnce();
}

function shouldScheduleOverlayUpdatesWithoutIframeWhenThePrimaryPageOwnsTheMove(): void {
  const props = createProps();
  const handler = createHoverMouseMoveHandler(props);
  eventFns.shouldSkipHoverProcessing.mockReturnValueOnce(false);
  eventFns.handleFrozenHoverPreview.mockReturnValueOnce(false);

  handler(new MouseEvent('mousemove', { clientX: 5, clientY: 6 }));

  expect(eventFns.scheduleHoverOverlayUpdate).toHaveBeenCalledWith(
    expect.not.objectContaining({
      iframe: expect.anything(),
    })
  );
}

describe('hover mousemove handler', () => {
  it(
    'skips processing when the event gate rejects the move',
    shouldSkipProcessingWhenTheEventGateRejectsTheMove
  );
  it(
    'stops when frozen hover handling consumes the event',
    shouldStopWhenFrozenHoverHandlingConsumesTheEvent
  );
  it(
    'schedules overlay updates and exposes runtime mutators',
    shouldScheduleOverlayUpdatesAndExposeMutators
  );
  it(
    'schedules overlay updates without an iframe when the main page owns the hover move',
    shouldScheduleOverlayUpdatesWithoutIframeWhenThePrimaryPageOwnsTheMove
  );
});
