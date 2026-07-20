// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLockerKeyDownState,
  handleLockerInteractionEvent,
  handleLockerKeyDown,
  handleLockerSelectStart,
} from './events';

const routing = vi.hoisted(() => ({
  routeLockInteractionEvent: vi.fn(),
}));
const helpers = vi.hoisted(() => ({
  isInteractiveElementForLock: vi.fn(() => true),
}));
const contentRoot = vi.hoisted(() => ({
  getContentEventTargetElement: vi.fn((event: Event) => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    return path.find((entry): entry is HTMLElement => entry instanceof HTMLElement) ?? null;
  }),
  isContentOwnedElement: vi.fn<(node: Node | null) => boolean>(() => false),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({ debug: vi.fn() })),
}));
vi.mock('../../platform/dom-host', () => contentRoot);
vi.mock('./routing', () => routing);
vi.mock('./helpers', () => helpers);

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function createKeyEvent(key: string, overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    ctrlKey: false,
    composedPath: () => [],
    key,
    metaKey: false,
    preventDefault: vi.fn(),
    shiftKey: false,
    target: null,
    stopPropagation: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent;
}

function createKeyEventForTarget(
  key: string,
  target: HTMLElement,
  overrides: Partial<KeyboardEvent> = {}
): KeyboardEvent {
  return createKeyEvent(key, {
    composedPath: () => [target],
    target,
    ...overrides,
  });
}

function createLockedKeyDownState(isInteractiveElement: () => boolean) {
  return {
    isFullLockMode: false,
    isInteractiveElement,
    isNavigationLocked: true,
    isUIHidden: false,
  };
}

function shouldDelegateInteractionRouting(): void {
  const event = new MouseEvent('click');
  const state = { isFullLockMode: false, isNavigationLocked: true, isUIHidden: false };

  handleLockerInteractionEvent(event, state);

  expect(routing.routeLockInteractionEvent).toHaveBeenCalledWith(event, state);
}

function shouldBlockRefreshShortcutForInteractiveTargets(): void {
  const interactiveTarget = document.createElement('button');
  const refreshEvent = createKeyEventForTarget('r', interactiveTarget, { ctrlKey: true });

  handleLockerKeyDown(
    refreshEvent,
    createLockedKeyDownState(() => true)
  );

  expect(refreshEvent.preventDefault).toHaveBeenCalledOnce();
}

function shouldBlockActivationShortcutForInteractiveTargets(): void {
  const interactiveTarget = document.createElement('button');
  const activationEvent = createKeyEventForTarget('Enter', interactiveTarget);

  handleLockerKeyDown(
    activationEvent,
    createLockedKeyDownState(() => true)
  );

  expect(activationEvent.preventDefault).toHaveBeenCalledOnce();
}

function shouldSkipKeyDownWhenStateDoesNotRequireBlocking(): void {
  const keyEvent = createKeyEvent('Escape');

  handleLockerKeyDown(keyEvent, {
    isFullLockMode: false,
    isInteractiveElement: () => true,
    isNavigationLocked: false,
    isUIHidden: false,
  });
  handleLockerKeyDown(keyEvent, {
    isFullLockMode: false,
    isInteractiveElement: () => true,
    isNavigationLocked: true,
    isUIHidden: true,
  });

  expect(keyEvent.preventDefault).not.toHaveBeenCalled();
}

function shouldSkipActivationForEditingTargets(): void {
  const editableTarget = document.createElement('div');
  editableTarget.classList.add('sniptale-editing');
  const activationEvent = createKeyEventForTarget('Enter', editableTarget);

  handleLockerKeyDown(
    activationEvent,
    createLockedKeyDownState(() => true)
  );

  expect(activationEvent.preventDefault).not.toHaveBeenCalled();
}

function shouldSkipKeyDownInsideExtensionUi(): void {
  const textarea = document.createElement('textarea');
  contentRoot.isContentOwnedElement.mockImplementation((node: Node | null) => node === textarea);
  const activationEvent = createKeyEventForTarget(' ', textarea);

  handleLockerKeyDown(
    activationEvent,
    createLockedKeyDownState(() => true)
  );

  expect(activationEvent.preventDefault).not.toHaveBeenCalled();
}

function shouldSkipActivationForNonInteractiveTargets(): void {
  const target = document.createElement('div');
  const activationEvent = createKeyEventForTarget('Enter', target);

  handleLockerKeyDown(
    activationEvent,
    createLockedKeyDownState(() => false)
  );

  expect(activationEvent.preventDefault).not.toHaveBeenCalled();
}

function shouldSkipSelectStartInsideExtensionUi(): void {
  const root = document.createElement('div');
  const shadowRoot = root.attachShadow({ mode: 'open' });
  const target = document.createElement('span');
  shadowRoot.appendChild(target);
  contentRoot.isContentOwnedElement.mockImplementation((node: Node | null) => node === target);
  const selectEvent = {
    composedPath: () => [target],
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target,
  } as unknown as Event;

  handleLockerSelectStart(selectEvent);

  expect(selectEvent.preventDefault).not.toHaveBeenCalled();
}

function shouldBlockSelectStartOutsideExtensionUiAndExposeDefaultHelper(): void {
  const target = document.createElement('div');
  const selectEvent = {
    composedPath: () => [target],
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target,
  } as unknown as Event;

  handleLockerSelectStart(selectEvent);

  expect(selectEvent.preventDefault).toHaveBeenCalledOnce();
  expect(selectEvent.stopPropagation).toHaveBeenCalledOnce();
}

function shouldExposeTheDefaultInteractiveHelper(): void {
  const state = createLockerKeyDownState({
    isFullLockMode: true,
    isNavigationLocked: true,
    isUIHidden: false,
  });

  expect(state.isInteractiveElement).toBe(helpers.isInteractiveElementForLock);
}

describe('locker events', () => {
  it('delegates interaction routing through the routing seam', shouldDelegateInteractionRouting);
  it(
    'blocks refresh shortcuts for interactive targets',
    shouldBlockRefreshShortcutForInteractiveTargets
  );
  it(
    'blocks activation shortcuts for interactive targets',
    shouldBlockActivationShortcutForInteractiveTargets
  );
  it(
    'skips keydown when the state does not require blocking',
    shouldSkipKeyDownWhenStateDoesNotRequireBlocking
  );
  it('skips activation for editing targets', shouldSkipActivationForEditingTargets);
  it('skips keydown handling inside extension UI', shouldSkipKeyDownInsideExtensionUi);
  it('skips activation for non-interactive targets', shouldSkipActivationForNonInteractiveTargets);
  it('skips selectstart handling inside extension UI', shouldSkipSelectStartInsideExtensionUi);
  it(
    'blocks selectstart outside extension UI',
    shouldBlockSelectStartOutsideExtensionUiAndExposeDefaultHelper
  );
  it('exposes the default interactive helper', shouldExposeTheDefaultInteractiveHelper);
});
