import { expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';
import {
  browserPermissionsContainsMock,
  browserPermissionsRemoveMock,
  browserScriptingExecuteScriptMock,
  browserStorageSessionSetMock,
  browserScriptingRegisterContentScriptsMock,
  browserScriptingUnregisterContentScriptsMock,
  browserTabsGetMock,
  createMessage,
  sendTabMessageMock,
  sessionStorageState,
  setSessionStorageState,
  TEMPORARY_ACTIVE_TABS_STORAGE_KEY,
} from './service.test-support';

it('rejects unsupported tab URLs without injecting page runtime', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserTabsGetMock.mockResolvedValue({ id: 7, url: 'chrome://extensions' });

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.ACTIVATE_CURRENT_TAB))
  ).resolves.toEqual(
    expect.objectContaining({
      result: 'unsupported-url',
      status: expect.objectContaining({ supported: false, unsupportedReason: 'unsupported-url' }),
      success: false,
    })
  );

  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
  expect(browserScriptingRegisterContentScriptsMock).not.toHaveBeenCalled();
});

it('reports active status when all-sites permission already covers the current tab', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserPermissionsContainsMock.mockResolvedValueOnce(true);

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.READ_STATUS))
  ).resolves.toEqual(
    expect.objectContaining({
      status: expect.objectContaining({
        allSitesGranted: true,
        currentTabActive: true,
        siteGranted: true,
      }),
      success: true,
    })
  );

  expect(browserPermissionsContainsMock).toHaveBeenCalledWith({
    origins: ['<all_urls>'],
  });
});

it('does not report legacy split all-sites grants as active capture authority', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserPermissionsContainsMock.mockImplementation(
    async (query: { origins?: string[] }) =>
      query.origins?.length === 1 &&
      (query.origins[0] === 'http://*/*' || query.origins[0] === 'https://*/*')
  );

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.READ_STATUS))
  ).resolves.toEqual(
    expect.objectContaining({
      status: expect.objectContaining({
        allSitesGranted: false,
        currentTabActive: false,
        siteGranted: false,
      }),
      success: true,
    })
  );

  expect(browserPermissionsContainsMock).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
});

it('does not allow site-only persistent access as native visible capture authority', async () => {
  const { ensureNativeVisibleCaptureAuthority, hasActivePageAccess } = await import('./service');
  browserPermissionsContainsMock.mockImplementation(
    async (query: { origins?: string[] }) => query.origins?.[0] === 'https://example.test/*'
  );

  await expect(hasActivePageAccess(7)).resolves.toBe(true);
  await expect(ensureNativeVisibleCaptureAuthority(7)).rejects.toThrow(
    'Visible capture requires all-sites access or active tab activation.'
  );
});

it('allows all-sites access as native visible capture authority', async () => {
  const { ensureNativeVisibleCaptureAuthority } = await import('./service');
  browserPermissionsContainsMock.mockImplementation(
    async (query: { origins?: string[] }) => query.origins?.[0] === '<all_urls>'
  );

  await expect(ensureNativeVisibleCaptureAuthority(7)).resolves.toBeUndefined();
});

it('keeps repeated temporary activation idempotent for the same tab', async () => {
  const { handlePageAccessMessage } = await import('./service');
  const message = createMessage(PageAccessOperation.ACTIVATE_CURRENT_TAB, 9);
  browserTabsGetMock.mockResolvedValue({ id: 9, url: 'https://example.test/path' });

  await expect(handlePageAccessMessage(message)).resolves.toEqual(
    expect.objectContaining({ result: 'activated', success: true })
  );
  await expect(handlePageAccessMessage(message)).resolves.toEqual(
    expect.objectContaining({ result: 'already-active', success: true })
  );

  expect(browserScriptingExecuteScriptMock).toHaveBeenCalledTimes(1);
  expect(browserScriptingExecuteScriptMock).toHaveBeenCalledWith({
    files: ['assets/contentRuntime.js'],
    injectImmediately: false,
    target: { allFrames: true, tabId: 9 },
  });
});

it('runs with an injected temporary activation store', async () => {
  const { createPageAccessService } = await import('./service');
  const temporaryTabActivationStore = {
    clear: vi.fn(),
    grant: vi.fn(),
    has: vi.fn().mockResolvedValue(true),
    hydrate: vi.fn(),
  };
  const service = createPageAccessService({ temporaryTabActivationStore });

  await expect(
    service.handlePageAccessMessage(createMessage(PageAccessOperation.READ_STATUS))
  ).resolves.toEqual(
    expect.objectContaining({
      status: expect.objectContaining({ currentTabActive: true }),
      success: true,
    })
  );

  expect(temporaryTabActivationStore.has).toHaveBeenCalledWith(
    expect.objectContaining({ tabId: 7 })
  );
  await expect(service.hasActivePageAccess(7)).resolves.toBe(true);
  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
});

