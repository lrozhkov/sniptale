import {
  test,
  expect,
  resolveExtensionServiceWorkerUrl,
  terminateExtensionServiceWorker,
} from '../support/extension-fixture';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import {
  collectRetentionText,
  openSecurityControl,
  restartExtensionServiceWorker,
} from '../support/security-helpers';
import {
  grantAllSitesAccessFromSettings,
  issuePopupTabRouteCapability,
  openRealExtensionPage,
  POPUP_PATH,
  revokeAllSitesAccessFromSettings,
  saveWebSnapshotThroughPopup,
  sendRuntimeMessage,
  SETTINGS_PATH,
} from './support';

async function sendFromOwnedContent(
  extensionPage: import('@playwright/test').Page,
  tabId: number,
  message: Record<string, unknown>
): Promise<unknown> {
  const [injection] = await extensionPage.evaluate(
    async ({ payload, targetTabId }) =>
      chrome.scripting.executeScript({
        target: { frameIds: [0], tabId: targetTabId },
        func: async (runtimePayload) =>
          chrome.runtime.sendMessage({
            ...runtimePayload,
            __sniptaleRuntimeFreshness: {
              issuedAtEpochMs: Date.now(),
              nonce: crypto.randomUUID(),
            },
          }),
        args: [payload],
      }),
    { payload: message, targetTabId: tabId }
  );
  return injection?.result;
}

test('owning Port and worker-local control authority disappear on disconnect and restart', async ({
  context,
  extensionId,
}) => {
  const settings = await openRealExtensionPage(context, extensionId, SETTINGS_PATH);
  const stranger = await openRealExtensionPage(context, extensionId, SETTINGS_PATH);
  for (const page of [settings, stranger]) {
    await page.evaluate(() => {
      const port = chrome.runtime.connect({ name: 'sniptale:voice-input:v1' });
      const messages: unknown[] = [];
      port.onMessage.addListener((message) => messages.push(message));
      Object.assign(window, { securityVoiceMessages: messages, securityVoicePort: port });
    });
  }
  await settings.evaluate(() => {
    const port = (window as typeof window & { securityVoicePort: chrome.runtime.Port })
      .securityVoicePort;
    port.postMessage({
      preferences: { language: 'en-US', microphoneDeviceId: null, mode: 'local-first' },
      requestId: 'security-owner-start',
      sessionId: 'security-owner-session',
      type: 'VOICE_INPUT_START',
    });
  });
  await stranger.evaluate(() => {
    const port = (window as typeof window & { securityVoicePort: chrome.runtime.Port })
      .securityVoicePort;
    port.postMessage({
      preferences: { language: 'en-US', microphoneDeviceId: null, mode: 'local-first' },
      requestId: 'security-stranger-start',
      sessionId: 'security-stranger-session',
      type: 'VOICE_INPUT_START',
    });
  });
  await expect
    .poll(() =>
      stranger.evaluate(() =>
        JSON.stringify(
          (window as typeof window & { securityVoiceMessages: unknown[] }).securityVoiceMessages
        )
      )
    )
    .toContain('busy-speech');
  await settings.evaluate(() =>
    (
      window as typeof window & { securityVoicePort: chrome.runtime.Port }
    ).securityVoicePort.disconnect()
  );
  await new Promise((resolve) => setTimeout(resolve, 1_250));
  await stranger.evaluate(() => {
    const state = window as typeof window & {
      securityVoiceMessages: unknown[];
      securityVoicePort: chrome.runtime.Port;
    };
    state.securityVoiceMessages.length = 0;
    state.securityVoicePort.postMessage({
      preferences: { language: 'en-US', microphoneDeviceId: null, mode: 'local-first' },
      requestId: 'security-successor-start',
      sessionId: 'security-successor-session',
      type: 'VOICE_INPUT_START',
    });
  });
  await expect
    .poll(() =>
      stranger.evaluate(() =>
        JSON.stringify(
          (window as typeof window & { securityVoiceMessages: unknown[] }).securityVoiceMessages
        )
      )
    )
    .not.toContain('busy-speech');
  await expect
    .poll(() =>
      stranger.evaluate(
        () =>
          (window as typeof window & { securityVoiceMessages: unknown[] }).securityVoiceMessages
            .length
      )
    )
    .toBeGreaterThan(0);
  expect(
    await stranger.evaluate(() =>
      JSON.stringify(
        (window as typeof window & { securityVoiceMessages: unknown[] }).securityVoiceMessages
      )
    )
  ).not.toContain('security-owner-session');

  const control = await openSecurityControl(context, extensionId);
  await control.evaluate(() => window.securityE2EControl?.pause('persistence-before-commit'));
  await restartExtensionServiceWorker(context, settings);
  await expect
    .poll(() => control.evaluate(() => window.securityE2EControl?.disconnected))
    .toBe(true);

  const nextControl = await openSecurityControl(context, extensionId);
  const snapshot = await nextControl.evaluate(() => window.securityE2EControl?.snapshot());
  expect(snapshot).toMatchObject({ ok: true, paused: [] });
  await nextControl.close();
  await stranger.close();
  await settings.close();
});

