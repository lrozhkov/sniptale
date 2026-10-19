import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickActionOverlay } from '../../../contracts/settings';
import type { ScreenshotControllerRuntime } from './types';
import {
  cancelQuickActionCountdown,
  closeQuickActionCapture,
  prepareScreenshotMode,
  syncCaptureAction,
  type ScreenshotControllerParams,
} from './mode';
import {
  disableNavigationLock,
  enableNavigationLock,
  isLockEnabled,
  setUIHidden,
} from '../../selection/locker';
import { createScreenshotControllerSession } from './session/state';
import { installContentRuntimeMessagingMock } from '../../application/runtime-services/services.test-support';
import { setScreenshotSurfaceBinding } from '../viewport-selector/capability';

const sendRuntimeMessageMock = vi.fn();

vi.mock('../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../selection/locker')>()),
  disableNavigationLock: vi.fn(),
  enableNavigationLock: vi.fn(),
  isLockEnabled: vi.fn(() => true),
  setUIHidden: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  installContentRuntimeMessagingMock(sendRuntimeMessageMock);
  setScreenshotSurfaceBinding({
    leaseGeneration: 3,
    operationGeneration: 4,
    token: 'surface-token',
  });
  vi.mocked(isLockEnabled).mockReset();
  vi.mocked(isLockEnabled).mockReturnValue(true);
});

function createScreenshotParams(): ScreenshotControllerParams {
  const quickActionOverlayRef = {
    current: {
      afterCapture: 'copy',
      exitAfterCapture: true,
      imageFormat: 'png',
      imageQuality: 90,
    } satisfies QuickActionOverlay,
  };
  const setQuickActionOverlay = vi.fn((overlay) => {
    quickActionOverlayRef.current = overlay;
  });

  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: 'download_default' },
    editingModes: {
      aiPickMode: false,
      designReviewMode: false,
      disableAiPickMode: vi.fn(),
      disableDesignReviewMode: vi.fn(),
      disableHighlighterMode: vi.fn(),
      disableQuickEditMode: vi.fn(),
      highlighterMode: false,
      quickEditMode: false,
      restoreEditingMode: vi.fn(),
      setAiPickMode: vi.fn(),
      setDesignReviewMode: vi.fn(),
      setHighlighterMode: vi.fn(),
      setQuickEditMode: vi.fn(),
    },
    navigationLockEnabled: true,
    quickActionOverlayRef,
    setCaptureAction: vi.fn(),
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
    setQuickActionOverlay,
    setScreenshotMode: vi.fn(),
    setTimerDelay: vi.fn(),
    timerDelay: 3,
  };
}

function createScreenshotRuntime(): ScreenshotControllerRuntime {
  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: 'download_default' },
    session: {
      editingModeBaseline: null,
      navigationLockBaseline: true,
      runActive: false,
      runGeneration: 1,
    },
    restoreEditingMode: vi.fn(),
    setCaptureAction: vi.fn(),
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
  };
}

function expectQuickActionCancelTearsDownWithoutRelock() {
  const params = createScreenshotParams();
  const runtime = createScreenshotRuntime();
  const session = createScreenshotControllerSession(true);
  session.countdownLock = { navigationLockEnabledBeforeCountdown: true };

  cancelQuickActionCountdown(params, runtime, session);

  expect(enableNavigationLock).toHaveBeenCalledWith(false);
  expect(session.countdownLock).toBeNull();
  expect(params.quickActionOverlayRef.current).toBeNull();
  expect(params.setScreenshotMode).toHaveBeenCalledWith(false);
  expect(params.setTimerDelay).toHaveBeenCalledWith(0);
  expect(setUIHidden).toHaveBeenCalledWith(false);
  expect(runtime.setNavigationLockEnabled).toHaveBeenCalledWith(true);
  expect(params.setIsToolbarVisible).toHaveBeenCalledWith(false);
}

function expectQuickActionSyncRoutesAfterCapture() {
  const params = createScreenshotParams();

  syncCaptureAction(params);

  expect(params.setCaptureAction).toHaveBeenCalledWith('copy');
}

