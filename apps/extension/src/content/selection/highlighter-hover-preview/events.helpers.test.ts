// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hideHoverPreview,
  scheduleHoverOverlayUpdate,
  type HoverRuntimeMutators,
  type HoverRuntimeState,
} from './events.helpers';
import { resolvePagePreparationTarget } from '../../parser/page-preparation/target';
import { isHighlighterExtensionUiElement, isNearExistingFrameBorder } from './helpers';

vi.mock('../../parser/page-preparation/target', () => ({
  resolvePagePreparationTarget: vi.fn(),
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  isHighlighterExtensionUiElement: vi.fn(),
  isNearExistingFrameBorder: vi.fn(),
}));

function createHoverRuntimeState(overrides: Partial<HoverRuntimeState> = {}): HoverRuntimeState {
  return {
    hoverRafId: null,
    hoverState: {} as HoverRuntimeState['hoverState'],
    isHoverPreviewFrozen: false,
    lastHoverProcessTime: 0,
    lastHoverTarget: null,
    lastHoverX: 0,
    lastHoverY: 0,
    ...overrides,
  };
}

function createHoverRuntimeMutators(): HoverRuntimeMutators {
  return {
    hideHoverOverlay: vi.fn(),
    setHoverRafId: vi.fn(),
    setHoverPreviewFrozen: vi.fn(),
    setLastHoverProcessTime: vi.fn(),
    setLastHoverTarget: vi.fn(),
    setLastHoverX: vi.fn(),
    setLastHoverY: vi.fn(),
    showHoverOverlay: vi.fn(),
  };
}

function createMouseEvent(): MouseEvent {
  return new MouseEvent('mousemove', {
    clientX: 120,
    clientY: 80,
  });
}

function createScheduleArgs(
  overrides: {
    event?: MouseEvent;
    getCallbacks?: () => {
      addFrame: ((element: HTMLElement) => void) | null;
      hasFrameForElement: ((element: HTMLElement) => boolean) | null;
    };
    getState?: {
      isModeEnabled: () => boolean;
      isPaused: () => boolean;
    };
    hoverRuntime?: HoverRuntimeState;
    iframe?: HTMLIFrameElement;
    mutators?: HoverRuntimeMutators;
  } = {}
) {
  const iframeProps = overrides.iframe === undefined ? {} : { iframe: overrides.iframe };
  return {
    event: overrides.event ?? createMouseEvent(),
    getCallbacks:
      overrides.getCallbacks ??
      (() => ({
        addFrame: null,
        hasFrameForElement: null,
      })),
    getState:
      overrides.getState ??
      (() => ({
        isModeEnabled: () => true,
        isPaused: () => false,
      }))(),
    hoverRuntime: overrides.hoverRuntime ?? createHoverRuntimeState(),
    mutators: overrides.mutators ?? createHoverRuntimeMutators(),
    ...iframeProps,
  };
}

function registerHideHoverPreviewTest(): void {
  it('hides the overlay and clears the last hover target', () => {
    const mutators = createHoverRuntimeMutators();

    hideHoverPreview(mutators);

    expect(mutators.hideHoverOverlay).toHaveBeenCalledTimes(1);
    expect(mutators.setLastHoverTarget).toHaveBeenCalledWith(null);
  });
}

function registerPendingRafTest(): void {
  it('does nothing while a hover frame request is already pending', () => {
    const mutators = createHoverRuntimeMutators();

    scheduleHoverOverlayUpdate(
      createScheduleArgs({
        hoverRuntime: createHoverRuntimeState({ hoverRafId: 5 }),
        mutators,
      })
    );

    expect(resolvePagePreparationTarget).not.toHaveBeenCalled();
    expect(mutators.setLastHoverX).not.toHaveBeenCalled();
    expect(mutators.setHoverRafId).not.toHaveBeenCalled();
  });
}

function registerMissingTargetTest(): void {
  it('records coordinates and hides the preview when no hover target can be resolved', () => {
    const mutators = createHoverRuntimeMutators();
    vi.mocked(resolvePagePreparationTarget).mockReturnValue(null);
    vi.spyOn(Date, 'now').mockReturnValue(321);

    scheduleHoverOverlayUpdate(createScheduleArgs({ mutators }));

    expect(mutators.setLastHoverX).toHaveBeenCalledWith(120);
    expect(mutators.setLastHoverY).toHaveBeenCalledWith(80);
    expect(mutators.setLastHoverProcessTime).toHaveBeenCalledWith(321);
    expect(mutators.hideHoverOverlay).toHaveBeenCalledTimes(1);
    expect(mutators.setLastHoverTarget).toHaveBeenCalledWith(null);
    expect(mutators.setHoverRafId).not.toHaveBeenCalled();
  });
}

