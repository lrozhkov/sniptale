import { test, expect } from '../support/extension-fixture';
import {
  collectRetentionText,
  controlCheckpoint,
  openSecurityControl,
  restartExtensionServiceWorker,
} from '../support/security-helpers';
import {
  grantAllSitesAccessFromSettings,
  issuePopupTabRouteCapability,
  openRealExtensionPage,
  POPUP_PATH,
  revokeAllSitesAccessFromSettings,
  SETTINGS_PATH,
} from './support';

test('optional all-sites access is absent, grantable by gesture, and revoked durably', async ({
  context,
  extensionId,
}) => {
  const settings = await openRealExtensionPage(
    context,
    extensionId,
    `${SETTINGS_PATH}?section=access-data`
  );
  await expect(
    settings.evaluate(() => chrome.permissions.contains({ origins: ['<all_urls>'] }))
  ).resolves.toBe(false);

  const allSites = settings.getByRole('button', { name: /^(All sites|Все сайты)$/u });
  await expect(allSites).toBeEnabled();
  await grantAllSitesAccessFromSettings(settings);
  await expect(
    settings.evaluate(() => chrome.permissions.contains({ origins: ['<all_urls>'] }))
  ).resolves.toBe(true);
  await expect(allSites).toBeDisabled();

  await settings.getByRole('button', { name: /^(Ask per site|Спрашивать)$/u }).click();
  await expect(
    settings.evaluate(() => chrome.permissions.contains({ origins: ['<all_urls>'] }))
  ).resolves.toBe(false);
  await expect
    .poll(() =>
      settings.evaluate(async () => {
        const registrations = await chrome.scripting.getRegisteredContentScripts();
        return registrations.some((entry) => entry.matches?.includes('http://*/*'));
      })
    )
    .toBe(false);

  await restartExtensionServiceWorker(context, settings);
  await expect(
    settings.evaluate(() => chrome.permissions.contains({ origins: ['<all_urls>'] }))
  ).resolves.toBe(false);
  await settings.close();
});

test('revoking all-sites access during persistence prevents a late snapshot commit', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const settings = await openRealExtensionPage(
    context,
    extensionId,
    `${SETTINGS_PATH}?section=access-data`
  );
  await grantAllSitesAccessFromSettings(settings);
  const target = await context.newPage();
  await target.goto(`${hostOrigin}/fixtures/host-page.html?permission-race=1`);
  const popup = await openRealExtensionPage(context, extensionId, POPUP_PATH);
  const tabId = await popup.evaluate(async (targetUrl) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === targetUrl);
    if (tab?.id === undefined) throw new Error('Permission race target tab is unavailable');
    return tab.id;
  }, target.url());
  const requestId = 'security-permission-revoke-race';
  const token = await issuePopupTabRouteCapability({
    operation: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT',
    popup,
    requestId,
    tabId,
  });
  const baseline = await collectRetentionText(popup);
  const control = await openSecurityControl(context, extensionId);
  await controlCheckpoint(control, 'pause', 'persistence-before-commit');
  await popup.evaluate(
    ({ capabilityToken, requestId: routeRequestId, targetTabId }) => {
      Object.assign(window, {
        securityPermissionRace: chrome.runtime.sendMessage({
          __sniptaleRuntimeFreshness: {
            issuedAtEpochMs: Date.now(),
            nonce: crypto.randomUUID(),
          },
          requestId: routeRequestId,
          tabId: targetTabId,
          tabRouteCapabilityToken: capabilityToken,
          tabRouteRequestId: routeRequestId,
          type: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT',
        }),
      });
    },
    { capabilityToken: token, requestId, targetTabId: tabId }
  );
  const checkpointOrResult = await Promise.race([
    controlCheckpoint(control, 'waitUntilPaused', 'persistence-before-commit').then(() => ({
      kind: 'checkpoint' as const,
    })),
    popup.evaluate(async () => {
      const result = await Promise.race([
        (window as typeof window & { securityPermissionRace: Promise<unknown> })
          .securityPermissionRace,
        new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 10_000)),
      ]);
      return { kind: 'route' as const, result };
    }),
  ]);
  expect(checkpointOrResult).toEqual({ kind: 'checkpoint' });
  await revokeAllSitesAccessFromSettings(settings);
  await controlCheckpoint(control, 'release', 'persistence-before-commit');
  const result = await popup.evaluate(
    () =>
      (window as typeof window & { securityPermissionRace: Promise<unknown> })
        .securityPermissionRace
  );
  expect(result).toMatchObject({ success: false });
  expect(await collectRetentionText(popup)).toBe(baseline);
  await expect(
    settings.evaluate(async () =>
      (await chrome.scripting.getRegisteredContentScripts()).some(
        (entry) => entry.id === 'sniptale-page-access-all-sites'
      )
    )
  ).resolves.toBe(false);

  await control.close();
  await popup.close();
  await target.close();
  await settings.close();
});