function expectPrepareScreenshotModeDisablesEditingModes() {
  const params = {
    ...createScreenshotParams(),
    editingModes: {
      ...createScreenshotParams().editingModes,
      aiPickMode: true,
      highlighterMode: true,
      quickEditMode: true,
    },
  };
  const session = createScreenshotControllerSession(false);
  vi.mocked(isLockEnabled).mockReturnValueOnce(false);

  prepareScreenshotMode(params, session, 'selection');

  expect(session.navigationLockBaseline).toBe(false);
  expect(session.editingModeBaseline).toBe('ai-pick');
  expect(params.editingModes.disableQuickEditMode).toHaveBeenCalledOnce();
  expect(params.editingModes.setQuickEditMode).toHaveBeenCalledWith(false);
  expect(params.editingModes.disableHighlighterMode).toHaveBeenCalledOnce();
  expect(params.editingModes.setHighlighterMode).toHaveBeenCalledWith(false);
  expect(params.editingModes.disableAiPickMode).toHaveBeenCalledOnce();
  expect(params.editingModes.setAiPickMode).toHaveBeenCalledWith(false);
  expect(params.setNavigationLockEnabled).toHaveBeenCalledWith(false);
}

function expectPrepareScreenshotModeCapturesUserLockBaseline() {
  const params = createScreenshotParams();
  const session = createScreenshotControllerSession(false);
  vi.mocked(isLockEnabled).mockReturnValueOnce(true).mockReturnValueOnce(true);

  prepareScreenshotMode(params, session, 'visible');

  expect(session.navigationLockBaseline).toBe(true);
  expect(session.editingModeBaseline).toBeNull();
  expect(params.editingModes.disableHighlighterMode).not.toHaveBeenCalled();
  expect(params.editingModes.disableAiPickMode).not.toHaveBeenCalled();
  expect(params.setNavigationLockEnabled).toHaveBeenCalledWith(true);
}

function expectPrepareScreenshotModeUsesAutoStartBaseline() {
  const params = createScreenshotParams();
  const session = createScreenshotControllerSession(true);
  vi.mocked(isLockEnabled).mockReturnValueOnce(true);

  prepareScreenshotMode(params, session, 'visible', {
    navigationLockBaseline: false,
  });

  expect(session.navigationLockBaseline).toBe(false);
  expect(params.setNavigationLockEnabled).toHaveBeenCalledWith(true);
}

function expectQuickActionCloseRestoresUnlockedBaseline() {
  const params = createScreenshotParams();
  const runtime = createScreenshotRuntime();
  runtime.session.navigationLockBaseline = false;

  closeQuickActionCapture(params, runtime, 1);

  expect(disableNavigationLock).toHaveBeenCalledOnce();
  expect(enableNavigationLock).not.toHaveBeenCalled();
  expect(runtime.setNavigationLockEnabled).toHaveBeenCalledWith(false);
  expect(params.quickActionOverlayRef.current).toBeNull();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    leaseGeneration: 3,
    operationGeneration: 5,
    surfaceCapabilityToken: 'surface-token',
    type: 'DISABLE_SCREENSHOT_MODE',
  });
}

function expectQuickActionCloseRestoresPreLockedBaseline() {
  const params = createScreenshotParams();
  const runtime = createScreenshotRuntime();
  runtime.session.navigationLockBaseline = true;

  closeQuickActionCapture(params, runtime, 1);

  expect(enableNavigationLock).toHaveBeenCalledWith(false);
  expect(disableNavigationLock).not.toHaveBeenCalled();
  expect(runtime.setNavigationLockEnabled).toHaveBeenCalledWith(true);
}

function expectStaleQuickActionCloseDoesNotRestoreLock() {
  const params = createScreenshotParams();
  const runtime = createScreenshotRuntime();
  runtime.session.runGeneration = 2;

  closeQuickActionCapture(params, runtime, 1);

  expect(disableNavigationLock).not.toHaveBeenCalled();
  expect(enableNavigationLock).not.toHaveBeenCalled();
  expect(runtime.setNavigationLockEnabled).not.toHaveBeenCalled();
  expect(params.quickActionOverlayRef.current).not.toBeNull();
}

