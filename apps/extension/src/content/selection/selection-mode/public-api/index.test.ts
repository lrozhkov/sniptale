import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disableSelectionModeApi, enableSelectionModeApi, isSelectionModeActiveApi } from '.';
import { disableNavigationLock, enableNavigationLock } from '../../locker';

vi.mock('../../locker', async (importOriginal) => ({
  ...(await importOriginal()),
  disableNavigationLock: vi.fn(),
  enableNavigationLock: vi.fn(),
}));

type SelectionBox = { x: number; y: number; width: number; height: number };

function createEnableApiFixture() {
  let isActive = true;
  let resolveCallback: ((value: SelectionBox) => void) | null = null;
  let rejectCallback: ((reason?: unknown) => void) | null = null;
  const cleanup = vi.fn(() => {
    isActive = false;
  });
  const createHoverElements = vi.fn();
  const createOverlayContainer = vi.fn();
  const enableCursor = vi.fn();
  const prepareUi = vi.fn(async () => undefined);
  const setCurrentState = vi.fn();
  const setIsActive = vi.fn((value: boolean) => {
    isActive = value;
  });
  const setupEventListeners = vi.fn();

  return {
    args: {
      cleanup,
      createHoverElements,
      createOverlayContainer,
      enableCursor,
      getIsActive: () => isActive,
      prepareUi,
      setCurrentState,
      setIsActive,
      setRejectCallback: (callback: ((reason?: unknown) => void) | null) => {
        rejectCallback = callback;
      },
      setResolveCallback: (callback: ((value: SelectionBox) => void) | null) => {
        resolveCallback = callback;
      },
      setupEventListeners,
    },
    createHoverElements,
    createOverlayContainer,
    cleanup,
    enableCursor,
    getRejectCallback: () => rejectCallback,
    getResolveCallback: () => resolveCallback,
    prepareUi,
    setCurrentState,
    setIsActive,
    setupEventListeners,
  };
}

function createDisableApiFixture() {
  return {
    cleanup: vi.fn(),
    setAspectRatio: vi.fn(),
    setCurrentSelection: vi.fn(),
    setCurrentState: vi.fn(),
    setIsActive: vi.fn(),
    setMaintainAspectRatio: vi.fn(),
    setResolveCallback: vi.fn(),
    setRejectCallback: vi.fn(),
  };
}

function registerEnableApiTest() {
  it('cleans up an existing session and enables selection mode with a fresh promise flow', async () => {
    const fixture = createEnableApiFixture();
    const pendingSelection = enableSelectionModeApi(fixture.args);
    await Promise.resolve();

    expect(fixture.cleanup).toHaveBeenCalledTimes(1);
    expect(fixture.setIsActive).toHaveBeenCalledWith(true);
    expect(fixture.setCurrentState).toHaveBeenCalledWith('idle');
    expect(enableNavigationLock).toHaveBeenCalledWith(true);
    expect(fixture.prepareUi).toHaveBeenCalledTimes(1);
    expect(fixture.createOverlayContainer).toHaveBeenCalledTimes(1);
    expect(fixture.createHoverElements).toHaveBeenCalledTimes(1);
    expect(fixture.enableCursor).toHaveBeenCalledTimes(1);
    expect(fixture.setupEventListeners).toHaveBeenCalledTimes(1);
    expect(fixture.getResolveCallback()).toBeTypeOf('function');
    expect(fixture.getRejectCallback()).toBeTypeOf('function');

    fixture.getResolveCallback()?.({ x: 1, y: 2, width: 3, height: 4 });

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
    expect(fixture.setIsActive).toHaveBeenLastCalledWith(false);
    expect(fixture.setCurrentState).toHaveBeenLastCalledWith('idle');
    expect(fixture.getResolveCallback()).toBeNull();
    expect(fixture.getRejectCallback()).toBeNull();
  });
}

function registerDisableApiRejectTest() {
  it('rejects the pending selection promise and removes navigation lock on external disable', () => {
    const rejectCallback = vi.fn();
    const fixture = createDisableApiFixture();

    disableSelectionModeApi({
      cleanup: fixture.cleanup,
      getRejectCallback: () => rejectCallback,
      setAspectRatio: fixture.setAspectRatio,
      setCurrentSelection: fixture.setCurrentSelection,
      setCurrentState: fixture.setCurrentState,
      setIsActive: fixture.setIsActive,
      setMaintainAspectRatio: fixture.setMaintainAspectRatio,
      setRejectCallback: fixture.setRejectCallback,
      setResolveCallback: fixture.setResolveCallback,
    });

    expect(fixture.cleanup).toHaveBeenCalledTimes(1);
    expect(disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(fixture.setIsActive).toHaveBeenCalledWith(false);
    expect(fixture.setCurrentState).toHaveBeenCalledWith('idle');
    expect(fixture.setCurrentSelection).toHaveBeenCalledWith({ x: 0, y: 0, width: 0, height: 0 });
    expect(fixture.setAspectRatio).toHaveBeenCalledWith(null);
    expect(fixture.setMaintainAspectRatio).toHaveBeenCalledWith(false);
    expect(fixture.setResolveCallback).toHaveBeenCalledWith(null);
    expect(fixture.setRejectCallback).toHaveBeenCalledWith(null);
    expect(rejectCallback).toHaveBeenCalledTimes(1);
    expect(rejectCallback.mock.calls[0]?.[0]).toMatchObject({ message: 'Cancelled by user' });
  });
}

function registerDisableApiNoRejectTest() {
  it('clears runtime state without rejecting when there is no pending selection', () => {
    const fixture = createDisableApiFixture();

    disableSelectionModeApi({
      cleanup: fixture.cleanup,
      getRejectCallback: () => null,
      setAspectRatio: fixture.setAspectRatio,
      setCurrentSelection: fixture.setCurrentSelection,
      setCurrentState: fixture.setCurrentState,
      setIsActive: fixture.setIsActive,
      setMaintainAspectRatio: fixture.setMaintainAspectRatio,
      setRejectCallback: fixture.setRejectCallback,
      setResolveCallback: fixture.setResolveCallback,
    });

    expect(fixture.cleanup).toHaveBeenCalledTimes(1);
    expect(disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(fixture.setRejectCallback).toHaveBeenCalledWith(null);
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