test('worker termination drops admitted tab authority before any side effect', async ({
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
  await target.goto(`${hostOrigin}/fixtures/host-page.html?worker-authority=1`);
  const popup = await openRealExtensionPage(context, extensionId, POPUP_PATH);
  const tabId = await popup.evaluate(async (targetUrl) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === targetUrl);
    if (tab?.id === undefined) throw new Error('Worker authority target tab is unavailable');
    return tab.id;
  }, target.url());
  const baseline = await collectRetentionText(popup);
  const requestId = 'security-worker-restart-stale-capability';
  const staleToken = await issuePopupTabRouteCapability({
    operation: 'EXPORT_POPUP_PREVIEW',
    popup,
    requestId,
    tabId,
  });

  await terminateExtensionServiceWorker(context);
  expect(
    await sendRuntimeMessage(popup, {
      tabId,
      tabRouteCapabilityToken: staleToken,
      tabRouteRequestId: requestId,
      type: 'EXPORT_POPUP_PREVIEW',
    })
  ).toMatchObject({ success: false });
  expect(await collectRetentionText(popup)).toBe(baseline);
  await expect(resolveExtensionServiceWorkerUrl(context)).resolves.toContain(extensionId);

  expect(
    await saveWebSnapshotThroughPopup({
      popup,
      requestId: 'security-worker-restart-fresh-capability',
      tabId,
    })
  ).toMatchObject({ success: true });

  await revokeAllSitesAccessFromSettings(settings);
  await popup.close();
  await target.close();
  await settings.close();
});

test('scenario session reconstructs once while stale content authority remains fail-closed', async ({
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
  await target.goto(`${hostOrigin}/fixtures/host-page.html?scenario-worker-restart=1`);
  const popup = await openRealExtensionPage(context, extensionId, POPUP_PATH);
  const tabId = await popup.evaluate(async (targetUrl) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === targetUrl);
    if (tab?.id === undefined) throw new Error('Scenario lifecycle target tab is unavailable');
    return tab.id;
  }, target.url());

  expect(
    await sendFromOwnedContent(popup, tabId, {
      captureMode: 'by-click',
      type: 'SCENARIO_SET_CAPTURE_MODE',
    })
  ).toMatchObject({ success: true });
  expect(
    await sendFromOwnedContent(popup, tabId, {
      enabled: true,
      type: 'SCENARIO_SET_ENABLED',
    })
  ).toMatchObject({ success: true });
  const persistedBeforeRestart = await popup.evaluate(() =>
    chrome.storage.session.get('scenario-tab-sessions')
  );

  await terminateExtensionServiceWorker(context);
  expect(
    await sendRuntimeMessage(popup, {
      enabled: false,
      tabId,
      type: 'SCENARIO_SET_ENABLED',
    })
  ).toMatchObject({ success: false });
  const restored = await sendFromOwnedContent(popup, tabId, { type: 'SCENARIO_GET_SESSION' });
  expect(restored).toMatchObject({
    session: { captureMode: 'by-click', enabled: true },
    success: true,
  });
  expect(await popup.evaluate(() => chrome.storage.session.get('scenario-tab-sessions'))).toEqual(
    persistedBeforeRestart
  );

  await revokeAllSitesAccessFromSettings(settings);
  await popup.close();
  await target.close();
  await settings.close();
});

