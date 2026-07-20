import { expect, it } from 'vitest';

import {
  browserPermissionsContainsMock,
  browserPermissionsGetAllMock,
  browserScriptingRegisterContentScriptsMock,
  browserScriptingUnregisterContentScriptsMock,
} from './service.test-support';

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
    'https://example.test/path',
  ]);

  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-all-sites'],
  });
  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledWith({
    ids: ['sniptale-page-access-site-aHR0cHM6Ly9leGFtcGxlLnRlc3Q'],
  });
  expect(browserScriptingUnregisterContentScriptsMock).toHaveBeenCalledTimes(2);
});

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
