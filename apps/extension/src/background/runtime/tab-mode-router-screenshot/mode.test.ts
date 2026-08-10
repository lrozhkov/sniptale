import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  browserTabsGet: vi.fn(),
  browserTabsGetZoom: vi.fn(),
  getApplied: vi.fn(),
  getAvailability: vi.fn(),
  release: vi.fn(),
  releaseTabOwners: vi.fn(),
  sendTabMessage: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: mocks.browserTabsGet, getZoom: mocks.browserTabsGetZoom },
}));

vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    apply: mocks.apply,
    getApplied: mocks.getApplied,
    getAvailability: mocks.getAvailability,
    release: mocks.release,
    releaseTabOwners: mocks.releaseTabOwners,
  }),
}));

vi.mock('@sniptale/platform/browser/runtime', () => ({
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));

import {
  authorizeScreenshotSurfaceMutation,
  getScreenshotSurfaceSession,
  resetScreenshotSurfaceSessionsForTests,
} from '../../capture-surface/screenshot-session';
import {
  disableScreenshotMode,
  disableScreenshotModeForContent,
  enableScreenshotMode,
  enableScreenshotModeGuarded,
} from './mode';

const preset = {
  kind: 'user' as const,
  id: 'wide',
  name: 'Wide',
  target: 'viewport' as const,
  width: 1440,
  height: 900,
  enabled: true,
  order: 0,
};

const applied = {
  sessionId: 'uuid-2',
  leaseId: 'lease-1',
  generation: 1,
  presetId: preset.id,
  target: preset.target,
  width: preset.width,
  height: preset.height,
};

function state() {
  return {
    screenshot: new Map<number, boolean>(),
    viewport: new Map<
      number,
      { presetId: string; target: 'viewport' | 'window'; width: number; height: number } | null
    >(),
    owner: new Map<number, 'capture-surface' | 'viewer'>(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetScreenshotSurfaceSessionsForTests();
  let uuid = 0;
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++uuid}`) });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: mocks.sendTabMessage });
  mocks.browserTabsGet.mockResolvedValue({ id: 5, windowId: 3, url: 'https://example.com' });
  mocks.browserTabsGetZoom.mockResolvedValue(1);
  mocks.getAvailability.mockResolvedValue({
    status: 'available',
    presetId: preset.id,
    target: preset.target,
    required: { width: preset.width, height: preset.height },
  });
  mocks.apply.mockResolvedValue(applied);
  mocks.getApplied.mockReturnValue(applied);
  mocks.release.mockResolvedValue(undefined);
  mocks.releaseTabOwners.mockResolvedValue(undefined);
  mocks.sendTabMessage.mockResolvedValue(undefined);
});

describe('screenshot mode initial surface setup', () => {
  it('binds the trusted content document and keeps the current page size', async () => {
    const current = state();

    await enableScreenshotMode(5, current.screenshot, current.viewport, current.owner, new Map(), {
      surfaceDocumentId: 'content-document-5',
    });

    expect(getScreenshotSurfaceSession(5)).toMatchObject({
      documentId: 'content-document-5',
    });
    expect(mocks.getAvailability).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.sendTabMessage).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ viewport: null })
    );
    expect(current.viewport.get(5)).toBeNull();
    expect(current.owner.has(5)).toBe(false);
  });
});

describe('screenshot mode session reconciliation', () => {
  it('reenables an existing screenshot session from the observed preparation state', async () => {
    const current = state();
    await enableScreenshotMode(5, current.screenshot, current.viewport, current.owner);
    const commitGuard = vi.fn().mockResolvedValue(true);
    const readPreparationState = vi
      .fn()
      .mockResolvedValue({ screenshotMode: true, visible: false });

    await expect(
      enableScreenshotModeGuarded(
        5,
        current.screenshot,
        current.viewport,
        current.owner,
        new Map(),
        { commitGuard, readPreparationState }
      )
    ).resolves.toBe(true);

    expect(readPreparationState).toHaveBeenCalledOnce();
    expect(commitGuard).toHaveBeenCalledTimes(2);
    expect(mocks.sendTabMessage).toHaveBeenLastCalledWith(
      5,
      expect.objectContaining({ toolbarVisible: false, viewport: current.viewport.get(5) })
    );
  });

  it('restores the prior preparation visibility when a guarded reenable loses authority', async () => {
    const current = state();
    await enableScreenshotMode(5, current.screenshot, current.viewport, current.owner);
    mocks.sendTabMessage.mockClear();
    const commitGuard = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      enableScreenshotModeGuarded(
        5,
        current.screenshot,
        current.viewport,
        current.owner,
        new Map(),
        {
          commitGuard,
          readPreparationState: vi.fn().mockResolvedValue({ screenshotMode: true, visible: false }),
          toolbarVisible: true,
        }
      )
    ).resolves.toBe(false);

    expect(mocks.sendTabMessage).toHaveBeenNthCalledWith(
      1,
      5,
      expect.objectContaining({ toolbarVisible: true, type: 'ENABLE_SCREENSHOT_MODE' })
    );
    expect(mocks.sendTabMessage).toHaveBeenNthCalledWith(
      2,
      5,
      expect.objectContaining({ toolbarVisible: false, type: 'ENABLE_SCREENSHOT_MODE' })
    );
    expect(current.screenshot.get(5)).toBe(true);
  });

  it('disables preparation when a new-session post-effect guard throws', async () => {
    const current = state();
    const commitGuard = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('authority changed'));

    await expect(
      enableScreenshotModeGuarded(
        5,
        current.screenshot,
        current.viewport,
        current.owner,
        new Map(),
        { commitGuard }
      )
    ).rejects.toThrow('authority changed');

    expect(mocks.sendTabMessage).toHaveBeenLastCalledWith(5, {
      type: 'DISABLE_SCREENSHOT_MODE',
    });
    expect(mocks.releaseTabOwners).not.toHaveBeenCalled();
    expect(current.screenshot.has(5)).toBe(false);
  });

  it('rolls back a prepared new session when the post-effect guard declines the commit', async () => {
    const current = state();
    const commitGuard = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      enableScreenshotModeGuarded(
        5,
        current.screenshot,
        current.viewport,
        current.owner,
        new Map(),
        { commitGuard }
      )
    ).resolves.toBe(false);

    expect(mocks.sendTabMessage).toHaveBeenLastCalledWith(5, {
      type: 'DISABLE_SCREENSHOT_MODE',
    });
    expect(mocks.releaseTabOwners).not.toHaveBeenCalled();
    expect(getScreenshotSurfaceSession(5)).toBeNull();
    expect(current.screenshot.has(5)).toBe(false);
  });
});

describe('screenshot mode rollback and disable', () => {
  it('tears down preparation without releasing a nonexistent initial surface', async () => {
    mocks.sendTabMessage.mockRejectedValueOnce(new Error('content unavailable'));
    const current = state();

    await expect(
      enableScreenshotMode(5, current.screenshot, current.viewport, current.owner)
    ).rejects.toThrow('content unavailable');

    expect(mocks.releaseTabOwners).not.toHaveBeenCalled();
    expect(current.screenshot.has(5)).toBe(false);
  });

  it('aggregates preparation enable and disable failures', async () => {
    const enableError = new Error('content enable failed');
    const disableError = new Error('content disable failed');
    mocks.sendTabMessage.mockRejectedValueOnce(enableError).mockRejectedValueOnce(disableError);
    const current = state();

    const failure = await enableScreenshotMode(
      5,
      current.screenshot,
      current.viewport,
      current.owner
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([enableError, disableError]);
    expect(mocks.releaseTabOwners).not.toHaveBeenCalled();
    expect(getScreenshotSurfaceSession(5)).toBeNull();
  });

  it('ends the surface session when preparation rollback fails without a physical surface', async () => {
    const enableError = new Error('content enable failed');
    const disableError = new Error('content disable failed');
    mocks.sendTabMessage.mockRejectedValueOnce(enableError).mockRejectedValueOnce(disableError);
    const current = state();

    const failure = await enableScreenshotMode(
      5,
      current.screenshot,
      current.viewport,
      current.owner
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([enableError, disableError]);
    expect(getScreenshotSurfaceSession(5)).toBeNull();
  });

  it('releases through the capture-surface owner and clears state on disable', async () => {
    const current = state();
    await enableScreenshotMode(5, current.screenshot, current.viewport, current.owner);

    await disableScreenshotMode(5, current.screenshot, current.viewport, current.owner);

    expect(mocks.releaseTabOwners).toHaveBeenCalledWith(5, ['screenshot']);
    expect(mocks.sendTabMessage).toHaveBeenLastCalledWith(5, {
      type: 'DISABLE_SCREENSHOT_MODE',
    });
    expect(current.screenshot.has(5)).toBe(false);
    expect(current.viewport.has(5)).toBe(false);
    expect(current.owner.has(5)).toBe(false);
  });

  it('runs owner-scoped cleanup even when no matching applied surface is projected', async () => {
    const current = state();
    await enableScreenshotMode(5, current.screenshot, current.viewport, current.owner);
    mocks.releaseTabOwners.mockClear();
    mocks.getApplied.mockReturnValue(null);

    await disableScreenshotMode(5, current.screenshot, current.viewport, current.owner);

    expect(mocks.releaseTabOwners).toHaveBeenCalledWith(5, ['screenshot']);
    expect(current.screenshot.has(5)).toBe(false);
  });

  it('allows the active content document to disable its exact screenshot surface lease', async () => {
    const current = state();
    await enableScreenshotMode(5, current.screenshot, current.viewport, current.owner);
    const session = getScreenshotSurfaceSession(5)!;
    mocks.releaseTabOwners.mockClear();
    mocks.sendTabMessage.mockClear();

    await disableScreenshotModeForContent({
      leaseGeneration: session.activeLeaseGeneration,
      operationGeneration: session.lastOperationGeneration + 1,
      screenshotModeState: current.screenshot,
      senderDocumentId: 'document-a',
      surfaceCapabilityToken: session.capabilityToken,
      tabId: 5,
      viewportOwnerState: current.owner,
      viewportState: current.viewport,
      webSnapshotViewerPorts: new Map(),
    });

    expect(mocks.releaseTabOwners).toHaveBeenCalledWith(5, ['screenshot']);
    expect(mocks.releaseTabOwners.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendTabMessage.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(getScreenshotSurfaceSession(5)).toBeNull();
    expect(current.screenshot.has(5)).toBe(false);
  });

  it('preserves content mode and session state when surface release fails before teardown', async () => {
    const current = state();
    await enableScreenshotMode(5, current.screenshot, current.viewport, current.owner);
    current.viewport.set(5, {
      presetId: preset.id,
      target: preset.target,
      width: preset.width,
      height: preset.height,
    });
    current.owner.set(5, 'capture-surface');
    const session = getScreenshotSurfaceSession(5)!;
    mocks.sendTabMessage.mockClear();
    mocks.releaseTabOwners.mockRejectedValueOnce(new Error('surface release failed'));

    await expect(
      disableScreenshotModeForContent({
        leaseGeneration: session.activeLeaseGeneration,
        operationGeneration: session.lastOperationGeneration + 1,
        screenshotModeState: current.screenshot,
        senderDocumentId: 'document-a',
        surfaceCapabilityToken: session.capabilityToken,
        tabId: 5,
        viewportOwnerState: current.owner,
        viewportState: current.viewport,
        webSnapshotViewerPorts: new Map(),
      })
    ).rejects.toThrow('surface release failed');

    expect(mocks.sendTabMessage).not.toHaveBeenCalled();
    expect(getScreenshotSurfaceSession(5)).not.toBeNull();
    expect(current.screenshot.get(5)).toBe(true);
    expect(current.owner.get(5)).toBe('capture-surface');
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it('preserves background session state when content rejects final teardown', async () => {
    const current = state();
    await enableScreenshotMode(5, current.screenshot, current.viewport, current.owner);
    current.viewport.set(5, {
      presetId: preset.id,
      target: preset.target,
      width: preset.width,
      height: preset.height,
    });
    current.owner.set(5, 'capture-surface');
    const session = getScreenshotSurfaceSession(5)!;
    mocks.sendTabMessage.mockClear();
    mocks.sendTabMessage.mockResolvedValueOnce({
      error: 'stale-target-state',
      success: false,
    });

    await expect(
      disableScreenshotModeForContent({
        leaseGeneration: session.activeLeaseGeneration,
        operationGeneration: session.lastOperationGeneration + 1,
        screenshotModeState: current.screenshot,
        senderDocumentId: 'document-a',
        surfaceCapabilityToken: session.capabilityToken,
        tabId: 5,
        viewportOwnerState: current.owner,
        viewportState: current.viewport,
        webSnapshotViewerPorts: new Map(),
      })
    ).rejects.toThrow('stale-target-state');

    expect(getScreenshotSurfaceSession(5)).not.toBeNull();
    expect(current.screenshot.get(5)).toBe(true);
    expect(current.owner.get(5)).toBe('capture-surface');
    expect(mocks.apply).toHaveBeenCalledOnce();
  });

  it('rejects a stale document A disable without tearing down replacement session B', async () => {
    const current = state();
    await enableScreenshotMode(5, current.screenshot, current.viewport, current.owner);
    const sessionA = getScreenshotSurfaceSession(5)!;
    expect(
      authorizeScreenshotSurfaceMutation({
        capabilityToken: sessionA.capabilityToken,
        documentId: 'document-a',
        tabId: 5,
      })
    ).toBe(true);
    const staleDisable = {
      leaseGeneration: sessionA.activeLeaseGeneration,
      operationGeneration: sessionA.lastOperationGeneration + 1,
      senderDocumentId: 'document-a',
      surfaceCapabilityToken: sessionA.capabilityToken,
    };

    await disableScreenshotMode(5, current.screenshot, current.viewport, current.owner);
    await enableScreenshotMode(5, current.screenshot, current.viewport, current.owner);
    const sessionB = getScreenshotSurfaceSession(5)!;
    expect(
      authorizeScreenshotSurfaceMutation({
        capabilityToken: sessionB.capabilityToken,
        documentId: 'document-b',
        tabId: 5,
      })
    ).toBe(true);
    mocks.releaseTabOwners.mockClear();
    mocks.sendTabMessage.mockClear();

    await expect(
      disableScreenshotModeForContent({
        ...staleDisable,
        screenshotModeState: current.screenshot,
        tabId: 5,
        viewportOwnerState: current.owner,
        viewportState: current.viewport,
        webSnapshotViewerPorts: new Map(),
      })
    ).rejects.toThrow('authorization-expired');

    expect(getScreenshotSurfaceSession(5)).toBe(sessionB);
    expect(current.screenshot.get(5)).toBe(true);
    expect(current.owner.has(5)).toBe(false);
    expect(mocks.sendTabMessage).not.toHaveBeenCalled();
    expect(mocks.releaseTabOwners).not.toHaveBeenCalled();
  });

  it('rejects restricted browser pages before surface mutation', async () => {
    mocks.browserTabsGet.mockResolvedValue({ id: 5, url: 'chrome://extensions' });
    const current = state();

    await expect(
      enableScreenshotMode(5, current.screenshot, current.viewport, current.owner)
    ).rejects.toThrow();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.sendTabMessage).not.toHaveBeenCalled();
  });
});
