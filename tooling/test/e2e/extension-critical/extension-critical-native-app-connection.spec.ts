import { expect, test } from '../support/extension-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';

// This spec operates the Settings UI with a controlled native runtime response.
// Desktop e2e-lab owns the real host, browser selection, file transfer, and restart proof.
for (const locale of ['ru', 'en'] as const) {
  for (const width of [1024, 1279, 1280, 1281, 1920]) {
    test(`Desktop connection consent ${locale} ${width}`, async ({ page, extensionId }, info) => {
      await page.setViewportSize({ width, height: width === 1920 ? 900 : 560 });
      await page.addInitScript(() => {
        let connectionState = 'trust-required';
        let error: { code: string; message: string; recoverable: boolean } | null = null;
        const snapshot = () => ({
          appIdentity: { clientId: 'a'.repeat(64), trustVersion: 1 },
          appStatus: null,
          capabilities: null,
          connectionState,
          controllerLease: null,
          effectiveSettings: null,
          error,
          hostName: 'com.sniptale.native_host',
          install: null,
          lastHeartbeatAt: null,
          lastOperationError: null,
          platform: null,
          settingsRevision: null,
          trayActions: null,
          warnings: [],
        });
        const send = chrome.runtime.sendMessage.bind(chrome.runtime);
        Object.defineProperty(chrome.runtime, 'sendMessage', {
          value: (message: unknown, callback?: (value: unknown) => void) => {
            if (
              typeof message === 'object' &&
              message !== null &&
              'type' in message &&
              (message.type === 'NATIVE_APP_QUERY' || message.type === 'NATIVE_APP_MUTATION')
            ) {
              if ('operation' in message) {
                if (
                  message.operation === 'trust-client' &&
                  'clientId' in message &&
                  message.clientId === 'a'.repeat(64)
                )
                  connectionState = 'connected';
                if (message.operation === 'forget-client') connectionState = 'trust-required';
                if (message.operation === 'reconnect') {
                  connectionState = 'error';
                  error = {
                    code: 'unknown',
                    message: 'Native app handshake timed out',
                    recoverable: true,
                  };
                }
              }
              const response = { success: true, status: snapshot() };
              callback?.(response);
              return Promise.resolve(response);
            }
            return callback ? send(message, callback) : send(message);
          },
        });
        const contains = chrome.permissions.contains.bind(chrome.permissions);
        Object.defineProperty(chrome.permissions, 'contains', {
          value: (
            permissions: chrome.permissions.Permissions,
            callback?: (value: boolean) => void
          ) => {
            if (permissions.permissions?.includes('nativeMessaging')) {
              callback?.(true);
              return Promise.resolve(true);
            }
            return callback ? contains(permissions, callback) : contains(permissions);
          },
        });
      });
      const url = `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=native-app&view=capture`;
      await page.goto(url);
      await page.evaluate(async (selectedLocale) => {
        localStorage.setItem('sniptale-locale-preference', selectedLocale);
        await chrome.storage.local.set({
          'sniptale-locale-preference': selectedLocale,
          'sniptale-theme-preference': 'light',
        });
      }, locale);
      await page.reload();
      const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
      const trust = page.getByRole('button', {
        name: t('settings.nativeApp.trustClient'),
        exact: true,
      });
      await expect(trust).toBeVisible();
      await expect(page).toHaveURL(/view=connection/);
      await expect(page.getByText('a'.repeat(64), { exact: true })).toBeVisible();
      const content = page.locator('[data-ui="settings.page.content-scroll"]');
      await expect(content.getByRole('switch')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: t('settings.nativeApp.syncSettings'), exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByText(t('settings.nativeApp.desktopSettingsOnly'), { exact: true })
      ).toBeVisible();
      if (width === 1280 || width === 1920) {
        await page.screenshot({ path: info.outputPath('trust-required.png'), fullPage: false });
      }
      await trust.focus();
      await page.keyboard.press('Enter');
      const forget = page.getByRole('button', {
        name: t('settings.nativeApp.forgetClient'),
        exact: true,
      });
      await expect(forget).toBeVisible();
      await forget.click();
      await expect(trust).toBeVisible();
      await page
        .getByRole('button', { name: t('settings.nativeApp.reconnect'), exact: true })
        .click();
      await expect(
        page.getByText(t('settings.nativeApp.handshakeTimeout'), { exact: true })
      ).toBeVisible();
      const recovery = page.getByRole('button', {
        name: t('settings.nativeApp.reconnect'),
        exact: true,
      });
      await recovery.scrollIntoViewIfNeeded();
      await expect(recovery).toBeInViewport({ ratio: 1 });
      if (width >= 1280) {
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(1);
      }
      if (width === 1280 || width === 1920) {
        await page.screenshot({ path: info.outputPath('connection-timeout.png'), fullPage: false });
      }
    });
  }
}
