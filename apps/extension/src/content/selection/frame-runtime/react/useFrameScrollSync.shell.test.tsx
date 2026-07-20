// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const clearDebounce = vi.fn();
  const debouncedHandleScroll = vi.fn();
  const handleScroll = vi.fn();
  const iframeCleanup = vi.fn();
  const observer = { disconnect: vi.fn() };

  return {
    addIframeListeners: vi.fn(),
    clearDebounce,
    createFrameScrollHandler: vi.fn(() => handleScroll),
    createDebouncedScrollHandler: vi.fn(() => ({ clearDebounce, debouncedHandleScroll })),
    debouncedHandleScroll,
    handleScroll,
    iframeCleanup,
    observer,
    observeIframeInsertions: vi.fn(() => observer),
    registerIframeScrollListeners: vi.fn(() => ({
      addIframeListeners: mocks.addIframeListeners,
      iframeCleanups: [iframeCleanup],
    })),
  };
});

vi.mock('../roots/scroll/frame-updates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../roots/scroll/frame-updates')>()),
  createFrameScrollHandler: mocks.createFrameScrollHandler,
}));

vi.mock('../roots/scroll/debounce', () => ({
  createDebouncedScrollHandler: mocks.createDebouncedScrollHandler,
}));

vi.mock('../roots/scroll/iframe-observer', () => ({
  observeIframeInsertions: mocks.observeIframeInsertions,
}));

vi.mock('../roots/scroll/iframe-registration', () => ({
  registerIframeScrollListeners: mocks.registerIframeScrollListeners,
}));

import { useFrameScrollSync } from './useFrameScrollSync';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createArgs() {
  return {
    frameStatesRef: { current: new Map() },
    framesRef: { current: [] },
    linkedElementsRef: { current: new Map() },
    setFrames: vi.fn(),
  };
}

function Harness({ args }: { args: ReturnType<typeof createArgs> }) {
  useFrameScrollSync(args);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.addIframeListeners.mockClear();
  mocks.clearDebounce.mockClear();
  mocks.createFrameScrollHandler.mockClear();
  mocks.createDebouncedScrollHandler.mockClear();
  mocks.debouncedHandleScroll.mockClear();
  mocks.handleScroll.mockClear();
  mocks.iframeCleanup.mockClear();
  mocks.observeIframeInsertions.mockClear();
  mocks.observer.disconnect.mockClear();
  mocks.registerIframeScrollListeners.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useFrameScrollSync hook shell', () => {
  it('wires scroll listeners and cleans them up through owner-local seams', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const addDocumentListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeDocumentListenerSpy = vi.spyOn(document, 'removeEventListener');
    const args = createArgs();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness args={args} />);
    });

    expect(mocks.createFrameScrollHandler).toHaveBeenCalledWith(args);
    expect(mocks.createDebouncedScrollHandler).toHaveBeenCalledWith(mocks.handleScroll);
    expect(mocks.registerIframeScrollListeners).toHaveBeenCalledWith(mocks.debouncedHandleScroll);
    expect(mocks.observeIframeInsertions).toHaveBeenCalledWith(mocks.addIframeListeners);
    expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', mocks.debouncedHandleScroll, {
      passive: true,
    });
    expect(addDocumentListenerSpy).toHaveBeenCalledWith('scroll', mocks.debouncedHandleScroll, {
      capture: true,
      passive: true,
    });
    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', mocks.debouncedHandleScroll);

    await act(async () => {
      root?.unmount();
    });

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', mocks.debouncedHandleScroll);
    expect(removeDocumentListenerSpy).toHaveBeenCalledWith('scroll', mocks.debouncedHandleScroll, {
      capture: true,
    });
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', mocks.debouncedHandleScroll);
    expect(mocks.iframeCleanup).toHaveBeenCalledTimes(1);
    expect(mocks.observer.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.clearDebounce).toHaveBeenCalledTimes(1);
  });
});
