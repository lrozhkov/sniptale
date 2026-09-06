import { expect, it } from 'vitest';

import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';
import {
  browserPermissionsContainsMock,
  browserPermissionsIsFileSchemeAccessAllowedMock,
  browserPermissionsRemoveMock,
  browserPermissionsRequestMock,
  browserScriptingExecuteScriptMock,
  browserScriptingGetRegisteredContentScriptsMock,
  browserScriptingRegisterContentScriptsMock,
  browserScriptingUnregisterContentScriptsMock,
  createMessage,
  browserTabsGetMock,
  sendTabMessageMock,
} from './service.test-support';

it('does not register content scripts when an optional site grant is denied', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserPermissionsRequestMock.mockResolvedValue(false);

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.GRANT_SITE))
  ).resolves.toEqual(expect.objectContaining({ result: 'permission-denied', success: false }));

  expect(browserPermissionsRequestMock).toHaveBeenCalledWith({
    origins: ['https://example.test/*'],
  });
  expect(browserScriptingRegisterContentScriptsMock).not.toHaveBeenCalled();
  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
});

it('rolls back a just-granted site permission when registration fails', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserScriptingRegisterContentScriptsMock.mockRejectedValueOnce(new Error('register failed'));

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.GRANT_SITE))
  ).rejects.toThrow('register failed');

  expect(browserPermissionsContainsMock).toHaveBeenCalledWith({
    origins: ['https://example.test/*'],
  });
  expect(browserPermissionsRequestMock).toHaveBeenCalledWith({
    origins: ['https://example.test/*'],
  });
  expect(browserPermissionsRemoveMock).toHaveBeenCalledWith({
    origins: ['https://example.test/*'],
  });
});

it('does not roll back a site permission that was already granted before registration fails', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserPermissionsContainsMock.mockImplementation(
    async (query: { origins?: string[] }) =>
      query.origins?.includes('https://example.test/*') ?? false
  );
  browserScriptingRegisterContentScriptsMock.mockRejectedValueOnce(new Error('register failed'));

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.GRANT_SITE))
  ).rejects.toThrow('register failed');

  expect(browserPermissionsRequestMock).not.toHaveBeenCalled();
  expect(browserPermissionsRemoveMock).not.toHaveBeenCalled();
});

it('reuses matching site script registrations after granting site access', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserScriptingGetRegisteredContentScriptsMock.mockResolvedValue([
    {
      allFrames: false,
      id: 'sniptale-page-access-site-aHR0cHM6Ly9leGFtcGxlLnRlc3Q',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['https://example.test/*'],
      persistAcrossSessions: true,
      runAt: 'document_idle',
    },
  ]);

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.GRANT_SITE))
  ).resolves.toEqual(expect.objectContaining({ result: 'granted', success: true }));

  expect(browserScriptingUnregisterContentScriptsMock).not.toHaveBeenCalled();
  expect(browserScriptingRegisterContentScriptsMock).not.toHaveBeenCalled();
  expect(sendTabMessageMock).toHaveBeenCalledOnce();
  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
});

it.each([
  ['matches', { matches: ['https://old.example/*'] }],
  ['js', { js: ['assets/oldRuntime.js'] }],
  ['allFrames', { allFrames: true }],
  ['persistAcrossSessions', { persistAcrossSessions: false }],
  ['runAt', { runAt: 'document_start' }],
])('replaces stale site script registrations with stale %s', async (_field, override) => {
  const { handlePageAccessMessage } = await import('./service');
  browserScriptingGetRegisteredContentScriptsMock.mockResolvedValue([
    {
      allFrames: false,
      id: 'sniptale-page-access-site-aHR0cHM6Ly9leGFtcGxlLnRlc3Q',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['https://example.test/*'],
      persistAcrossSessions: true,
      runAt: 'document_idle',
      ...override,
    },
  ]);

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.GRANT_SITE))
  ).resolves.toEqual(expect.objectContaining({ result: 'granted', success: true }));

  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-site-aHR0cHM6Ly9leGFtcGxlLnRlc3Q'],
  });
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledOnce();
});

it('registers already-granted site access without requesting permissions again', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserPermissionsContainsMock.mockImplementation(
    async (query: { origins?: string[] }) =>
      query.origins?.includes('https://example.test/*') ?? false
  );

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.REGISTER_GRANTED_SITE))
  ).resolves.toEqual(expect.objectContaining({ result: 'registered', success: true }));

  expect(browserPermissionsRequestMock).not.toHaveBeenCalled();
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledWith([
    expect.objectContaining({
      allFrames: false,
      id: 'sniptale-page-access-site-aHR0cHM6Ly9leGFtcGxlLnRlc3Q',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['https://example.test/*'],
    }),
  ]);
});

it('registers local-file access only after both optional and browser-managed grants', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserTabsGetMock.mockResolvedValue({ id: 7, url: 'file:///Users/example/report.html' });
  browserPermissionsContainsMock.mockImplementation(
    async (query: { origins?: string[] }) => query.origins?.[0] === 'file:///'
  );
  browserPermissionsIsFileSchemeAccessAllowedMock.mockResolvedValue(true);

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.REGISTER_GRANTED_FILE_SCHEME))
  ).resolves.toEqual(expect.objectContaining({ result: 'registered', success: true }));

  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledWith([
    expect.objectContaining({
      id: 'sniptale-page-access-file-scheme',
      matches: ['file:///'],
    }),
  ]);
});

it('refuses local-file registration while Chrome file access remains disabled', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserTabsGetMock.mockResolvedValue({ id: 7, url: 'file:///Users/example/report.html' });
  browserPermissionsContainsMock.mockResolvedValue(true);
  browserPermissionsIsFileSchemeAccessAllowedMock.mockResolvedValue(false);

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.REGISTER_GRANTED_FILE_SCHEME))
  ).resolves.toEqual(expect.objectContaining({ result: 'permission-denied', success: false }));

  expect(browserScriptingRegisterContentScriptsMock).not.toHaveBeenCalled();
});

it('removes only the local-file registration when Chrome file access is disabled', async () => {
  const { handlePageAccessMessage } = await import('./service');
  browserTabsGetMock.mockResolvedValue({ id: 7, url: 'file:///Users/example/report.html' });
  browserPermissionsContainsMock.mockResolvedValue(true);
  browserPermissionsIsFileSchemeAccessAllowedMock.mockResolvedValue(false);
  browserScriptingGetRegisteredContentScriptsMock.mockResolvedValue([
    {
      id: 'sniptale-page-access-file-scheme',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['file:///'],
    },
  ]);

  await expect(
    handlePageAccessMessage(createMessage(PageAccessOperation.REGISTER_GRANTED_FILE_SCHEME))
  ).resolves.toEqual(expect.objectContaining({ result: 'permission-denied', success: false }));

  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-file-scheme'],
  });
  expect(browserScriptingUnregisterContentScriptsMock).not.toHaveBeenCalledWith({
    ids: ['sniptale-page-access-all-sites'],
  });
});