describe('screenshot-controller-mode', () => {
  it('authorizes scoped cleanup before querying a session that has not bound its document', async () => {
    const params = createScreenshotParams();
    const runtime = createScreenshotRuntime();
    Object.assign(params.quickActionOverlayRef.current!, { transactionId: 'capture-1' });
    runtime.session.preparationBaseline = {
      captureAction: 'edit',
      timerDelay: 7,
      isToolbarVisible: true,
      navigationLockEnabled: false,
      editingMode: 'drawing',
    };
    let documentBound = false;
    sendRuntimeMessageMock.mockImplementation(async (request) => {
      if (request.type === 'DISABLE_SCREENSHOT_MODE') {
        documentBound = true;
        return { success: true };
      }
      return {
        success: true,
        enabled: true,
        ...(documentBound
          ? { surfaceCapabilityToken: 'surface-token', surfaceOperationGeneration: 5 }
          : {}),
        viewport: null,
      };
    });
    await closeQuickActionCapture(params, runtime, 1);
    expect(sendRuntimeMessageMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        type: 'DISABLE_SCREENSHOT_MODE',
        quickActionTransactionId: 'capture-1',
        surfaceCapabilityToken: 'surface-token',
      })
    );
    expect(params.quickActionOverlayRef.current).toBeNull();
  });
  it('restores borrowed controls after a scoped release failure without generic teardown', async () => {
    const params = createScreenshotParams();
    const runtime = createScreenshotRuntime();
    Object.assign(params.quickActionOverlayRef.current!, { transactionId: 'capture-1' });
    Object.assign(runtime.session, {
      preparationBaseline: {
        captureAction: 'edit',
        timerDelay: 7,
        isToolbarVisible: true,
        navigationLockEnabled: false,
        editingMode: 'drawing',
      },
      editingModeBaseline: 'drawing',
    });
    sendRuntimeMessageMock.mockImplementation(async (request) =>
      request.type === 'SCREENSHOT_MODE_STATUS'
        ? { success: true, enabled: true, surfaceCapabilityToken: 'restored-token' }
        : { success: false, error: 'Release failed' }
    );
    await expect(closeQuickActionCapture(params, runtime, 1)).rejects.toThrow('Release failed');
    expect(params.setScreenshotMode).not.toHaveBeenCalledWith(false);
    expect(params.setIsToolbarVisible).toHaveBeenCalledWith(true);
    expect(params.setCaptureAction).toHaveBeenCalledWith('edit');
    expect(runtime.restoreEditingMode).toHaveBeenCalledWith('drawing');
    expect(runtime.session.preparationBaseline).not.toBeNull();
    expect(params.quickActionOverlayRef.current).toEqual(
      expect.objectContaining({ transactionId: 'capture-1' })
    );
    expect(
      sendRuntimeMessageMock.mock.calls.filter(
        ([request]) => request.type === 'DISABLE_SCREENSHOT_MODE'
      )
    ).toEqual([[expect.objectContaining({ quickActionTransactionId: 'capture-1' })]]);
    sendRuntimeMessageMock.mockImplementation(async (request) =>
      request.type === 'SCREENSHOT_MODE_STATUS'
        ? { success: true, enabled: true, surfaceCapabilityToken: 'restored-token' }
        : { success: true }
    );
    await closeQuickActionCapture(params, runtime, 1);
    expect(
      sendRuntimeMessageMock.mock.calls.filter(
        ([request]) => request.type === 'DISABLE_SCREENSHOT_MODE'
      )
    ).toEqual([
      [expect.objectContaining({ quickActionTransactionId: 'capture-1' })],
      [expect.objectContaining({ quickActionTransactionId: 'capture-1' })],
    ]);
    expect(params.quickActionOverlayRef.current).toBeNull();
    expect(runtime.session.preparationBaseline).toBeNull();
  });

  it('does not restore borrowed controls when explicit Close supersedes a status request', async () => {
    const params = createScreenshotParams();
    const runtime = createScreenshotRuntime();
    Object.assign(params.quickActionOverlayRef.current!, { transactionId: 'capture-1' });
    Object.assign(runtime.session, {
      preparationBaseline: {
        captureAction: 'edit',
        timerDelay: 7,
        isToolbarVisible: true,
        navigationLockEnabled: false,
        editingMode: 'drawing',
      },
    });
    let resolveStatus!: (response: object) => void;
    sendRuntimeMessageMock.mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      })
    );
    const closing = closeQuickActionCapture(params, runtime, 1);
    runtime.session.runGeneration += 1;
    runtime.session.preparationBaseline = null;
    resolveStatus({ success: true, enabled: true, surfaceCapabilityToken: 'old-token' });
    await expect(closing).rejects.toThrow('Screenshot run was superseded');
    expect(params.setScreenshotMode).not.toHaveBeenCalled();
    expect(params.setCaptureAction).not.toHaveBeenCalled();
    expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(1);
  });

  it('does not clear a newer overlay when scoped cleanup settles late', async () => {
    const params = createScreenshotParams();
    const runtime = createScreenshotRuntime();
    Object.assign(params.quickActionOverlayRef.current!, { transactionId: 'capture-1' });
    Object.assign(runtime.session, {
      preparationBaseline: {
        captureAction: 'edit',
        timerDelay: 7,
        isToolbarVisible: true,
        navigationLockEnabled: false,
        editingMode: 'drawing',
      },
    });
    let resolveRelease!: (response: object) => void;
    let markReleaseStarted!: () => void;
    const releaseStarted = new Promise<void>((resolve) => {
      markReleaseStarted = resolve;
    });
    sendRuntimeMessageMock.mockImplementation(async (request) => {
      if (request.type === 'SCREENSHOT_MODE_STATUS')
        return { success: true, enabled: true, surfaceCapabilityToken: 'current-token' };
      return new Promise((resolve) => {
        resolveRelease = resolve;
        markReleaseStarted();
      });
    });
    const closing = closeQuickActionCapture(params, runtime, 1);
    await releaseStarted;
    runtime.session.runGeneration += 1;
    Object.assign(params.quickActionOverlayRef.current!, { transactionId: 'capture-2' });
    resolveRelease({ success: true });
    await expect(closing).rejects.toThrow('Screenshot run was superseded');
    expect(params.quickActionOverlayRef.current).toEqual(
      expect.objectContaining({ transactionId: 'capture-2' })
    );
    expect(params.setCaptureAction).not.toHaveBeenCalled();
  });

  it('retains QuickEdit document mode as the selection recovery baseline', () => {
    const params = createScreenshotParams();
    params.editingModes.quickEditMode = true;
    params.editingModes.quickEditDocumentMode = true;
    const session = createScreenshotControllerSession(false);
    prepareScreenshotMode(params, session, 'selection');
    expect(session.editingModeBaseline).toBe('quick-edit-document');
  });
  it('preserves a borrowed preparation session instead of disabling the toolbar', async () => {
    const params = createScreenshotParams();
    const runtime = createScreenshotRuntime();
    Object.assign(params.quickActionOverlayRef.current!, { transactionId: 'capture-1' });
    Object.assign(runtime.session, {
      preparationBaseline: {
        captureAction: 'edit',
        timerDelay: 7,
        isToolbarVisible: true,
        navigationLockEnabled: false,
        editingMode: 'drawing',
      },
    });
    sendRuntimeMessageMock.mockImplementation(async (request) =>
      request.type === 'SCREENSHOT_MODE_STATUS'
        ? {
            success: true,
            enabled: true,
            surfaceCapabilityToken: 'restored-token',
            surfaceLeaseGeneration: 8,
            surfaceOperationGeneration: 10,
            viewport: null,
          }
        : { success: true }
    );

    await closeQuickActionCapture(params, runtime, 1);

    expect(params.setScreenshotMode).not.toHaveBeenCalledWith(false);
    expect(params.setIsToolbarVisible).toHaveBeenCalledWith(true);
    expect(params.setCaptureAction).toHaveBeenCalledWith('edit');
    expect(params.setTimerDelay).toHaveBeenCalledWith(7);
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DISABLE_SCREENSHOT_MODE',
        quickActionTransactionId: 'capture-1',
        surfaceCapabilityToken: 'surface-token',
        operationGeneration: 5,
      })
    );
  });

  it('keeps visible capture editing owners alive for a borrowed session', () => {
    const params = createScreenshotParams();
    params.editingModes.quickEditMode = true;
    const session = createScreenshotControllerSession(false);
    Object.assign(session, { preparationBaseline: { editingMode: 'quick-edit' } });
    prepareScreenshotMode(params, session, 'visible');
    expect(params.editingModes.disableQuickEditMode).not.toHaveBeenCalled();
  });
  it(
    'tears down quick-action countdown without re-locking navigation',
    expectQuickActionCancelTearsDownWithoutRelock
  );
  it(
    'routes quick-action after-capture changes through the shared capture-action setter',
    expectQuickActionSyncRoutesAfterCapture
  );
  it(
    'prepares screenshot mode by disabling editing owners without restoring their lock',
    expectPrepareScreenshotModeDisablesEditingModes
  );
  it(
    'captures a user-owned navigation lock baseline when no editing mode owns it',
    expectPrepareScreenshotModeCapturesUserLockBaseline
  );
  it(
    'uses the auto-start navigation baseline instead of the temporary capture lock',
    expectPrepareScreenshotModeUsesAutoStartBaseline
  );
  it(
    'restores an unlocked baseline after quick-action capture exit',
    expectQuickActionCloseRestoresUnlockedBaseline
  );
  it(
    'restores a pre-locked baseline after quick-action capture exit',
    expectQuickActionCloseRestoresPreLockedBaseline
  );
  it('ignores stale quick-action close attempts', expectStaleQuickActionCloseDoesNotRestoreLock);
});
