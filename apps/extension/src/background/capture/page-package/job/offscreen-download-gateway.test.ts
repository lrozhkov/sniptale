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
      gateway.create({ downloadOperationId: 'operation-1', filename: 'page.zip', reference })
    ).resolves.toEqual({ leaseId: 'lease-1', url: 'blob:1' });
    await expect(
      gateway.confirm({ downloadOperationId: 'operation-1', leaseId: 'lease-1' })
    ).resolves.toBe(true);
    await expect(
      gateway.release({ downloadOperationId: 'operation-1', leaseId: 'lease-1' })
    ).resolves.toBe(true);
    expect(ensureMock).toHaveBeenCalledTimes(3);
    expect(sendMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE',
        capabilityToken: 'token',
      })
    );
  });

  it('surfaces authoritative offscreen failure', async () => {
    sendMock.mockResolvedValueOnce({ success: false, error: 'lease rejected' });
    await expect(
      createPagePackageDownloadOffscreenGateway().create({
        downloadOperationId: 'operation-1',
        filename: 'page.zip',
        reference,
      })
    ).rejects.toThrow('lease rejected');
  });

  it('rejects a stale confirmation but treats stale release as idempotent success', async () => {
    sendMock
      .mockResolvedValueOnce({ success: true, result: 'stale' })
      .mockResolvedValueOnce({ success: true, result: 'stale' });
    const gateway = createPagePackageDownloadOffscreenGateway();
    await expect(
      gateway.confirm({ downloadOperationId: 'operation-1', leaseId: 'lease-1' })
    ).resolves.toBe(false);
    await expect(
      gateway.release({ downloadOperationId: 'operation-1', leaseId: 'lease-1' })
    ).resolves.toBe(true);
  });

  it('rejects malformed create success and release failure responses', async () => {
    const gateway = createPagePackageDownloadOffscreenGateway();
    sendMock.mockResolvedValueOnce({ success: true, result: 'leased' });
    await expect(
      gateway.create({ downloadOperationId: 'operation-1', filename: 'page.zip', reference })
    ).rejects.toThrow('lease creation failed');
    sendMock.mockResolvedValueOnce({ success: false });
    await expect(
      gateway.release({ downloadOperationId: 'operation-1', leaseId: 'lease-1' })
    ).rejects.toThrow('lease release failed');
  });
});