test('a full persistent-profile Chromium restart relocks secrets and drops memory authority', async () => {
  const apiKey = 'sk-security-profile-restart-canary';
  const passphrase = 'security-profile-restart-passphrase';
  let launched = await launchExtensionBrowser();
  const userDataDir = launched.userDataDir;
  try {
    const { extensionId } = launched;
    const settings = await openRealExtensionPage(launched.context, extensionId, SETTINGS_PATH);
    expect(
      await sendRuntimeMessage(settings, {
        operation: 'add-provider',
        provider: {
          apiKey,
          baseUrl: 'https://example.test/v1',
          connectionType: 'openai-compatible',
          createdAt: Date.now(),
          id: '0f9b9bd1-1ff2-4b85-bbee-73b99ce30ec2',
          name: 'Profile restart provider',
        },
        type: 'AI_SETTINGS_MUTATION',
      })
    ).toMatchObject({ success: true });
    expect(
      await sendRuntimeMessage(settings, {
        operation: 'enable-secret-passphrase-protection',
        passphrase,
        type: 'AI_SETTINGS_MUTATION',
      })
    ).toMatchObject({ success: true });
    const popup = await openRealExtensionPage(launched.context, extensionId, POPUP_PATH);
    const [targetTab] = await popup.evaluate(() =>
      chrome.tabs.query({ active: true, currentWindow: true })
    );
    if (targetTab?.id === undefined) throw new Error('Profile restart target tab is unavailable');
    const requestId = 'security-profile-restart-capability';
    const staleToken = await issuePopupTabRouteCapability({
      operation: 'CONSUME_POPUP_EXPORT_LAUNCH_INTENT',
      popup,
      requestId,
      tabId: targetTab.id,
    });
    await settings.close();
    await popup.close();
    await closeExtensionBrowser(launched);

    launched = await launchExtensionBrowser({ userDataDir });
    const restartedExtensionId = launched.extensionId;
    expect(restartedExtensionId).toBe(extensionId);
    const restartedSettings = await openRealExtensionPage(
      launched.context,
      restartedExtensionId,
      SETTINGS_PATH
    );
    expect(
      await sendRuntimeMessage(restartedSettings, {
        operation: 'read-secret-protection-status',
        type: 'AI_SETTINGS_MUTATION',
      })
    ).toMatchObject({
      secretProtectionStatus: { isEnabled: true, isUnlocked: false, mode: 'passphrase' },
      success: true,
    });
    expect(await collectRetentionText(restartedSettings)).not.toContain(apiKey);
    expect(await collectRetentionText(restartedSettings)).not.toContain(passphrase);
    const restartedPopup = await openRealExtensionPage(
      launched.context,
      restartedExtensionId,
      POPUP_PATH
    );
    expect(
      await sendRuntimeMessage(restartedPopup, {
        tabId: targetTab.id,
        tabRouteCapabilityToken: staleToken,
        tabRouteRequestId: requestId,
        type: 'CONSUME_POPUP_EXPORT_LAUNCH_INTENT',
      })
    ).toMatchObject({ success: false });
    await restartedPopup.close();
    await restartedSettings.close();
  } finally {
    await closeExtensionBrowser(launched, { removeUserDataDir: true });
  }
});
