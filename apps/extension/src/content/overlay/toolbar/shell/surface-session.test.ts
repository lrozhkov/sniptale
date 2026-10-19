import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';
import {
  createDisableScreenshotModeRequest,
  getScreenshotSurfaceCapabilityToken,
  setScreenshotSurfaceBinding,
} from '../../viewport-selector/capability';
import { refreshToolbarSurfaceSession } from './surface-session';

const sendRuntimeMessage = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessage);
  setScreenshotSurfaceBinding({ token: 'current-token', operationGeneration: 4 });
});

function deferredStatus() {
  let resolve!: (response: Record<string, unknown>) => void;
  sendRuntimeMessage.mockReturnValueOnce(
    new Promise((complete) => {
      resolve = complete;
    })
  );
  return { pending: refreshToolbarSurfaceSession(), resolve };
}

describe('toolbar surface status ordering', () => {
  it.each([false, true])('ignores an old %s status after a newer binding', async (enabled) => {
    const status = deferredStatus();
    setScreenshotSurfaceBinding({ token: 'replacement-token', operationGeneration: 8 });
    status.resolve({ success: true, enabled, surfaceCapabilityToken: 'old-token' });
    expect(await status.pending).toBeUndefined();
    expect(getScreenshotSurfaceCapabilityToken()).toBe('replacement-token');
    expect(createDisableScreenshotModeRequest()).toMatchObject({
      surfaceCapabilityToken: 'replacement-token',
      operationGeneration: 9,
    });
  });

  it('does not resurrect a binding retired during its status request', async () => {
    const status = deferredStatus();
    setScreenshotSurfaceBinding({ token: null });
    status.resolve({ success: true, enabled: true, surfaceCapabilityToken: 'current-token' });
    expect(await status.pending).toBeUndefined();
    expect(getScreenshotSurfaceCapabilityToken()).toBeNull();
  });

  it('does not roll back the operation generation after cleanup starts', async () => {
    const status = deferredStatus();
    expect(createDisableScreenshotModeRequest().operationGeneration).toBe(5);
    status.resolve({
      success: true,
      enabled: true,
      surfaceCapabilityToken: 'current-token',
      surfaceOperationGeneration: 4,
    });
    expect(await status.pending).toBeUndefined();
    expect(createDisableScreenshotModeRequest().operationGeneration).toBe(6);
  });

  it('applies a current status and preserves its lease and operation binding', async () => {
    sendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      enabled: true,
      surfaceCapabilityToken: 'current-token',
      surfaceOperationGeneration: 8,
      surfaceLeaseGeneration: 3,
    });
    await refreshToolbarSurfaceSession();
    expect(createDisableScreenshotModeRequest()).toMatchObject({
      surfaceCapabilityToken: 'current-token',
      operationGeneration: 9,
      leaseGeneration: 3,
    });
  });

  it('retains the current binding when status fails', async () => {
    sendRuntimeMessage.mockResolvedValueOnce({ success: false, error: 'status failed' });
    expect(await refreshToolbarSurfaceSession()).toMatchObject({ success: false });
    expect(getScreenshotSurfaceCapabilityToken()).toBe('current-token');
  });
});
