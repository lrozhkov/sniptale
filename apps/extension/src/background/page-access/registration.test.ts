import { expect, it } from 'vitest';

import {
  browserPermissionsContainsMock,
  browserPermissionsGetAllMock,
  browserPermissionsIsFileSchemeAccessAllowedMock,
  browserScriptingGetRegisteredContentScriptsMock,
  browserScriptingRegisterContentScriptsMock,
  browserScriptingUnregisterContentScriptsMock,
  localFileAccessOptInMock,
} from './service.test-support';

const staleRegistration: chrome.scripting.RegisteredContentScript = {
  allFrames: true,
  id: 'sniptale-page-access-all-sites',
  js: ['assets/contentRuntimeShim.js'],
  matches: ['http://*/*', 'https://*/*'],
  persistAcrossSessions: true,
  runAt: 'document_idle',
};

it('does not re-check site permission when all-sites access already covers the tab', async () => {
  const { hasSitePermission } = await import('./registration');

  await expect(hasSitePermission(new URL('https://example.test/path'), true)).resolves.toBe(true);

  expect(browserPermissionsContainsMock).not.toHaveBeenCalled();
});

it('returns only missing origins when checking granted origin permissions', async () => {
  const { getMissingOriginPermissions } = await import('./registration');
  browserPermissionsContainsMock.mockImplementation(
    async (query: { origins?: string[] }) => query.origins?.[0] === 'https://granted.test/*'
  );

  await expect(
    getMissingOriginPermissions(['https://granted.test/*', 'https://missing.test/*'])
  ).resolves.toEqual(['https://missing.test/*']);
});

it('does not treat legacy split all-sites grants as current all-sites capture authority', async () => {
  const { hasAllSitesPermission } = await import('./registration');
  browserPermissionsContainsMock.mockImplementation(
    async (query: { origins?: string[] }) => query.origins?.[0] !== '<all_urls>'
  );

  await expect(hasAllSitesPermission()).resolves.toBe(false);

  expect(browserPermissionsContainsMock).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
});

it('unregisters all-sites and supported site content scripts for removed permissions', async () => {
  const { unregisterRemovedContentScripts } = await import('./registration');

  await unregisterRemovedContentScripts([
    '<all_urls>',
    'https://example.test/*',
    'chrome://extensions/*',
    'file:///',
    'https://example.test/path',
  ]);

  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-all-sites'],
  });
  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-site-aHR0cHM6Ly9leGFtcGxlLnRlc3Q'],
  });
  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-file-scheme'],
  });
  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledTimes(3);
});

it('reconciles a separate local-file shim only when effective browser access is enabled', async () => {
  const { reconcilePersistentContentScriptRegistrations } = await import('./registration');
  browserPermissionsGetAllMock.mockResolvedValue({ origins: ['file:///'] });
  browserPermissionsContainsMock.mockImplementation(
    async (query: { origins?: string[] }) => query.origins?.[0] === 'file:///'
  );
  browserPermissionsIsFileSchemeAccessAllowedMock.mockResolvedValue(true);

  await reconcilePersistentContentScriptRegistrations();

  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledWith([
    expect.objectContaining({
      allFrames: false,
      id: 'sniptale-page-access-file-scheme',
      matches: ['file:///'],
    }),
  ]);
});

it('does not infer local-file opt-in from all-sites access and the Chrome switch', async () => {
  const { reconcilePersistentContentScriptRegistrations } = await import('./registration');
  browserPermissionsGetAllMock.mockResolvedValue({ origins: ['<all_urls>'] });
  browserPermissionsContainsMock.mockResolvedValue(true);
  browserPermissionsIsFileSchemeAccessAllowedMock.mockResolvedValue(true);
  localFileAccessOptInMock.mockResolvedValue(false);

  await reconcilePersistentContentScriptRegistrations();

  expect(browserScriptingRegisterContentScriptsMock).not.toHaveBeenCalledWith([
    expect.objectContaining({ id: 'sniptale-page-access-file-scheme' }),
  ]);
});

