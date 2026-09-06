import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';
import {
  browserPermissionsContainsMock,
  browserPermissionsRemoveMock,
  browserPermissionsRequestMock,
  browserScriptingExecuteScriptMock,
  browserScriptingGetRegisteredContentScriptsMock,
  browserScriptingRegisterContentScriptsMock,
  browserScriptingUnregisterContentScriptsMock,
  browserTabsGetMock,
  createMessage,
  sendTabMessageMock,
} from './service.test-support';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

it('handles denied all-sites grants without registering global content scripts', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserPermissionsRequestMock.mockResolvedValue(false);

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.GRANT_ALL_SITES))
  ).resolves.toEqual(expect.objectContaining({ result: 'permission-denied', success: false }));

  expect(browserScriptingRegisterContentScriptsMock).not.toHaveBeenCalled();
  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
});

it('reports whether pin-to-tab already has persistent all-sites access', async () => {
  const { hasPinnedToolbarAllSitesAccess } = await import('./service');
  browserPermissionsContainsMock.mockResolvedValueOnce(true);

  await expect(hasPinnedToolbarAllSitesAccess()).resolves.toBe(true);

  expect(browserPermissionsContainsMock).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
  expect(browserPermissionsRequestMock).not.toHaveBeenCalled();
});

it('does not mutate an existing all-sites grant when pinned runtime registration fails', async () => {
  const { registerPinnedToolbarAllSitesAccess } = await import('./service');
  browserScriptingRegisterContentScriptsMock.mockRejectedValueOnce(new Error('register failed'));

  await expect(
    registerPinnedToolbarAllSitesAccess({
      commit: async () => true,
      expectedUrl: 'https://example.test/path',
      isCurrent: () => true,
      tabId: 7,
    })
  ).rejects.toThrow('register failed');

  expect(browserPermissionsRequestMock).not.toHaveBeenCalled();
  expect(browserPermissionsRemoveMock).not.toHaveBeenCalled();
});

it('rejects pinned runtime registration after the trusted document navigates', async () => {
  const { registerPinnedToolbarAllSitesAccess } = await import('./service');
  browserTabsGetMock.mockResolvedValue({ id: 7, url: 'https://other.test/path' });

  await expect(
    registerPinnedToolbarAllSitesAccess({
      commit: async () => true,
      expectedUrl: 'https://example.test/path',
      isCurrent: () => true,
      tabId: 7,
    })
  ).resolves.toBe('superseded');

  expect(browserScriptingRegisterContentScriptsMock).not.toHaveBeenCalled();
  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
});

it('does not resolve or register pinned runtime access after its operation is superseded', async () => {
  const { registerPinnedToolbarAllSitesAccess } = await import('./service');

  await expect(
    registerPinnedToolbarAllSitesAccess({
      commit: async () => true,
      expectedUrl: 'https://example.test/path',
      isCurrent: () => false,
      tabId: 7,
    })
  ).resolves.toBe('superseded');

  expect(browserTabsGetMock).not.toHaveBeenCalled();
  expect(browserScriptingRegisterContentScriptsMock).not.toHaveBeenCalled();
});

it('registers future pinned runtime access only for the still-current trusted document', async () => {
  const { registerPinnedToolbarAllSitesAccess } = await import('./service');

  await expect(
    registerPinnedToolbarAllSitesAccess({
      commit: async () => true,
      expectedUrl: 'https://example.test/path',
      isCurrent: () => true,
      tabId: 7,
    })
  ).resolves.toBe('registered');

  expect(browserTabsGetMock).toHaveBeenCalledWith(7);
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledOnce();
  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
});

it('rolls back a newly created pinned registration when invalidated during browser registration', async () => {
  const { registerPinnedToolbarAllSitesAccess } = await import('./service');
  const registration = createDeferred<void>();
  let current = true;
  const commit = vi.fn(async () => true);
  browserScriptingRegisterContentScriptsMock.mockReturnValueOnce(registration.promise);

  const result = registerPinnedToolbarAllSitesAccess({
    commit,
    expectedUrl: 'https://example.test/path',
    isCurrent: () => current,
    tabId: 7,
  });
  await vi.waitFor(() => {
    expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledOnce();
  });

  current = false;
  registration.resolve(undefined);

  await expect(result).resolves.toBe('superseded');
  expect(commit).not.toHaveBeenCalled();
  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-all-sites'],
  });
});

