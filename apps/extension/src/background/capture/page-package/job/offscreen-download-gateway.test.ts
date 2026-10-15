import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureMock, sendMock, waitMock } = vi.hoisted(() => ({
  ensureMock: vi.fn(),
  sendMock: vi.fn(),
  waitMock: vi.fn(),
}));

vi.mock('@sniptale/platform/security/offscreen-command-capability', () => ({
  attachOffscreenCommandCapability: (message: object) => ({ ...message, capabilityToken: 'token' }),
}));
vi.mock('../../../offscreen-document/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../offscreen-document/service')>()),
  ensureOffscreenDocument: ensureMock,
  waitForOffscreenReady: waitMock,
}));
vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: sendMock }),
}));

import { createPagePackageDownloadOffscreenGateway } from './offscreen-download-gateway';

const reference = {
  assetId: 'asset-1',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/asset-1' },
  mimeType: 'application/vnd.sniptale.page-package+zip',
  sha256: null,
  size: 7,
};
const signal = new AbortController().signal;

beforeEach(() => {
  vi.clearAllMocks();
  ensureMock.mockResolvedValue(undefined);
  waitMock.mockResolvedValue(undefined);
});

describe('Page Package offscreen download gateway', () => {
  it('ensures readiness and sends signed create, confirm, and release commands', async () => {
    sendMock
      .mockResolvedValueOnce({ success: true, result: 'leased', leaseId: 'lease-1', url: 'blob:1' })
      .mockResolvedValueOnce({ success: true, result: 'confirmed' })
      .mockResolvedValueOnce({ success: true, result: 'released' });
    const gateway = createPagePackageDownloadOffscreenGateway();
    await expect(
      gateway.create({
        downloadOperationId: 'operation-1',
        filename: 'page.zip',
        reference,
        signal,
      })
    ).resolves.toEqual({ leaseId: 'lease-1', url: 'blob:1' });
    await expect(
      gateway.confirm({ downloadOperationId: 'operation-1', leaseId: 'lease-1', signal })
    ).resolves.toBe(true);
    await expect(
      gateway.release({ downloadOperationId: 'operation-1', leaseId: 'lease-1' })
    ).resolves.toBe(true);
    expect(ensureMock).toHaveBeenCalledTimes(3);
    expect(waitMock).toHaveBeenCalledTimes(3);
    expect(waitMock).toHaveBeenNthCalledWith(1, 5_000, signal);
    expect(waitMock).toHaveBeenNthCalledWith(2, 5_000, signal);
    expect(waitMock).toHaveBeenNthCalledWith(3, 5_000, undefined);
    expect(sendMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE',
        capabilityToken: 'token',
      })
    );
    expect(sendMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE',
        capabilityToken: 'token',
        downloadOperationId: 'operation-1',
        leaseId: 'lease-1',
      })
    );
    expect(sendMock.mock.calls[1]?.[0]).not.toHaveProperty('signal');
  });

  it('surfaces authoritative offscreen failure', async () => {
    sendMock.mockResolvedValueOnce({ success: false, error: 'lease rejected' });
    await expect(
      createPagePackageDownloadOffscreenGateway().create({
        downloadOperationId: 'operation-1',
        filename: 'page.zip',
        reference,
        signal,
      })
    ).rejects.toThrow('lease rejected');
  });

  it('rejects a stale confirmation but treats stale release as idempotent success', async () => {
    sendMock
      .mockResolvedValueOnce({ success: true, result: 'stale' })
      .mockResolvedValueOnce({ success: true, result: 'stale' });
    const gateway = createPagePackageDownloadOffscreenGateway();
    await expect(
      gateway.confirm({ downloadOperationId: 'operation-1', leaseId: 'lease-1', signal })
    ).resolves.toBe(false);
    await expect(
      gateway.release({ downloadOperationId: 'operation-1', leaseId: 'lease-1' })
    ).resolves.toBe(true);
  });

  it('rejects malformed create success and release failure responses', async () => {
    const gateway = createPagePackageDownloadOffscreenGateway();
    sendMock.mockResolvedValueOnce({ success: true, result: 'leased' });
    await expect(
      gateway.create({
        downloadOperationId: 'operation-1',
        filename: 'page.zip',
        reference,
        signal,
      })
    ).rejects.toThrow('lease creation failed');
    sendMock.mockResolvedValueOnce({ success: false });
    await expect(
      gateway.release({ downloadOperationId: 'operation-1', leaseId: 'lease-1' })
    ).rejects.toThrow('lease release failed');
  });
});

it('prepares storage before collection rather than treating transport readiness as data readiness', async () => {
  sendMock.mockResolvedValueOnce({ success: true, result: 'accepted' });
  const { preparePagePackageDownloadRuntime } = await import('./offscreen-download-gateway');
  await preparePagePackageDownloadRuntime(signal);
  expect(sendMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'OFFSCREEN_PREPARE_PAGE_PACKAGE_DOWNLOAD',
      capabilityToken: 'token',
    })
  );
});

it('rejects preparation errors before exporting bytes', async () => {
  const { preparePagePackageDownloadRuntime } = await import('./offscreen-download-gateway');
  sendMock.mockResolvedValueOnce({ success: false, error: 'storage admission rejected' });
  await expect(preparePagePackageDownloadRuntime(signal)).rejects.toThrow(
    'storage admission rejected'
  );
  sendMock.mockResolvedValueOnce({ success: true });
  await expect(preparePagePackageDownloadRuntime(signal)).rejects.toThrow('preparation failed');
});

it('bounds stalled preparation and does not retain its deadline after completion', async () => {
  vi.useFakeTimers();
  try {
    const { preparePagePackageDownloadRuntime } = await import('./offscreen-download-gateway');
    sendMock.mockImplementationOnce(() => new Promise(() => undefined));
    const pending = expect(preparePagePackageDownloadRuntime(signal)).rejects.toThrow(
      'preparation timed out'
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
    sendMock.mockResolvedValueOnce({ success: true, result: 'accepted' });
    await preparePagePackageDownloadRuntime(signal);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('cancels a stalled preparation and skips a command after cancellation during document creation', async () => {
  const { preparePagePackageDownloadRuntime } = await import('./offscreen-download-gateway');
  const controller = new AbortController();
  let finish!: () => void;
  ensureMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const pending = expect(preparePagePackageDownloadRuntime(controller.signal)).rejects.toThrow(
    'cancelled'
  );
  controller.abort(new Error('cancelled'));
  await pending;
  finish();
  await Promise.resolve();
  expect(sendMock).not.toHaveBeenCalled();
});

it('cancels after sending preparation without waiting for shared storage admission', async () => {
  const { preparePagePackageDownloadRuntime } = await import('./offscreen-download-gateway');
  const controller = new AbortController();
  sendMock.mockImplementationOnce(() => new Promise(() => undefined));
  const pending = expect(preparePagePackageDownloadRuntime(controller.signal)).rejects.toThrow(
    'cancelled'
  );
  await vi.waitFor(() => expect(sendMock).toHaveBeenCalledOnce());
  controller.abort(new Error('cancelled'));
  await pending;
});