it('serializes authority reads so the latest file reconciliation owns final registration', async () => {
  const { reconcileFileSchemeContentScriptRegistration } = await import('./registration');
  const firstOptIn = createDeferred<boolean>();
  localFileAccessOptInMock.mockReturnValueOnce(firstOptIn.promise).mockResolvedValueOnce(true);
  browserPermissionsContainsMock.mockResolvedValue(true);
  browserPermissionsIsFileSchemeAccessAllowedMock.mockResolvedValue(true);
  browserScriptingGetRegisteredContentScriptsMock
    .mockResolvedValueOnce([{ id: 'sniptale-page-access-file-scheme' }])
    .mockResolvedValueOnce([]);

  const disable = reconcileFileSchemeContentScriptRegistration();
  const enable = reconcileFileSchemeContentScriptRegistration();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(localFileAccessOptInMock).toHaveBeenCalledOnce();

  firstOptIn.resolve(false);
  await Promise.all([disable, enable]);

  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-file-scheme'],
  });
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'sniptale-page-access-file-scheme' }),
  ]);
  expect(browserScriptingUnregisterContentScriptsMock.mock.invocationCallOrder[0]).toBeLessThan(
    browserScriptingRegisterContentScriptsMock.mock.invocationCallOrder[0]!
  );
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

it('reconciles persistent shim registrations from existing host permissions', async () => {
  const { reconcilePersistentContentScriptRegistrations } = await import('./registration');
  browserPermissionsGetAllMock.mockResolvedValue({
    origins: ['<all_urls>', 'https://example.test/*', 'chrome://extensions/*'],
  });

  await reconcilePersistentContentScriptRegistrations();

  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledWith([
    expect.objectContaining({
      allFrames: false,
      id: 'sniptale-page-access-all-sites',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['http://*/*', 'https://*/*'],
    }),
  ]);
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledWith([
    expect.objectContaining({
      allFrames: false,
      id: 'sniptale-page-access-site-aHR0cHM6Ly9leGFtcGxlLnRlc3Q',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['https://example.test/*'],
    }),
  ]);
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledTimes(2);
});

it('does not register all-sites shim from partial wildcard grants during reconciliation', async () => {
  const { reconcilePersistentContentScriptRegistrations } = await import('./registration');
  browserPermissionsGetAllMock.mockResolvedValue({
    origins: ['http://*/*', 'https://example.test/*'],
  });

  await reconcilePersistentContentScriptRegistrations();

  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledWith([
    expect.objectContaining({
      id: 'sniptale-page-access-site-aHR0cHM6Ly9leGFtcGxlLnRlc3Q',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['https://example.test/*'],
    }),
  ]);
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledTimes(1);
});

it('reconciles persistent shim registration from legacy split all-sites host permissions', async () => {
  const { reconcilePersistentContentScriptRegistrations } = await import('./registration');
  browserPermissionsGetAllMock.mockResolvedValue({
    origins: ['http://*/*', 'https://*/*'],
  });

  await reconcilePersistentContentScriptRegistrations();

  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledWith([
    expect.objectContaining({
      allFrames: false,
      id: 'sniptale-page-access-all-sites',
      js: ['assets/contentRuntimeShim.js'],
      matches: ['http://*/*', 'https://*/*'],
    }),
  ]);
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenCalledTimes(1);
});

it('restores a replaced registration when the owning transaction is superseded', async () => {
  const { commitContentScriptRegistration } = await import('./registration');
  browserScriptingGetRegisteredContentScriptsMock.mockResolvedValueOnce([staleRegistration]);

  await expect(
    commitContentScriptRegistration({
      commit: async () => false,
      id: 'sniptale-page-access-all-sites',
      matches: ['http://*/*', 'https://*/*'],
    })
  ).resolves.toBe(false);

  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledTimes(2);
  expect(browserScriptingRegisterContentScriptsMock).toHaveBeenNthCalledWith(2, [
    staleRegistration,
  ]);
});

it('preserves an already-valid registration when the owning transaction is superseded', async () => {
  const { commitContentScriptRegistration } = await import('./registration');
  browserScriptingGetRegisteredContentScriptsMock.mockResolvedValueOnce([
    { ...staleRegistration, allFrames: false },
  ]);

  await expect(
    commitContentScriptRegistration({
      commit: async () => false,
      id: 'sniptale-page-access-all-sites',
      matches: ['http://*/*', 'https://*/*'],
    })
  ).resolves.toBe(false);

  expect(browserScriptingUnregisterContentScriptsMock).not.toHaveBeenCalled();
  expect(browserScriptingRegisterContentScriptsMock).not.toHaveBeenCalled();
});
