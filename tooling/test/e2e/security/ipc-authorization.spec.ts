import { test, expect, resolveExtensionServiceWorkerUrl } from '../support/extension-fixture';
import { collectRetentionText, openSecurityControl } from '../support/security-helpers';
import {
  grantAllSitesAccessFromSettings,
  issuePopupTabRouteCapability,
  openRealExtensionPage,
  POPUP_PATH,
  revokeAllSitesAccessFromSettings,
  sendRuntimeMessage,
  SETTINGS_PATH,
} from './support';

test('unauthorized and malformed runtime messages fail without privileged side effects', async ({
  context,
  extensionId,
}) => {
  const harness = await openSecurityControl(context, extensionId);
  await harness.evaluate(() => chrome.storage.local.set({ security_ipc_sentinel: 'retained' }));

  const unauthorized = await sendRuntimeMessage(harness, {
    includeAiProviderSecrets: true,
    preservePreferences: false,
    type: 'ERASE_LOCAL_EXTENSION_DATA',
  });
  expect(unauthorized).toMatchObject({ success: false });

  for (const payload of [
    null,
    { type: 'UNKNOWN_SECURITY_ROUTE' },
    { payload: 'x'.repeat(512_000) },
  ]) {
    await sendRuntimeMessage(harness, payload);
  }

  await expect(
    harness.evaluate(() => chrome.storage.local.get('security_ipc_sentinel'))
  ).resolves.toEqual({ security_ipc_sentinel: 'retained' });
  await expect(resolveExtensionServiceWorkerUrl(context)).resolves.toContain(extensionId);
  await harness.evaluate(() => chrome.storage.local.remove('security_ipc_sentinel'));
  await harness.close();
});

test('web pages and subframes cannot impersonate an extension runtime sender', async ({
  context,
  extensionId,
  hostOrigin,
  page,
}) => {
  const settings = await openRealExtensionPage(
    context,
    extensionId,
    `${SETTINGS_PATH}?section=access-data`
  );
  await grantAllSitesAccessFromSettings(settings);
  await page.goto(`${hostOrigin}/fixtures/host-frame.html`);
  const authorities = await page.evaluate(() => ({
    top: typeof globalThis.chrome?.runtime?.sendMessage,
    frames: Array.from(document.querySelectorAll('iframe')).map((frame) => {
      try {
        return typeof frame.contentWindow?.chrome?.runtime?.sendMessage;
      } catch {
        return 'cross-origin-denied';
      }
    }),
  }));
  expect(authorities.top).toBe('undefined');
  expect(authorities.frames.every((authority) => authority !== 'function')).toBe(true);

  await page.goto(`${hostOrigin}/fixtures/host-page.html?frame-authority=1`);
  const tabId = await settings.evaluate(async (targetUrl) => {
    const target = (await chrome.tabs.query({})).find((tab) => tab.url === targetUrl);
    if (target?.id === undefined) throw new Error('Frame authority target tab is unavailable');
    return target.id;
  }, page.url());
  const results = await settings.evaluate(async (targetTabId) => {
    return chrome.scripting.executeScript({
      target: { allFrames: true, tabId: targetTabId },
      func: async () =>
        new Promise<{ accepted: boolean }>((resolve) => {
          const port = chrome.runtime.connect({ name: 'sniptale:voice-input:v1' });
          let settled = false;
          port.onDisconnect.addListener(() => {
            if (settled) return;
            settled = true;
            resolve({ accepted: false });
          });
          setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve({ accepted: true });
            port.disconnect();
          }, 300);
        }),
    });
  }, tabId);
  const top = results.find((result) => result.frameId === 0);
  const subframe = results.find((result) => result.frameId !== 0);
  expect(top).toMatchObject({
    documentId: expect.any(String),
    frameId: 0,
    result: { accepted: true },
  });
  expect(subframe).toMatchObject({
    documentId: expect.any(String),
    result: { accepted: false },
  });
  expect(subframe?.frameId).not.toBe(0);

  await revokeAllSitesAccessFromSettings(settings);
  await settings.close();
});

test('popup capability rejects replay, cross-tab reuse, and use after navigation', async ({
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
  const popup = await openRealExtensionPage(context, extensionId, POPUP_PATH);
  const owner = await context.newPage();
  const stranger = await context.newPage();
  await owner.goto(`${hostOrigin}/fixtures/host-page.html?owner=1`);
  await stranger.goto(`${hostOrigin}/fixtures/host-page.html?stranger=1`);
  const [ownerTabId, strangerTabId] = await popup.evaluate(
    async (urls) => {
      const tabs = await chrome.tabs.query({});
      return urls.map((url) => {
        const tabId = tabs.find((candidate) => candidate.url === url)?.id;
        if (tabId === undefined) throw new Error(`Security target tab is unavailable: ${url}`);
        return tabId;
      });
    },
    [owner.url(), stranger.url()]
  );
  if (ownerTabId === undefined || strangerTabId === undefined) {
    throw new Error('Security target tab ids are unavailable');
  }
  const initialPersistence = await collectRetentionText(popup);

  const crossTabRequestId = 'security-cross-tab';
  const crossTabToken = await issuePopupTabRouteCapability({
    operation: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT',
    popup,
    requestId: crossTabRequestId,
    tabId: ownerTabId,
  });
  const crossTab = await sendRuntimeMessage(popup, {
    requestId: crossTabRequestId,
    tabId: strangerTabId,
    tabRouteCapabilityToken: crossTabToken,
    tabRouteRequestId: crossTabRequestId,
    type: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT',
  });
  expect(crossTab).toMatchObject({ success: false });
  const consumedAfterMismatch = await sendRuntimeMessage(popup, {
    requestId: crossTabRequestId,
    tabId: ownerTabId,
    tabRouteCapabilityToken: crossTabToken,
    tabRouteRequestId: crossTabRequestId,
    type: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT',
  });
  expect(consumedAfterMismatch).toMatchObject({ success: false });
  expect(await collectRetentionText(popup)).toBe(initialPersistence);

  const replayRequestId = 'security-replay';
  const replayToken = await issuePopupTabRouteCapability({
    operation: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT',
    popup,
    requestId: replayRequestId,
    tabId: ownerTabId,
  });
  const replayPayload = {
    requestId: replayRequestId,
    tabId: ownerTabId,
    tabRouteCapabilityToken: replayToken,
    tabRouteRequestId: replayRequestId,
    type: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT',
  };
  expect(await sendRuntimeMessage(popup, replayPayload)).toMatchObject({ success: true });
  const afterFirstUse = await collectRetentionText(popup);
  expect(await sendRuntimeMessage(popup, replayPayload)).toMatchObject({ success: false });
  expect(await collectRetentionText(popup)).toBe(afterFirstUse);

  const navigationRequestId = 'security-navigation';
  const navigationToken = await issuePopupTabRouteCapability({
    operation: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT',
    popup,
    requestId: navigationRequestId,
    tabId: ownerTabId,
  });
  await owner.goto(`${hostOrigin}/fixtures/host-page.html?navigated=1`);
  const afterNavigation = await sendRuntimeMessage(popup, {
    requestId: navigationRequestId,
    tabId: ownerTabId,
    tabRouteCapabilityToken: navigationToken,
    tabRouteRequestId: navigationRequestId,
    type: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT',
  });
  expect(afterNavigation).toMatchObject({ success: false });

  await revokeAllSitesAccessFromSettings(settings);
  await owner.close();
  await stranger.close();
  await popup.close();
  await settings.close();
});
