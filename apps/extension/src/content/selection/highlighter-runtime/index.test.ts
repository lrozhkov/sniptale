// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const facade = vi.hoisted(() => ({
  clearAllHighlights: vi.fn(),
  clearFrameEditing: vi.fn(),
  clearFrameTooltipVisible: vi.fn(),
  createLazyOwner: vi.fn(),
  disableMode: vi.fn(),
  enableMode: vi.fn(),
  getOwner: vi.fn(),
  getOwnerIfCreated: vi.fn(),
  invalidateFrameCache: vi.fn(),
  isEnabled: vi.fn(() => true),
  isPausedState: vi.fn(() => true),
  pause: vi.fn(),
  registerContentMode: vi.fn(),
  registerFrameCallbacks: vi.fn(),
  resume: vi.fn(),
  setFrameEditing: vi.fn(),
  setFrameTooltipVisible: vi.fn(),
}));

vi.mock('../../application/default-owner', () => ({
  createLazyContentDefaultOwner: facade.createLazyOwner,
}));
vi.mock('../../application/mode-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/mode-session')>()),
  registerContentMode: facade.registerContentMode,
}));
vi.mock('./controller', () => ({ createHighlighterController: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const owner = {
    clearAllHighlights: facade.clearAllHighlights,
    clearFrameEditing: facade.clearFrameEditing,
    clearFrameTooltipVisible: facade.clearFrameTooltipVisible,
    disableMode: facade.disableMode,
    enableMode: facade.enableMode,
    invalidateFrameCache: facade.invalidateFrameCache,
    isEnabled: facade.isEnabled,
    isPausedState: facade.isPausedState,
    pause: facade.pause,
    registerFrameCallbacks: facade.registerFrameCallbacks,
    resume: facade.resume,
    setFrameEditing: facade.setFrameEditing,
    setFrameTooltipVisible: facade.setFrameTooltipVisible,
  };
  facade.getOwner.mockReturnValue(owner);
  facade.getOwnerIfCreated.mockReturnValue(owner);
  facade.createLazyOwner.mockReturnValue({
    getOwner: facade.getOwner,
    getOwnerIfCreated: facade.getOwnerIfCreated,
  });
});

it('forwards linked and free-frame callbacks through the lazy runtime owner', async () => {
  const { registerFrameCallbacks } = await import('.');
  const addFrame = vi.fn();
  const addFreeFrame = vi.fn();
  const removeFrame = vi.fn();
  const clearFrames = vi.fn();
  const hasFrameForElement = vi.fn(() => false);

  registerFrameCallbacks(addFrame, addFreeFrame, removeFrame, clearFrames, hasFrameForElement);

  expect(facade.registerFrameCallbacks).toHaveBeenCalledWith(
    addFrame,
    addFreeFrame,
    removeFrame,
    clearFrames,
    hasFrameForElement
  );
});

it('routes highlighter commands and queries through the created owner', async () => {
  const runtime = await import('.');

  runtime.invalidateFrameCache();
  runtime.enableHighlighterMode();
  runtime.disableHighlighterMode();
  runtime.clearAllHighlights();
  runtime.pauseHighlighter();
  runtime.resumeHighlighter();
  runtime.setFrameEditing();
  runtime.clearFrameEditing();
  runtime.setFrameTooltipVisible();
  runtime.clearFrameTooltipVisible();

  expect(runtime.isHighlighterEnabled()).toBe(true);
  expect(runtime.isHighlighterPausedState()).toBe(true);
  expect(facade.invalidateFrameCache).toHaveBeenCalledOnce();
  expect(facade.enableMode).toHaveBeenCalledOnce();
  expect(facade.disableMode).toHaveBeenCalledOnce();
  expect(facade.clearAllHighlights).toHaveBeenCalledOnce();
  expect(facade.pause).toHaveBeenCalledOnce();
  expect(facade.resume).toHaveBeenCalledOnce();
  expect(facade.setFrameEditing).toHaveBeenCalledOnce();
  expect(facade.clearFrameEditing).toHaveBeenCalledOnce();
  expect(facade.setFrameTooltipVisible).toHaveBeenCalledOnce();
  expect(facade.clearFrameTooltipVisible).toHaveBeenCalledOnce();
});

it('does not create an owner for disabled-state queries or cleanup', async () => {
  facade.getOwnerIfCreated.mockReturnValue(undefined);
  const runtime = await import('.');

  runtime.disableHighlighterMode();

  expect(runtime.isHighlighterEnabled()).toBe(false);
  expect(runtime.isHighlighterPausedState()).toBe(false);
  expect(facade.disableMode).not.toHaveBeenCalled();
  expect(facade.getOwner).not.toHaveBeenCalled();
});
