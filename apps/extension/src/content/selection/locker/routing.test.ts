// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { routeLockInteractionEvent } from './routing';

const modeSession = vi.hoisted(() => ({
  isContentModeEnabled: vi.fn((_mode: string) => false),
}));

vi.mock('../../application/mode-session', () => modeSession);

function createCancelableClick(): MouseEvent {
  return new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
}

function createCancelableAuxClick(): MouseEvent {
  return new MouseEvent('auxclick', {
    bubbles: true,
    button: 1,
    cancelable: true,
    composed: true,
  });
}

function shouldBlockDelegatedNavigationTargets(): void {
  const navigationRoot = document.createElement('div');
  navigationRoot.setAttribute('data-href', '/poll/result');
  const canvas = document.createElement('canvas');
  navigationRoot.appendChild(canvas);
  document.body.appendChild(navigationRoot);

  const event = createCancelableClick();
  canvas.dispatchEvent(event);
  routeLockInteractionEvent(event, {
    isFullLockMode: false,
    isNavigationLocked: true,
    isUIHidden: false,
  });

  expect(event.defaultPrevented).toBe(true);
}

function shouldBlockNestedRoleLinkTargets(): void {
  const navigationRoot = document.createElement('div');
  navigationRoot.setAttribute('role', 'link');
  const label = document.createElement('span');
  navigationRoot.appendChild(label);
  document.body.appendChild(navigationRoot);

  const event = createCancelableClick();
  label.dispatchEvent(event);
  routeLockInteractionEvent(event, {
    isFullLockMode: false,
    isNavigationLocked: true,
    isUIHidden: false,
  });

  expect(event.defaultPrevented).toBe(true);
}

function shouldReturnEarlyForHiddenUiAndUnlockedState(): void {
  const target = document.createElement('button');
  document.body.appendChild(target);
  const event = createCancelableClick();
  target.dispatchEvent(event);

  routeLockInteractionEvent(event, {
    isFullLockMode: false,
    isNavigationLocked: true,
    isUIHidden: true,
  });
  expect(event.defaultPrevented).toBe(false);

  routeLockInteractionEvent(event, {
    isFullLockMode: false,
    isNavigationLocked: false,
    isUIHidden: false,
  });
  expect(event.defaultPrevented).toBe(false);
}

function shouldBlockInteractiveTargetsInFullLockMode(): void {
  const target = document.createElement('button');
  document.body.appendChild(target);
  const event = createCancelableClick();
  target.dispatchEvent(event);

  routeLockInteractionEvent(event, {
    isFullLockMode: true,
    isNavigationLocked: true,
    isUIHidden: false,
  });

  expect(event.defaultPrevented).toBe(true);
}

function shouldAllowOwnedShadowToolbarTargetsInFullLockMode(): void {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const toolbarButton = document.createElement('button');
  toolbarButton.className = 'sniptale-btn';
  shadowRoot.appendChild(toolbarButton);
  const event = createCancelableClick();
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: host,
  });
  Object.defineProperty(event, 'composedPath', {
    configurable: true,
    value: () => [toolbarButton, shadowRoot, host, document.body, document, window],
  });

  routeLockInteractionEvent(event, {
    isFullLockMode: true,
    isNavigationLocked: true,
    isUIHidden: false,
  });

  expect(event.defaultPrevented).toBe(false);
}

function shouldAllowQuickEditTextTargets(): void {
  const target = document.createElement('span');
  target.textContent = 'Editable text';
  document.body.appendChild(target);
  const event = createCancelableClick();
  target.dispatchEvent(event);
  modeSession.isContentModeEnabled.mockImplementation((mode) => mode === 'quick-edit');

  routeLockInteractionEvent(event, {
    isFullLockMode: false,
    isNavigationLocked: true,
    isUIHidden: false,
  });

  expect(event.defaultPrevented).toBe(false);
}

function shouldBlockQuickEditInteractiveTargets(): void {
  const target = document.createElement('button');
  document.body.appendChild(target);
  const event = createCancelableClick();
  target.dispatchEvent(event);
  modeSession.isContentModeEnabled.mockImplementation((mode) => mode === 'quick-edit');

  routeLockInteractionEvent(event, {
    isFullLockMode: false,
    isNavigationLocked: true,
    isUIHidden: false,
  });

  expect(event.defaultPrevented).toBe(true);
}

function shouldAllowEditingTargets(): void {
  const target = document.createElement('div');
  target.classList.add('sniptale-editing');
  document.body.appendChild(target);
  const event = createCancelableClick();
  target.dispatchEvent(event);

  routeLockInteractionEvent(event, {
    isFullLockMode: true,
    isNavigationLocked: true,
    isUIHidden: false,
  });

  expect(event.defaultPrevented).toBe(false);
}

