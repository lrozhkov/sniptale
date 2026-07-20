// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  handleFrozenHoverPreview,
  scheduleHoverOverlayUpdate,
  shouldIgnoreHighlighterClick,
} from './events';
import type { HoverRuntimeMutators } from './events.helpers';

function createIframeTarget() {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;
  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected iframe document');
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  const innerTarget = iframeDoc.createElement('div');
  innerTarget.textContent = 'Hover target';
  iframeDoc.body.appendChild(innerTarget);
  Object.defineProperty(iframeDoc, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => innerTarget),
  });

  return { iframe, innerTarget };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function createIframeHoverOverlayUpdateArgs(
  iframe: HTMLIFrameElement,
  showHoverOverlay: HoverRuntimeMutators['showHoverOverlay'],
  hideHoverOverlay: HoverRuntimeMutators['hideHoverOverlay'],
  setLastHoverTarget: HoverRuntimeMutators['setLastHoverTarget']
) {
  return {
    event: {
      clientX: 18,
      clientY: 10,
      target: iframe,
      composedPath: () => [iframe],
    } as unknown as MouseEvent,
    iframe,
    getCallbacks: () => ({
      addFrame: vi.fn(),
      hasFrameForElement: vi.fn(() => false),
    }),
    getState: {
      isModeEnabled: () => true,
      isPaused: () => false,
    },
    hoverRuntime: {
      hoverRafId: null,
      hoverState: { frameCache: new Map(), frameCacheDirty: false } as never,
      isHoverPreviewFrozen: false,
      lastHoverProcessTime: 0,
      lastHoverTarget: null,
      lastHoverX: -1,
      lastHoverY: -1,
    },
    mutators: {
      hideHoverOverlay,
      setHoverRafId: vi.fn<(value: number | null) => void>(),
      setHoverPreviewFrozen: vi.fn<(value: boolean) => void>(),
      setLastHoverProcessTime: vi.fn<(value: number) => void>(),
      setLastHoverTarget,
      setLastHoverX: vi.fn<(value: number) => void>(),
      setLastHoverY: vi.fn<(value: number) => void>(),
      showHoverOverlay,
    },
  };
}

function shouldShowHoverOverlayForIframeTargets(): void {
  const { iframe, innerTarget } = createIframeTarget();
  const showHoverOverlay = vi.fn<HoverRuntimeMutators['showHoverOverlay']>();
  const hideHoverOverlay = vi.fn<HoverRuntimeMutators['hideHoverOverlay']>();
  const setLastHoverTarget = vi.fn<HoverRuntimeMutators['setLastHoverTarget']>();

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });

  scheduleHoverOverlayUpdate(
    createIframeHoverOverlayUpdateArgs(
      iframe,
      showHoverOverlay,
      hideHoverOverlay,
      setLastHoverTarget
    )
  );

  expect(showHoverOverlay).toHaveBeenCalledWith(innerTarget);
  expect(setLastHoverTarget).toHaveBeenCalledWith(innerTarget);
  expect(hideHoverOverlay).not.toHaveBeenCalled();
}

function shouldIgnoreClicksWhenExtensionUiIsActive(): void {
  document.body.innerHTML = '<div class="sniptale-step-badge-popover"></div>';

  expect(
    shouldIgnoreHighlighterClick({
      eventTarget: document.createElement('button'),
      getState: {
        isModeEnabled: () => true,
        isPaused: () => false,
        isTooltipVisible: () => false,
      },
    })
  ).toBe(true);
}

function shouldIgnoreClicksWhenModeIsDisabled(): void {
  expect(
    shouldIgnoreHighlighterClick({
      eventTarget: document.createElement('button'),
      getState: {
        isModeEnabled: () => false,
        isPaused: () => false,
        isTooltipVisible: () => false,
      },
    })
  ).toBe(true);
}

function shouldUnfreezePreviewAfterMouseMovement(): void {
  const hideHoverOverlay = vi.fn();
  const setHoverPreviewFrozen = vi.fn();
  const setLastHoverTarget = vi.fn();
  const setLastHoverX = vi.fn();
  const setLastHoverY = vi.fn();

  expect(
    handleFrozenHoverPreview({
      event: new MouseEvent('mousemove', { clientX: 22, clientY: 14 }),
      hideHoverOverlay,
      hoverRuntime: { isHoverPreviewFrozen: true },
      setHoverPreviewFrozen,
      setLastHoverTarget,
      setLastHoverX,
      setLastHoverY,
    })
  ).toBe(true);

  expect(hideHoverOverlay).toHaveBeenCalledTimes(1);
  expect(setHoverPreviewFrozen).toHaveBeenCalledWith(false);
  expect(setLastHoverTarget).toHaveBeenCalledWith(null);
  expect(setLastHoverX).toHaveBeenCalledWith(22);
  expect(setLastHoverY).toHaveBeenCalledWith(14);
}

describe('highlighter hover preview events', () => {
  it('shows hover overlay for the inner iframe element', shouldShowHoverOverlayForIframeTargets);
  it(
    'ignores highlighter clicks when extension UI is active',
    shouldIgnoreClicksWhenExtensionUiIsActive
  );
  it('ignores highlighter clicks when the mode is disabled', shouldIgnoreClicksWhenModeIsDisabled);
  it(
    'unfreezes and hides the preview after mouse movement when the hover state is frozen',
    shouldUnfreezePreviewAfterMouseMovement
  );
});
