import { expect, it } from 'vitest';

import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';
import {
  browserPermissionsContainsMock,
  browserPermissionsRemoveMock,
  browserPermissionsRequestMock,
  browserScriptingExecuteScriptMock,
  browserScriptingGetRegisteredContentScriptsMock,
  browserScriptingRegisterContentScriptsMock,
  browserScriptingUnregisterContentScriptsMock,
  createMessage,
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
  expect(browserScriptingExecuteScriptMock).toHaveBeenCalledOnce();
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
