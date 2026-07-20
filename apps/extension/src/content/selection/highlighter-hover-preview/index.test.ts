// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHighlighterHoverController, logAccessibleIframeCount } from '.';

const helperState = {
  cachedHighlighterSettings: { border: true } as unknown,
  frameCacheDirty: false,
  hoverOverlay: null as HTMLElement | null,
  overlayContainer: null as HTMLElement | null,
  settingsLoadPromise: Promise.resolve(),
};
const helperFns = vi.hoisted(() => ({
  applyHighlighterSettingsChange: vi.fn(() => true),
  createHighlighterHoverState: vi.fn(() => helperState),
  ensureHighlighterOverlayContainer: vi.fn(),
  ensureHighlighterSettingsLoaded: vi.fn(() => Promise.resolve()),
  ensureHoverOverlay: vi.fn(),
  getCurrentBorderPreset: vi.fn(() => ({ padding: 4, width: 2 })),
  hideHoverOverlay: vi.fn(),
  removeHighlighterOverlayContainer: vi.fn(),
  removeHoverOverlay: vi.fn(),
  showHoverOverlay: vi.fn(),
}));
const interactionFns = vi.hoisted(() => ({
  createHoverInteractionHandlers: vi.fn(),
}));
const iframeUtils = vi.hoisted(() => ({
  getAbsolutePosition: vi.fn(() => ({ height: 40, width: 30, x: 10, y: 20 })),
  getAccessibleIframes: vi.fn(() => [document.createElement('iframe')]),
}));
const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../platform/frame', () => iframeUtils);
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: vi.fn(() => logger),
}));
vi.mock('./helpers', () => helperFns);
vi.mock('./interactions', () => interactionFns);

function createStateGetters() {
  return {
    isFrameEditing: () => false,
    isModeEnabled: () => true,
    isPaused: () => false,
    isTooltipVisible: () => false,
  };
}

function shouldManageOverlayLifecycleAndLogging(): void {
  interactionFns.createHoverInteractionHandlers.mockImplementation((props) => {
    props.trackingState.hoverRafId = 7;
    return {
      handleClick: () => props.overlayActions.showHoverOverlay(document.createElement('div')),
      handleMouseLeave: vi.fn(),
      handleMouseMove: vi.fn(),
    };
  });

  const controller = createHighlighterHoverController(
    () => ({ addFrame: vi.fn(), hasFrameForElement: vi.fn(() => false) }),
    createStateGetters()
  );

  controller.createOverlayContainer();
  controller.createHoverOverlay();
  controller.removeHoverOverlay();
  controller.removeOverlayContainer();
  controller.invalidateFrameCache();
  controller.invalidateSettingsCache({ defaultBorderPresetId: 'preset-2' });
  controller.cancelPendingHoverFrame();
  controller.clearHoverTracking();
  controller.handleClick(new MouseEvent('click'));
  logAccessibleIframeCount();

  expect(helperFns.ensureHighlighterOverlayContainer).toHaveBeenCalledWith(helperState);
  expect(helperFns.ensureHoverOverlay).toHaveBeenCalledWith(
    helperState,
    helperFns.getCurrentBorderPreset.mock.results[0]?.value
  );
  expect(helperFns.removeHoverOverlay).toHaveBeenCalledWith(helperState);
  expect(helperFns.removeHighlighterOverlayContainer).toHaveBeenCalledWith(helperState);
  expect(helperState.frameCacheDirty).toBe(true);
  expect(helperState.cachedHighlighterSettings).toEqual({ border: true });
  expect(helperState.settingsLoadPromise).toEqual(Promise.resolve());
  expect(helperFns.applyHighlighterSettingsChange).toHaveBeenCalledWith(helperState, {
    defaultBorderPresetId: 'preset-2',
  });
  expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  expect(logger.warn).toHaveBeenCalledWith(
    'Cannot show hover overlay without overlay container state'
  );
  expect(logger.log).toHaveBeenCalledWith('Highlighter mode enabled', { accessibleIframes: 1 });
}

function shouldShowHoverOverlayWhenStateIsAvailable(): void {
  const overlay = document.createElement('div');
  const container = document.createElement('div');
  helperState.hoverOverlay = overlay;
  helperState.overlayContainer = container;
  interactionFns.createHoverInteractionHandlers.mockImplementation((props) => ({
    handleClick: () => props.overlayActions.showHoverOverlay(document.createElement('button')),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
  }));

  const controller = createHighlighterHoverController(
    () => ({ addFrame: vi.fn(), hasFrameForElement: vi.fn(() => false) }),
    createStateGetters()
  );

  controller.handleClick(new MouseEvent('click'));

  expect(helperFns.showHoverOverlay).toHaveBeenCalledWith(
    helperState,
    iframeUtils.getAbsolutePosition.mock.results[0]?.value,
    helperFns.getCurrentBorderPreset.mock.results[0]?.value
  );
  expect(logger.debug).toHaveBeenCalledWith(
    'Showing hover overlay',
    expect.objectContaining({
      calculatedCoords: expect.any(Object),
      presetBorderWidth: 2,
      presetPadding: 4,
    })
  );
}

describe('highlighter hover preview controller', () => {
  beforeEach(() => {
    helperState.cachedHighlighterSettings = { border: true } as unknown;
    helperState.frameCacheDirty = false;
    helperState.hoverOverlay = null;
    helperState.overlayContainer = null;
    helperState.settingsLoadPromise = Promise.resolve();
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it(
    'creates overlay actions, invalidates caches, and logs accessible iframe count',
    shouldManageOverlayLifecycleAndLogging
  );
  it(
    'shows the hover overlay when overlay state is available',
    shouldShowHoverOverlayWhenStateIsAvailable
  );
});
