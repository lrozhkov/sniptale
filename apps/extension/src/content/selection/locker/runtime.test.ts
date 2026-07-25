import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createNavigationLocker, type NavigationLockerDeps } from './runtime';

function createClassListHarness() {
  const classes = new Set<string>();

  return {
    contains(className: string) {
      return classes.has(className);
    },
    toggle(className: string, enabled: boolean) {
      if (enabled) {
        classes.add(className);
        return true;
      }

      classes.delete(className);
      return false;
    },
  };
}

function createListenerHarness() {
  return {
    addSelectStartListener: vi.fn(),
    clickCleanup: vi.fn(),
    keydownCleanup: vi.fn(),
    logger: { log: vi.fn() },
    mouseCleanup: vi.fn(),
    pointerCleanup: vi.fn(),
    removeNavigationLockOverlay: vi.fn(),
    removeSelectStartListener: vi.fn(),
    subscribeBeforeUnload: vi.fn(),
    syncNavigationLockOverlay: vi.fn(),
    unsubscribeBeforeUnload: vi.fn(),
  };
}

function createWindowListenerFactory(listeners: ReturnType<typeof createListenerHarness>) {
  return vi.fn().mockImplementation((eventName: string) => {
    switch (eventName) {
      case 'pointerdown':
        return listeners.pointerCleanup;
      case 'mousedown':
        return listeners.mouseCleanup;
      case 'click':
        return listeners.clickCleanup;
      case 'keydown':
        return listeners.keydownCleanup;
      default:
        return vi.fn();
    }
  });
}

function createLockerDeps(classList: ReturnType<typeof createClassListHarness>, doc: Document) {
  const listeners = createListenerHarness();
  const addEventListenerToAllWindowsDynamic = createWindowListenerFactory(listeners);

  const deps: NavigationLockerDeps = {
    addEventListenerToAllWindowsDynamic,
    addSelectStartListener: listeners.addSelectStartListener,
    logger: listeners.logger,
    removeNavigationLockOverlay: listeners.removeNavigationLockOverlay,
    removeSelectStartListener: listeners.removeSelectStartListener,
    subscribeBeforeUnload: listeners.subscribeBeforeUnload,
    syncNavigationLockOverlay: listeners.syncNavigationLockOverlay,
    toggleBodyClass: (className, enabled) => {
      classList.toggle(className, enabled);
    },
    toggleContentHostClass: vi.fn(),
    unsubscribeBeforeUnload: listeners.unsubscribeBeforeUnload,
    walkAllDocuments: (visit) => {
      visit(doc);
    },
  };

  return { addEventListenerToAllWindowsDynamic, deps, listeners };
}

