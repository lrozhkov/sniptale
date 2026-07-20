import { describe, expect, it, vi } from 'vitest';

const { createDownloadRouterServiceMock, service } = vi.hoisted(() => ({
  createDownloadRouterServiceMock: vi.fn(),
  service: { rememberPendingDownload: vi.fn() },
}));

vi.mock('./service', () => ({
  createDownloadRouterService: createDownloadRouterServiceMock.mockReturnValue(service),
}));

import { defaultDownloadRouterService } from './service-singleton';

describe('defaultDownloadRouterService', () => {
  it('creates the shared download router service through the service owner', () => {
    expect(createDownloadRouterServiceMock).toHaveBeenCalledOnce();
    expect(defaultDownloadRouterService).toBe(service);
  });
});