it('exposes default facade helpers for active page access checks', async () => {
  const { ensureActivePageAccessRuntime, hasActivePageAccess } = await import('./service');

  await expect(hasActivePageAccess(7)).resolves.toBe(false);
  await expect(ensureActivePageAccessRuntime(7, 'Page access missing')).rejects.toThrow(
    'Page access missing'
  );
});

it('restores temporary tab activation from session storage after service worker sleep', async () => {
  const { handlePageAccessMessage } = await import('./service');
  setSessionStorageState({
    [TEMPORARY_ACTIVE_TABS_STORAGE_KEY]: [{ tabId: 7, url: 'https://example.test/path' }],
  });

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.READ_STATUS))
  ).resolves.toEqual(
    expect.objectContaining({
      status: expect.objectContaining({
        currentTabActive: true,
        siteGranted: false,
      }),
      success: true,
    })
  );

  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
});

it('clears stale temporary tab activation when the tab URL changes', async () => {
  const { handlePageAccessMessage } = await import('./service');
  setSessionStorageState({
    [TEMPORARY_ACTIVE_TABS_STORAGE_KEY]: [{ tabId: 7, url: 'https://example.test/old' }],
  });

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.READ_STATUS))
  ).resolves.toEqual(
    expect.objectContaining({
      status: expect.objectContaining({ currentTabActive: false }),
      success: true,
    })
  );

  expect(sessionStorageState[TEMPORARY_ACTIVE_TABS_STORAGE_KEY]).toEqual([]);
});

it('keeps temporary activation usable when session storage write fails', async () => {
  const { handlePageAccessMessage } = await import('./service');
  const message = createMessage(PageAccessOperation.ACTIVATE_CURRENT_TAB, 9);
  browserTabsGetMock.mockResolvedValue({ id: 9, url: 'https://example.test/path' });
  browserStorageSessionSetMock.mockRejectedValue(new Error('session write failed'));

  await expect(handlePageAccessMessage(message)).resolves.toEqual(
    expect.objectContaining({ result: 'activated', success: true })
  );
  await expect(handlePageAccessMessage(message)).resolves.toEqual(
    expect.objectContaining({ result: 'already-active', success: true })
  );
});

it('refreshes active all-sites page access by reinjecting the current content runtime', async () => {
  const { refreshActivePageAccessRuntime } = await import('./service');
  browserPermissionsContainsMock.mockResolvedValue(true);

  await expect(refreshActivePageAccessRuntime(7)).resolves.toBe(true);

  expect(browserScriptingExecuteScriptMock).toHaveBeenCalledWith({
    files: ['assets/contentRuntime.js'],
    injectImmediately: false,
    target: { allFrames: true, tabId: 7 },
  });
  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: VideoMessageType.GET_VIEWPORT_COORDS,
  });
});

it('does not refresh content runtime when the tab has no active page access', async () => {
  const { refreshActivePageAccessRuntime } = await import('./service');

  await expect(refreshActivePageAccessRuntime(7)).resolves.toBe(false);

  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
  expect(sendTabMessageMock).not.toHaveBeenCalled();
});

it('unregisters the site content script when site access is revoked', async () => {
  const { handlePageAccessMessage } = await import('./service');

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.REVOKE_SITE))
  ).resolves.toEqual(expect.objectContaining({ result: 'revoked', success: true }));

  expect(browserPermissionsRemoveMock).toHaveBeenCalledWith({
    origins: ['https://example.test/*'],
  });
  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-site-aHR0cHM6Ly9leGFtcGxlLnRlc3Q'],
  });
});

it('does not revoke site scripts for unsupported tabs', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserTabsGetMock.mockResolvedValue({ id: 7, url: undefined });

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.REVOKE_SITE))
  ).resolves.toEqual(expect.objectContaining({ result: 'unsupported-url', success: false }));

  expect(browserPermissionsRemoveMock).not.toHaveBeenCalled();
  expect(browserScriptingUnregisterContentScriptsMock).not.toHaveBeenCalled();
});

it('unregisters removed all-sites and site-origin content scripts', async () => {
  const { unregisterRemovedPageAccessOrigins } = await import('./service');

  await unregisterRemovedPageAccessOrigins([
    '<all_urls>',
    'https://example.test/*',
    'chrome://extensions/*',
    'not-a-url/*',
  ]);

  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-all-sites'],
  });
  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-site-aHR0cHM6Ly9leGFtcGxlLnRlc3Q'],
  });
});