it('rolls back just-granted all-sites permission when content script registration fails', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserScriptingRegisterContentScriptsMock.mockRejectedValueOnce(new Error('register failed'));

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.GRANT_ALL_SITES))
  ).rejects.toThrow('register failed');

  expect(browserPermissionsContainsMock).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
  expect(browserPermissionsRequestMock).toHaveBeenCalledWith({
    origins: ['<all_urls>'],
  });
  expect(browserPermissionsRemoveMock).toHaveBeenCalledWith({
    origins: ['<all_urls>'],
  });
});

it('does not roll back all-sites permission when it already existed before failure', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserPermissionsContainsMock.mockResolvedValue(true);
  browserScriptingRegisterContentScriptsMock.mockRejectedValueOnce(new Error('register failed'));

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.GRANT_ALL_SITES))
  ).rejects.toThrow('register failed');

  expect(browserPermissionsRemoveMock).not.toHaveBeenCalled();
});

it('rolls back just-granted all-sites permission when current-tab injection fails', async () => {
  const { handlePageAccessMessage } = await import('./service');
  sendTabMessageMock.mockRejectedValue(new Error('runtime unavailable'));
  browserScriptingExecuteScriptMock.mockRejectedValueOnce(new Error('inject failed'));

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.GRANT_ALL_SITES))
  ).rejects.toThrow('inject failed');

  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledOnce();
  expect(browserPermissionsRemoveMock).toHaveBeenCalledWith({
    origins: ['<all_urls>'],
  });
});

it('registers all-sites access without injection when the current tab is unsupported', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserTabsGetMock.mockResolvedValue({ id: 7, url: 'chrome://extensions' });

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.GRANT_ALL_SITES))
  ).resolves.toEqual(expect.objectContaining({ result: 'granted', success: true }));

  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledWith([
    expect.objectContaining({
      allFrames: false,
      id: 'sniptale-page-access-all-sites',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['http://*/*', 'https://*/*'],
    }),
  ]);
  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
});

it('registers already-granted all-sites access without requesting permissions again', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserPermissionsContainsMock.mockResolvedValue(true);

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.REGISTER_GRANTED_ALL_SITES))
  ).resolves.toEqual(expect.objectContaining({ result: 'registered', success: true }));

  expect(browserPermissionsRequestMock).not.toHaveBeenCalled();
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledWith([
    expect.objectContaining({
      allFrames: false,
      id: 'sniptale-page-access-all-sites',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['http://*/*', 'https://*/*'],
    }),
  ]);
  expect(sendTabMessageMock).toHaveBeenCalledOnce();
  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
});

it('replaces stale all-sites registrations even when origin matches are current', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserPermissionsContainsMock.mockResolvedValue(true);
  browserScriptingGetRegisteredContentScriptsMock.mockResolvedValue([
    {
      allFrames: true,
      id: 'sniptale-page-access-all-sites',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['http://*/*', 'https://*/*'],
      persistAcrossSessions: true,
      runAt: 'document_idle',
    },
  ]);

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.REGISTER_GRANTED_ALL_SITES))
  ).resolves.toEqual(expect.objectContaining({ result: 'registered', success: true }));

  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-all-sites'],
  });
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledOnce();
});

it('registers already-granted all-sites access without injecting when no tab id is supplied', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserPermissionsContainsMock.mockResolvedValue(true);

  await expect(
    handlePageAccessMessage({
      operation: PageAccessOperation.REGISTER_GRANTED_ALL_SITES,
      type: MessageType.PAGE_ACCESS,
    })
  ).resolves.toEqual(expect.objectContaining({ result: 'registered', success: true }));

  expect(browserPermissionsRequestMock).not.toHaveBeenCalled();
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledWith([
    expect.objectContaining({
      allFrames: false,
      id: 'sniptale-page-access-all-sites',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['http://*/*', 'https://*/*'],
    }),
  ]);
  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
});

it('refuses to register all-sites access when the optional permission is missing', async () => {
  const { handlePageAccessMessage } = await import('./service');

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.REGISTER_GRANTED_ALL_SITES))
  ).resolves.toEqual(expect.objectContaining({ result: 'permission-denied', success: false }));

  expect(browserPermissionsRequestMock).not.toHaveBeenCalled();
  expect(browserScriptingRegisterContentScriptsMock).not.toHaveBeenCalled();
});