function shouldBlockDesignReviewLinksWithoutHidingThemFromThePicker(): void {
  const link = document.createElement('a');
  link.href = '/next';
  link.textContent = 'Next';
  document.body.appendChild(link);
  const event = createCancelableClick();
  const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');
  const pickerListener = vi.fn();
  modeSession.isContentModeEnabled.mockImplementation((mode) => mode === 'design-review');
  const lockerListener = (capturedEvent: Event) => {
    routeLockInteractionEvent(capturedEvent, {
      isFullLockMode: false,
      isNavigationLocked: true,
      isUIHidden: false,
    });
  };
  window.addEventListener('click', lockerListener, { capture: true });
  window.addEventListener('click', pickerListener, { capture: true });

  try {
    link.dispatchEvent(event);
  } finally {
    window.removeEventListener('click', lockerListener, { capture: true });
    window.removeEventListener('click', pickerListener, { capture: true });
  }

  expect(event.defaultPrevented).toBe(true);
  expect(stopImmediatePropagation).not.toHaveBeenCalled();
  expect(pickerListener).toHaveBeenCalledOnce();
}

function shouldBlockAnnotationLinksWithoutHidingThemFromThePicker(): void {
  const link = document.createElement('a');
  link.href = '/next';
  document.body.appendChild(link);
  const event = createCancelableClick();
  const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');
  const pickerListener = vi.fn();
  modeSession.isContentModeEnabled.mockImplementation((mode) => mode === 'highlighter');
  const lockerListener = (capturedEvent: Event) => {
    routeLockInteractionEvent(capturedEvent, {
      isFullLockMode: false,
      isNavigationLocked: true,
      isUIHidden: false,
    });
  };
  window.addEventListener('click', lockerListener, { capture: true });
  window.addEventListener('click', pickerListener, { capture: true });

  try {
    link.dispatchEvent(event);
  } finally {
    window.removeEventListener('click', lockerListener, { capture: true });
    window.removeEventListener('click', pickerListener, { capture: true });
  }

  expect(event.defaultPrevented).toBe(true);
  expect(stopImmediatePropagation).not.toHaveBeenCalled();
  expect(pickerListener).toHaveBeenCalledOnce();
}

function shouldAllowDesignReviewToPickNonLinkControlsDuringAStaleFullLock(): void {
  const button = document.createElement('button');
  document.body.appendChild(button);
  const event = createCancelableClick();
  modeSession.isContentModeEnabled.mockImplementation((mode) => mode === 'design-review');

  button.dispatchEvent(event);
  routeLockInteractionEvent(event, {
    isFullLockMode: true,
    isNavigationLocked: true,
    isUIHidden: false,
  });

  expect(event.defaultPrevented).toBe(false);
}

function shouldAllowAnnotationToPickNonLinkControlsDuringAStaleFullLock(): void {
  const button = document.createElement('button');
  document.body.appendChild(button);
  const event = createCancelableClick();
  modeSession.isContentModeEnabled.mockImplementation((mode) => mode === 'highlighter');

  button.dispatchEvent(event);
  routeLockInteractionEvent(event, {
    isFullLockMode: true,
    isNavigationLocked: true,
    isUIHidden: false,
  });

  expect(event.defaultPrevented).toBe(false);
}

function shouldBlockDesignReviewMiddleClickNavigation(): void {
  const link = document.createElement('a');
  link.href = '/next';
  document.body.appendChild(link);
  const event = createCancelableAuxClick();
  modeSession.isContentModeEnabled.mockImplementation((mode) => mode === 'design-review');
  const lockerListener = (capturedEvent: Event) => {
    routeLockInteractionEvent(capturedEvent, {
      isFullLockMode: false,
      isNavigationLocked: true,
      isUIHidden: false,
    });
  };
  window.addEventListener('auxclick', lockerListener, { capture: true });

  try {
    link.dispatchEvent(event);
  } finally {
    window.removeEventListener('auxclick', lockerListener, { capture: true });
  }

  expect(event.defaultPrevented).toBe(true);
}

describe('locker routing', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    modeSession.isContentModeEnabled.mockReturnValue(false);
  });

  it(
    'blocks delegated navigation targets in links-only mode',
    shouldBlockDelegatedNavigationTargets
  );
  it('blocks nested role-link targets in links-only mode', shouldBlockNestedRoleLinkTargets);
  it(
    'returns early for hidden UI and unlocked state',
    shouldReturnEarlyForHiddenUiAndUnlockedState
  );
  it('blocks interactive targets in full-lock mode', shouldBlockInteractiveTargetsInFullLockMode);
  it(
    'allows owned shadow toolbar targets in full-lock mode',
    shouldAllowOwnedShadowToolbarTargetsInFullLockMode
  );
  it('allows quick-edit text targets', shouldAllowQuickEditTextTargets);
  it('blocks quick-edit interactive targets', shouldBlockQuickEditInteractiveTargets);
  it('allows editing targets', shouldAllowEditingTargets);
  it(
    'blocks Design Review links without hiding them from the picker',
    shouldBlockDesignReviewLinksWithoutHidingThemFromThePicker
  );
  it(
    'blocks Annotation links without hiding them from the picker',
    shouldBlockAnnotationLinksWithoutHidingThemFromThePicker
  );
  it(
    'allows Design Review to pick non-link controls during a stale full lock',
    shouldAllowDesignReviewToPickNonLinkControlsDuringAStaleFullLock
  );
  it(
    'allows Annotation to pick non-link controls during a stale full lock',
    shouldAllowAnnotationToPickNonLinkControlsDuringAStaleFullLock
  );
  it('blocks Design Review middle-click navigation', shouldBlockDesignReviewMiddleClickNavigation);
});
