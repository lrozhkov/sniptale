// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const contentUiRoot = vi.hoisted(() => ({
  getContentEventTargetElement: vi.fn<(event: Event) => HTMLElement | null>(),
}));
const modeSession = vi.hoisted(() => ({
  isContentModeEnabled: vi.fn<(mode: string) => boolean>(() => false),
}));
const helpers = vi.hoisted(() => ({
  findClosestInteractiveElementForLock: vi.fn<(elements: HTMLElement[]) => HTMLElement | null>(
    () => null
  ),
  findClosestNavigationTargetForLock: vi.fn<(elements: HTMLElement[]) => HTMLElement | null>(
    () => null
  ),
  getLockEventElements: vi.fn<(event: Event) => HTMLElement[]>(() => []),
  isGwtInternalTabLink: vi.fn<(href: string) => boolean>(() => false),
  isTextElementForQuickEditLock: vi.fn<(target: HTMLElement) => boolean>(() => false),
}));

vi.mock('../../platform/dom-host', () => contentUiRoot);
vi.mock('../../application/mode-session', () => modeSession);
vi.mock('./helpers', () => helpers);

import {
  blockEvent,
  getLockRoutingTarget,
  handleClosestLink,
  handleResolvedNavigationTarget,
  isSelectionDelegatedMode,
  resolveLockTargets,
  shouldAllowQuickEditTarget,
  shouldBlockQuickEditInteractiveTarget,
} from './routing.guards';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function createCancelableEvent(): Event {
  return {
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as Event;
}

function shouldAllowQuickEditOnlyForNonLinkTextTargets(): void {
  const textTarget = document.createElement('span');
  const linkTarget = document.createElement('a');
  linkTarget.setAttribute('href', '/item');
  helpers.isTextElementForQuickEditLock.mockReturnValue(true);
  modeSession.isContentModeEnabled.mockReturnValue(true);

  expect(shouldAllowQuickEditTarget(textTarget)).toBe(true);
  expect(shouldAllowQuickEditTarget(linkTarget)).toBe(false);

  modeSession.isContentModeEnabled.mockReturnValue(false);
  expect(shouldAllowQuickEditTarget(textTarget)).toBe(false);
}

function shouldBlockInteractiveQuickEditTargetsWhenNeeded(): void {
  const interactiveTarget = document.createElement('button');
  const event = createCancelableEvent();
  helpers.getLockEventElements.mockReturnValue([document.createElement('div')]);
  helpers.findClosestInteractiveElementForLock.mockReturnValue(interactiveTarget);
  modeSession.isContentModeEnabled.mockReturnValue(true);

  expect(shouldBlockQuickEditInteractiveTarget(event)).toBe(true);
  expect(event.preventDefault).toHaveBeenCalledOnce();

  modeSession.isContentModeEnabled.mockReturnValue(false);
  expect(shouldBlockQuickEditInteractiveTarget(createCancelableEvent())).toBe(false);
}

function shouldResolveTargetsAndForwardTheContentTargetLookup(): void {
  const interactiveTarget = document.createElement('button');
  const navigationTarget = document.createElement('a');
  const resolvedTarget = document.createElement('div');
  const event = createCancelableEvent();
  helpers.getLockEventElements.mockReturnValue([document.createElement('div')]);
  helpers.findClosestInteractiveElementForLock.mockReturnValue(interactiveTarget);
  helpers.findClosestNavigationTargetForLock.mockReturnValue(navigationTarget);
  contentUiRoot.getContentEventTargetElement.mockReturnValue(resolvedTarget);

  expect(resolveLockTargets(event)).toEqual({ interactiveTarget, navigationTarget });
  expect(getLockRoutingTarget(event)).toBe(resolvedTarget);
}

function shouldReportDelegatedSelectionModes(): void {
  modeSession.isContentModeEnabled.mockImplementation((mode: string) => mode === 'ai-pick');
  expect(isSelectionDelegatedMode()).toBe(true);

  modeSession.isContentModeEnabled.mockImplementation((mode: string) => mode === 'selection-mode');
  expect(isSelectionDelegatedMode()).toBe(true);

  modeSession.isContentModeEnabled.mockImplementation((mode: string) => mode === 'highlighter');
  expect(isSelectionDelegatedMode()).toBe(true);

  modeSession.isContentModeEnabled.mockReturnValue(false);
  expect(isSelectionDelegatedMode()).toBe(false);
}

function shouldHandleResolvedNavigationTargets(): void {
  const regularEvent = createCancelableEvent();
  const nonAnchorTarget = document.createElement('div');
  const gwtLink = document.createElement('a');
  gwtLink.href = 'https://example.com';
  gwtLink.setAttribute('href', '/gwt/tab');
  helpers.isGwtInternalTabLink.mockReturnValueOnce(true);

  expect(handleResolvedNavigationTarget(createCancelableEvent(), null)).toBe(false);
  expect(handleResolvedNavigationTarget(regularEvent, nonAnchorTarget)).toBe(true);
  expect(regularEvent.preventDefault).toHaveBeenCalledOnce();
  expect(handleResolvedNavigationTarget(createCancelableEvent(), gwtLink)).toBe(true);
}

function shouldHandleClosestLinksAndQuickEditLinkBypasses(): void {
  const target = document.createElement('div');
  const link = document.createElement('a');
  const linkLabel = document.createElement('span');
  link.appendChild(linkLabel);
  target.appendChild(link);

  expect(handleClosestLink(createCancelableEvent(), document.createElement('div'))).toBe(false);

  modeSession.isContentModeEnabled.mockReturnValue(true);
  link.removeAttribute('href');
  expect(handleClosestLink(createCancelableEvent(), link)).toBe(true);

  link.setAttribute('href', '/next');
  const plainTextLinkEvent = createCancelableEvent();
  expect(handleClosestLink(plainTextLinkEvent, link)).toBe(true);
  expect(plainTextLinkEvent.preventDefault).toHaveBeenCalledOnce();

  const blockedEvent = createCancelableEvent();
  expect(handleClosestLink(blockedEvent, linkLabel)).toBe(true);
  expect(blockedEvent.preventDefault).toHaveBeenCalledOnce();
}

describe('locker routing guards', () => {
  it(
    'allows quick-edit only for non-link text targets',
    shouldAllowQuickEditOnlyForNonLinkTextTargets
  );
  it(
    'blocks interactive quick-edit targets when needed',
    shouldBlockInteractiveQuickEditTargetsWhenNeeded
  );
  it(
    'resolves targets and forwards the content target lookup',
    shouldResolveTargetsAndForwardTheContentTargetLookup
  );
  it('reports delegated selection modes', shouldReportDelegatedSelectionModes);
  it('handles resolved navigation targets', shouldHandleResolvedNavigationTargets);
  it(
    'handles closest links and quick-edit link bypasses',
    shouldHandleClosestLinksAndQuickEditLinkBypasses
  );
  it('blocks events through the shared event helper', () => {
    const event = createCancelableEvent();
    blockEvent(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });
});