function createLockerHarness() {
  const classList = createClassListHarness();
  const doc = {
    addEventListener: vi.fn(),
    body: { classList } as unknown as HTMLBodyElement,
    removeEventListener: vi.fn(),
  } as unknown as Document;
  const { addEventListenerToAllWindowsDynamic, deps, listeners } = createLockerDeps(classList, doc);

  return {
    addEventListenerToAllWindowsDynamic,
    deps,
    doc,
    locker: createNavigationLocker(deps),
    listeners,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function shouldSubscribeListenersWhileLockIsActive(): void {
  const harness = createLockerHarness();

  harness.locker.enableNavigationLock(false);

  expect(harness.doc.body.classList.contains('sniptale-navigation-locked')).toBe(true);
  expect(harness.listeners.syncNavigationLockOverlay).toHaveBeenCalledWith(true);
  expect(harness.deps.addEventListenerToAllWindowsDynamic).toHaveBeenCalledTimes(4);
  expect(harness.listeners.subscribeBeforeUnload).toHaveBeenCalledOnce();

  harness.locker.setFullLockMode(true);

  expect(harness.listeners.syncNavigationLockOverlay).toHaveBeenLastCalledWith(false);
}

function shouldCleanUpRuntimeListenersWhenDisabled(): void {
  const harness = createLockerHarness();

  harness.locker.enableNavigationLock();
  harness.locker.disableNavigationLock();

  expect(harness.doc.body.classList.contains('sniptale-navigation-locked')).toBe(false);
  expect(harness.listeners.pointerCleanup).toHaveBeenCalledOnce();
  expect(harness.listeners.mouseCleanup).toHaveBeenCalledOnce();
  expect(harness.listeners.clickCleanup).toHaveBeenCalledOnce();
  expect(harness.listeners.keydownCleanup).toHaveBeenCalledOnce();
  expect(harness.listeners.unsubscribeBeforeUnload).toHaveBeenCalledOnce();
  expect(harness.listeners.removeNavigationLockOverlay).toHaveBeenCalledOnce();
}

function shouldPreserveSurfaceListenerAndCleanupOrdering(): void {
  const harness = createLockerHarness();

  harness.locker.enableNavigationLock();

  const enabledSurfaceOrder =
    harness.listeners.syncNavigationLockOverlay.mock.invocationCallOrder[0]!;
  const listenerOrder = harness.addEventListenerToAllWindowsDynamic.mock.invocationCallOrder[0]!;
  const beforeUnloadOrder = harness.listeners.subscribeBeforeUnload.mock.invocationCallOrder[0]!;
  expect(enabledSurfaceOrder).toBeLessThan(listenerOrder);
  expect(listenerOrder).toBeLessThan(beforeUnloadOrder);

  harness.locker.disableNavigationLock();

  const disabledSurfaceOrder =
    harness.listeners.syncNavigationLockOverlay.mock.invocationCallOrder[1]!;
  const listenerCleanupOrder = harness.listeners.pointerCleanup.mock.invocationCallOrder[0]!;
  const beforeUnloadCleanupOrder =
    harness.listeners.unsubscribeBeforeUnload.mock.invocationCallOrder[0]!;
  const overlayCleanupOrder =
    harness.listeners.removeNavigationLockOverlay.mock.invocationCallOrder[0]!;
  expect(disabledSurfaceOrder).toBeLessThan(listenerCleanupOrder);
  expect(listenerCleanupOrder).toBeLessThan(beforeUnloadCleanupOrder);
  expect(beforeUnloadCleanupOrder).toBeLessThan(overlayCleanupOrder);
}

function shouldToggleTextSelectionBlockingThroughDomBridge(): void {
  const harness = createLockerHarness();

  harness.locker.enableTextSelectionBlock();

  expect(harness.locker.isTextSelectionBlockEnabled()).toBe(true);
  expect(harness.doc.body.classList.contains('sniptale-no-select')).toBe(true);
  expect(harness.listeners.addSelectStartListener).toHaveBeenCalledOnce();

  harness.locker.disableTextSelectionBlock();

  expect(harness.locker.isTextSelectionBlockEnabled()).toBe(false);
  expect(harness.doc.body.classList.contains('sniptale-no-select')).toBe(false);
  expect(harness.listeners.removeSelectStartListener).toHaveBeenCalledOnce();
}

function shouldMirrorCaptureVisibilityOntoTheContentHost(): void {
  const harness = createLockerHarness();

  harness.locker.setUIHidden(true);

  expect(harness.doc.body.classList.contains('sniptale-capture-ui-hidden')).toBe(true);
  expect(harness.deps.toggleContentHostClass).toHaveBeenCalledWith(
    'sniptale-capture-ui-hidden',
    true
  );

  harness.locker.setUIHidden(false);

  expect(harness.doc.body.classList.contains('sniptale-capture-ui-hidden')).toBe(false);
  expect(harness.deps.toggleContentHostClass).toHaveBeenLastCalledWith(
    'sniptale-capture-ui-hidden',
    false
  );
}

function shouldLogWhenFullLockIsRequestedWithoutActiveLock(): void {
  const harness = createLockerHarness();

  harness.locker.disableNavigationLock();
  harness.locker.disableTextSelectionBlock();
  harness.locker.setFullLockMode(true);

  expect(harness.listeners.logger.log).toHaveBeenCalledWith(
    '[Sniptale] Cannot set lock mode - navigation lock is not enabled'
  );
}

function shouldHandleRepeatedTogglesWithoutDuplicatingListeners(): void {
  const harness = createLockerHarness();

  harness.locker.enableNavigationLock(false);
  harness.locker.enableNavigationLock(true);
  harness.locker.enableTextSelectionBlock();
  harness.locker.enableTextSelectionBlock();

  expect(harness.listeners.syncNavigationLockOverlay).toHaveBeenCalledWith(true);
  expect(harness.listeners.addSelectStartListener).toHaveBeenCalledOnce();
  expect(harness.locker.isLockEnabled()).toBe(true);
}

function shouldAttachTextSelectionBlockingAcrossAccessibleDocuments(): void {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const nestedDoc = {
    addEventListener,
    body: { classList: createClassListHarness() },
    removeEventListener,
  } as unknown as Document;
  const harness = createLockerHarness();
  harness.deps.walkAllDocuments = (visit) => {
    visit(harness.doc);
    visit(nestedDoc);
  };
  harness.deps.addSelectStartListener = (listener) => {
    harness.deps.walkAllDocuments((doc) => {
      doc.addEventListener('selectstart', listener, { capture: true });
    });
  };
  harness.deps.removeSelectStartListener = (listener) => {
    harness.deps.walkAllDocuments((doc) => {
      doc.removeEventListener('selectstart', listener, { capture: true });
    });
  };
  const locker = createNavigationLocker(harness.deps);

  locker.enableTextSelectionBlock();
  locker.disableTextSelectionBlock();

  expect(addEventListener).toHaveBeenCalledOnce();
  expect(removeEventListener).toHaveBeenCalledOnce();
}

describe('createNavigationLocker', () => {
  it(
    'subscribes window listeners and syncs overlay state while the lock is active',
    shouldSubscribeListenersWhileLockIsActive
  );
  it(
    'cleans up all runtime listeners and removes the overlay when disabled',
    shouldCleanUpRuntimeListenersWhenDisabled
  );
  it(
    'preserves surface, listener, before-unload, and overlay cleanup ordering',
    shouldPreserveSurfaceListenerAndCleanupOrdering
  );
  it(
    'toggles text-selection blocking through the injected DOM bridge',
    shouldToggleTextSelectionBlockingThroughDomBridge
  );
  it(
    'mirrors capture visibility onto the content shadow host',
    shouldMirrorCaptureVisibilityOntoTheContentHost
  );
  it(
    'logs when full-lock mode is requested without an active lock',
    shouldLogWhenFullLockIsRequestedWithoutActiveLock
  );
  it(
    'handles repeated toggles without duplicating listeners',
    shouldHandleRepeatedTogglesWithoutDuplicatingListeners
  );
  it(
    'attaches text-selection blocking across accessible documents',
    shouldAttachTextSelectionBlockingAcrossAccessibleDocuments
  );
});
