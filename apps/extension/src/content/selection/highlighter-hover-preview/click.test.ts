// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHoverClickHandler } from './click';

const targetResolver = vi.hoisted(() => ({
  resolvePagePreparationTarget: vi.fn(),
}));
const eventFns = vi.hoisted(() => ({
  shouldIgnoreHighlighterClick: vi.fn(),
}));

vi.mock('../../parser/page-preparation/target', () => targetResolver);
vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({ debug: vi.fn() })),
}));
vi.mock('./events', () => eventFns);

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function createHandler() {
  return createHoverClickHandler({
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
    overlayActions: {
      hideHoverOverlay: vi.fn(),
      showHoverOverlay: vi.fn(),
    },
    trackingState: {
      hoverRafId: null,
      isHoverPreviewFrozen: false,
      lastHoverProcessTime: 0,
      lastHoverTarget: null,
      lastHoverX: 0,
      lastHoverY: 0,
    },
  });
}

function createClickEventMock(): MouseEvent {
  return {
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent;
}

function expectClickToPassThrough(event: MouseEvent): void {
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(event.stopPropagation).not.toHaveBeenCalled();
}

function shouldIgnoreClicksWithoutResolvedTarget(): void {
  const handler = createHandler();
  const event = createClickEventMock();
  targetResolver.resolvePagePreparationTarget.mockReturnValueOnce(null);

  handler(event);

  expectClickToPassThrough(event);
}

function shouldIgnoreClicksRejectedByEventGuard(): void {
  const handler = createHandler();
  const event = createClickEventMock();
  eventFns.shouldIgnoreHighlighterClick.mockReturnValueOnce(true);
  targetResolver.resolvePagePreparationTarget.mockReturnValueOnce(document.createElement('button'));

  handler(event);

  expectClickToPassThrough(event);
}

function shouldBlockDuplicateFrameCreation(): void {
  const hasFrameForElement = vi.fn(() => true);
  const handler = createHoverClickHandler({
    getCallbacks: () => ({ addFrame: vi.fn(), hasFrameForElement }),
    getState: {
      isFrameEditing: () => false,
      isModeEnabled: () => true,
      isPaused: () => false,
      isTooltipVisible: () => false,
    },
    overlayActions: {
      hideHoverOverlay: vi.fn(),
      showHoverOverlay: vi.fn(),
    },
    trackingState: {
      hoverRafId: null,
      isHoverPreviewFrozen: false,
      lastHoverProcessTime: 0,
      lastHoverTarget: document.createElement('button'),
      lastHoverX: 0,
      lastHoverY: 0,
    },
  });
  const event = createClickEventMock();

  eventFns.shouldIgnoreHighlighterClick.mockReturnValue(false);
  targetResolver.resolvePagePreparationTarget.mockReturnValue(document.createElement('div'));
  handler(event);

  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(hasFrameForElement).toHaveBeenCalledOnce();
}

function shouldCreateFrameFromLastHoverTarget(): void {
  const addFrame = vi.fn();
  const hideHoverOverlay = vi.fn();
  const lastHoverTarget = document.createElement('button');
  const trackingState = {
    hoverRafId: null,
    isHoverPreviewFrozen: false,
    lastHoverProcessTime: 0,
    lastHoverTarget,
    lastHoverX: 0,
    lastHoverY: 0,
  };
  const handler = createHoverClickHandler({
    getCallbacks: () => ({ addFrame, hasFrameForElement: vi.fn(() => false) }),
    getState: {
      isFrameEditing: () => false,
      isModeEnabled: () => true,
      isPaused: () => false,
      isTooltipVisible: () => false,
    },
    overlayActions: { hideHoverOverlay, showHoverOverlay: vi.fn() },
    trackingState,
  });

  eventFns.shouldIgnoreHighlighterClick.mockReturnValue(false);
  targetResolver.resolvePagePreparationTarget.mockReturnValue(document.createElement('div'));
  handler(createClickEventMock());

  expect(addFrame).toHaveBeenCalledWith(lastHoverTarget);
  expect(trackingState.isHoverPreviewFrozen).toBe(true);
  expect(trackingState.lastHoverTarget).toBeNull();
  expect(hideHoverOverlay).toHaveBeenCalledOnce();
}

describe('createHoverClickHandler', () => {
  it('returns early when no target can be resolved', shouldIgnoreClicksWithoutResolvedTarget);
  it('returns early when the click should be ignored', shouldIgnoreClicksRejectedByEventGuard);
  it('blocks duplicate frame creation', shouldBlockDuplicateFrameCreation);
  it('creates a new frame for the last hover target', shouldCreateFrameFromLastHoverTarget);
});
