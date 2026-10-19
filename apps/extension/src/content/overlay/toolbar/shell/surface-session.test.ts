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
  it('preserves startup authority when enabled status omits an unbound token', async () => {
    setScreenshotSurfaceBinding({
      token: 'startup-token',
      leaseGeneration: 3,
      operationGeneration: 4,
    });
    sendRuntimeMessage.mockResolvedValueOnce({ success: true, enabled: true });
    expect(await refreshToolbarSurfaceSession()).toMatchObject({ success: true, enabled: true });
    expect(createDisableScreenshotModeRequest()).toMatchObject({
      surfaceCapabilityToken: 'startup-token',
      leaseGeneration: 3,
      operationGeneration: 5,
    });
  });

  it('does not mint authority from an enabled status without a token', async () => {
    setScreenshotSurfaceBinding({ token: null });
    sendRuntimeMessage.mockResolvedValueOnce({ success: true, enabled: true });
    await refreshToolbarSurfaceSession();
    expect(getScreenshotSurfaceCapabilityToken()).toBeNull();
  });

  it('retires the current binding when status explicitly disables preparation', async () => {
    sendRuntimeMessage.mockResolvedValueOnce({ success: true, enabled: false });
    await refreshToolbarSurfaceSession();
    expect(getScreenshotSurfaceCapabilityToken()).toBeNull();
  });

  it('rejects an unbound status superseded by a newer binding', async () => {
    const status = deferredStatus();
    setScreenshotSurfaceBinding({ token: 'replacement-token', operationGeneration: 8 });
    status.resolve({ success: true, enabled: true });
    expect(await status.pending).toBeUndefined();
    expect(createDisableScreenshotModeRequest()).toMatchObject({
      surfaceCapabilityToken: 'replacement-token',
      operationGeneration: 9,
    });
  });

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