function registerSuppressedTargetTest(): void {
  it('hides the preview for suppressed targets inside extension UI', () => {
    const target = document.createElement('div');
    const mutators = createHoverRuntimeMutators();
    vi.mocked(resolvePagePreparationTarget).mockReturnValue(target);
    vi.mocked(isHighlighterExtensionUiElement).mockReturnValue(true);
    vi.mocked(isNearExistingFrameBorder).mockReturnValue(false);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 77;
      })
    );

    scheduleHoverOverlayUpdate(createScheduleArgs({ mutators }));

    expect(mutators.setHoverRafId).toHaveBeenNthCalledWith(1, null);
    expect(mutators.hideHoverOverlay).toHaveBeenCalledTimes(1);
    expect(mutators.setLastHoverTarget).toHaveBeenCalledWith(null);
    expect(mutators.setHoverRafId).toHaveBeenNthCalledWith(2, 77);
  });
}

function registerExistingFrameTest(): void {
  it('hides the preview when a different target already has a frame', () => {
    const target = document.createElement('div');
    const previousTarget = document.createElement('div');
    const mutators = createHoverRuntimeMutators();
    vi.mocked(resolvePagePreparationTarget).mockReturnValue(target);
    vi.mocked(isHighlighterExtensionUiElement).mockReturnValue(false);
    vi.mocked(isNearExistingFrameBorder).mockReturnValue(false);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 88;
      })
    );

    scheduleHoverOverlayUpdate(
      createScheduleArgs({
        getCallbacks: () => ({
          addFrame: null,
          hasFrameForElement: (element) => element === target,
        }),
        hoverRuntime: createHoverRuntimeState({ lastHoverTarget: previousTarget }),
        mutators,
      })
    );

    expect(mutators.hideHoverOverlay).toHaveBeenCalledTimes(1);
    expect(mutators.setLastHoverTarget).toHaveBeenCalledWith(null);
    expect(mutators.showHoverOverlay).not.toHaveBeenCalled();
  });
}

function registerRepeatedTargetTest(): void {
  it('keeps the current preview when the resolved target matches the previous hover target', () => {
    const target = document.createElement('div');
    const mutators = createHoverRuntimeMutators();
    vi.mocked(resolvePagePreparationTarget).mockReturnValue(target);
    vi.mocked(isHighlighterExtensionUiElement).mockReturnValue(false);
    vi.mocked(isNearExistingFrameBorder).mockReturnValue(false);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 99;
      })
    );

    scheduleHoverOverlayUpdate(
      createScheduleArgs({
        hoverRuntime: createHoverRuntimeState({ lastHoverTarget: target }),
        mutators,
      })
    );

    expect(mutators.hideHoverOverlay).not.toHaveBeenCalled();
    expect(mutators.showHoverOverlay).not.toHaveBeenCalled();
    expect(mutators.setLastHoverTarget).not.toHaveBeenCalled();
  });
}

function registerVisibleTargetTest(): void {
  it('shows the overlay for a new eligible hover target', () => {
    const target = document.createElement('div');
    const mutators = createHoverRuntimeMutators();
    vi.mocked(resolvePagePreparationTarget).mockReturnValue(target);
    vi.mocked(isHighlighterExtensionUiElement).mockReturnValue(false);
    vi.mocked(isNearExistingFrameBorder).mockReturnValue(false);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 111;
      })
    );

    scheduleHoverOverlayUpdate(createScheduleArgs({ mutators }));

    expect(resolvePagePreparationTarget).toHaveBeenCalledTimes(1);
    expect(mutators.showHoverOverlay).toHaveBeenCalledWith(target);
    expect(mutators.setLastHoverTarget).toHaveBeenCalledWith(target);
  });
}

function registerDisabledModeTest(): void {
  it('stops inside the animation frame when hover mode is disabled or paused', () => {
    const target = document.createElement('div');
    const mutators = createHoverRuntimeMutators();
    vi.mocked(resolvePagePreparationTarget).mockReturnValue(target);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 212;
      })
    );

    scheduleHoverOverlayUpdate(
      createScheduleArgs({
        getState: {
          isModeEnabled: () => false,
          isPaused: () => true,
        },
        mutators,
      })
    );

    expect(mutators.setHoverRafId).toHaveBeenNthCalledWith(1, null);
    expect(mutators.showHoverOverlay).not.toHaveBeenCalled();
    expect(mutators.hideHoverOverlay).not.toHaveBeenCalled();
  });
}

describe('highlighter hover preview event helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  registerHideHoverPreviewTest();
  registerPendingRafTest();
  registerMissingTargetTest();
  registerSuppressedTargetTest();
  registerExistingFrameTest();
  registerRepeatedTargetTest();
  registerVisibleTargetTest();
  registerDisabledModeTest();
});
