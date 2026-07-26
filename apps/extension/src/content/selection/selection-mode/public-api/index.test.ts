import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disableSelectionModeApi, enableSelectionModeApi, isSelectionModeActiveApi } from '.';
import { disableNavigationLock, enableNavigationLock } from '../../locker';
import { createSelectionModeSession, resetSelectionModeSession } from '../session';

vi.mock('../../locker', async (importOriginal) => ({
  ...(await importOriginal()),
  disableNavigationLock: vi.fn(),
  enableNavigationLock: vi.fn(),
}));

function createEnableApiFixture() {
  const session = createSelectionModeSession();
  session.isActive = true;
  const cleanup = vi.fn(() => {
    resetSelectionModeSession(session);
  });
  const createHoverElements = vi.fn();
  const createOverlayContainer = vi.fn();
  const enableCursor = vi.fn();
  const prepareUi = vi.fn(async () => undefined);
  const setupEventListeners = vi.fn();

  return {
    args: {
      cleanup,
      createHoverElements,
      createOverlayContainer,
      enableCursor,
      prepareUi,
      session,
      setupEventListeners,
    },
    createHoverElements,
    createOverlayContainer,
    cleanup,
    enableCursor,
    prepareUi,
    session,
    setupEventListeners,
  };
}

function createDisableApiFixture(rejectCallback: ((reason?: unknown) => void) | null = null) {
  const session = createSelectionModeSession();
  session.aspectRatio = 2;
  session.currentSelection = { x: 1, y: 2, width: 3, height: 4 };
  session.currentState = 'confirmed';
  session.isActive = true;
  session.maintainAspectRatio = true;
  session.rejectCallback = rejectCallback;
  session.resolveCallback = vi.fn();
  return {
    cleanup: vi.fn(() => resetSelectionModeSession(session)),
    session,
  };
}

function registerEnableApiTest() {
  it('cleans up an existing session and enables selection mode with a fresh promise flow', async () => {
    const fixture = createEnableApiFixture();
    const onCaptureActionChange = vi.fn();
    const pendingSelection = enableSelectionModeApi({
      ...fixture.args,
      options: { captureAction: 'copy', onCaptureActionChange },
    });
    await Promise.resolve();

    expect(fixture.cleanup).toHaveBeenCalledTimes(1);
    expect(fixture.session.isActive).toBe(true);
    expect(fixture.session.currentState).toBe('idle');
    expect(fixture.session.captureAction).toBe('copy');
    expect(fixture.session.onCaptureActionChange).toBe(onCaptureActionChange);
    expect(enableNavigationLock).toHaveBeenCalledWith(true);
    expect(fixture.prepareUi).toHaveBeenCalledTimes(1);
    expect(fixture.createOverlayContainer).toHaveBeenCalledTimes(1);
    expect(fixture.createHoverElements).toHaveBeenCalledTimes(1);
    expect(fixture.enableCursor).toHaveBeenCalledTimes(1);
    expect(fixture.setupEventListeners).toHaveBeenCalledTimes(1);
    expect(fixture.session.resolveCallback).toBeTypeOf('function');
    expect(fixture.session.rejectCallback).toBeTypeOf('function');

    fixture.session.resolveCallback?.({ x: 1, y: 2, width: 3, height: 4 });

    await expect(pendingSelection).resolves.toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('rolls startup back when the interaction shell throws during initialization', async () => {
    const fixture = createEnableApiFixture();
    const startupError = new Error('overlay failed');
    fixture.prepareUi.mockRejectedValue(startupError);
    fixture.createOverlayContainer.mockImplementation(() => {
      throw startupError;
    });

    await expect(enableSelectionModeApi(fixture.args)).rejects.toThrow('overlay failed');

    expect(disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(fixture.cleanup).toHaveBeenCalledTimes(2);
    expect(fixture.session.isActive).toBe(false);
    expect(fixture.session.currentState).toBe('idle');
    expect(fixture.session.resolveCallback).toBeNull();
    expect(fixture.session.rejectCallback).toBeNull();
  });
}

function registerDisableApiRejectTest() {
  it('rejects the pending selection promise and removes navigation lock on external disable', () => {
    const rejectCallback = vi.fn();
    const fixture = createDisableApiFixture(rejectCallback);

    disableSelectionModeApi({
      cleanup: fixture.cleanup,
      session: fixture.session,
    });

    expect(fixture.cleanup).toHaveBeenCalledTimes(1);
    expect(disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(fixture.session).toEqual(
      expect.objectContaining({
        aspectRatio: null,
        currentSelection: { x: 0, y: 0, width: 0, height: 0 },
        currentState: 'idle',
        isActive: false,
        maintainAspectRatio: false,
        rejectCallback: null,
        resolveCallback: null,
      })
    );
    expect(rejectCallback).toHaveBeenCalledTimes(1);
    expect(rejectCallback.mock.calls[0]?.[0]).toMatchObject({ message: 'Cancelled by user' });
  });
}

function registerDisableApiNoRejectTest() {
  it('clears runtime state without rejecting when there is no pending selection', () => {
    const fixture = createDisableApiFixture();

    disableSelectionModeApi({
      cleanup: fixture.cleanup,
      session: fixture.session,
    });

    expect(fixture.cleanup).toHaveBeenCalledTimes(1);
    expect(disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(fixture.session.rejectCallback).toBeNull();
  });
}

function registerIsActiveApiTest() {
  it('returns the current active flag through the facade helper', () => {
    expect(isSelectionModeActiveApi(true)).toBe(true);
    expect(isSelectionModeActiveApi(false)).toBe(false);
  });
}

describe('selection-mode public api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerEnableApiTest();
  registerDisableApiRejectTest();
  registerDisableApiNoRejectTest();
  registerIsActiveApiTest();
});
