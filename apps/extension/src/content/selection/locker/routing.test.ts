// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { routeLockInteractionEvent } from './routing';

vi.mock('../../application/mode-session', () => ({
  isContentModeEnabled: vi.fn(() => false),
}));

function createCancelableClick(): MouseEvent {
  return new MouseEvent('click', {
    bubbles: true,
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

describe('locker routing', () => {
  beforeEach(() => {
    document.body.replaceChildren();
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
});
