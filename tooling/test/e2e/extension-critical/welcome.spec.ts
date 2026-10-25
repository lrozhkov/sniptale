import { expect, test } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';

test.setTimeout(120_000);
for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`first-install welcome persists setup and remains optional ${viewport.name}`, async ({}, info) => {
    const launched = await launchExtensionBrowser({
      viewport: viewport.size,
      fakeMediaDevices: true,
    });
    try {
      const { context, extensionId } = launched;
      await expect
        .poll(() => context.pages().filter((page) => page.url().includes('welcome=1')).length)
        .toBe(1);
      const page = context.pages().find((candidate) => candidate.url().includes('welcome=1'))!;
      const ui = (name: string) => page.locator(`[data-ui="${name}"]`);
      await expect(ui('settings.welcome.root')).toBeVisible();
      const read = () =>
        page.evaluate(async () => ({
          local: await chrome.storage.local.get(null),
          sync: await chrome.storage.sync.get(null),
        }));
      expect((await read()).local.sniptale_welcome_shown).toBe(true);
      await ui('welcome.language').click();
      await page.getByRole('option', { name: 'English', exact: true }).click();
      await ui('welcome.theme').click();
      await page.getByRole('option', { name: 'Dark', exact: true }).click();
      await expect.poll(async () => (await read()).local['sniptale-theme-preference']).toBe('dark');
      await page.screenshot({ path: info.outputPath('welcome-appearance.png'), fullPage: false });
      await ui('welcome.next').click();
      await ui('welcome.microphone-allow').click();
      await expect(ui('welcome.microphone').getByRole('status')).toHaveText('Access allowed');
      await ui('welcome.camera-allow').click();
      await expect(ui('welcome.camera').getByRole('status')).toHaveText('Access allowed');
      const choices = await page.evaluate(async () =>
        (await navigator.mediaDevices.enumerateDevices())
          .filter(
            (item) =>
              item.deviceId && item.deviceId !== 'default' && item.deviceId !== 'communications'
          )
          .map(({ kind, deviceId, label }) => ({ kind, deviceId, label }))
      );
      const microphone = choices.find((item) => item.kind === 'audioinput')!;
      const camera = choices.find((item) => item.kind === 'videoinput')!;
      expect(microphone).toBeTruthy();
      expect(camera).toBeTruthy();
      await ui('welcome.microphone-device').click();
      await page.getByRole('option', { name: microphone.label, exact: true }).click();
      await ui('welcome.camera-device').click();
      await page.getByRole('option', { name: camera.label, exact: true }).click();
      await ui('welcome.next').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('welcome-devices.png'), fullPage: false });
      await ui('welcome.next').click();
      await expect(page.getByRole('heading', { name: 'Ready', exact: true })).toBeFocused();
      const stored = await read();
      expect(stored.local.sniptale_video_settings).toMatchObject({
        microphoneDeviceId: microphone.deviceId,
        webcamDeviceId: camera.deviceId,
      });
      expect(stored.sync.sniptale_settings.voiceInput.microphoneDeviceId).toBe(microphone.deviceId);
      await ui('welcome.back').click();
      await expect(ui('welcome.microphone-device')).toContainText(microphone.label);
      await page.reload();
      await expect(ui('welcome.language')).toContainText('English');
      await expect(ui('welcome.theme')).toContainText('Dark');
      expect((await read()).local.sniptale_welcome_shown).toBe(true);
      await ui('welcome.skip').click();
      await expect(page).not.toHaveURL(/welcome=1/);
      await expect(page.locator('[data-ui="settings.welcome.root"]')).toHaveCount(0);
      const other = await context.newPage();
      await other.goto(`chrome-extension://${extensionId}/apps/extension/src/settings/index.html`);
      await expect(other.locator('[data-ui="settings.welcome.root"]')).toHaveCount(0);
      expect(
        context.pages().filter((candidate) => candidate.url().includes('welcome=1'))
      ).toHaveLength(0);
    } finally {
      await closeExtensionBrowser(launched, { removeUserDataDir: true });
    }
  });
}

test('welcome permits skipping denied devices and retains Russian light appearance', async ({}, info) => {
  const launched = await launchExtensionBrowser({
    viewport: { width: 1280, height: 560 },
    fakeMediaDevices: true,
    autoGrantMediaPermissions: false,
  });
  try {
    const { context, extensionId, browser } = launched;
    const page = await context.newPage();
    const origin = `chrome-extension://${extensionId}`;
    await page.goto(`${origin}/apps/extension/src/settings/index.html?welcome=1`);
    const ui = (name: string) => page.locator(`[data-ui="${name}"]`);
    await ui('welcome.language').click();
    await page.getByRole('option', { name: 'Русский', exact: true }).click();
    await ui('welcome.theme').click();
    await page.getByRole('option', { name: 'Светлая', exact: true }).click();
    await expect(ui('welcome.theme')).toContainText('Светлая');
    await expect(ui('welcome.next')).toBeEnabled();
    await page.screenshot({ path: info.outputPath('welcome-russian-light.png'), fullPage: false });
    await page.setViewportSize({ width: 1100, height: 560 });
    const viewport = page.locator('.sniptale-settings-viewport');
    expect(await viewport.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true
    );
    await viewport.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    expect(await viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.setViewportSize({ width: 1280, height: 560 });
    const cdp = await browser.newBrowserCDPSession();
    for (const name of ['microphone', 'camera']) {
      await cdp.send('Browser.setPermission', { origin, permission: { name }, setting: 'denied' });
    }
    await cdp.detach();
    await ui('welcome.next').click();
    await ui('welcome.microphone-allow').click();
    await expect(ui('welcome.microphone').getByRole('status')).toContainText('Доступ отклонён');
    await ui('welcome.camera-allow').click();
    await expect(ui('welcome.camera').getByRole('status')).toContainText('Доступ отклонён');
    await expect(ui('welcome.microphone-device')).toBeDisabled();
    await expect(ui('welcome.camera-device')).toBeDisabled();
    await ui('welcome.next').scrollIntoViewIfNeeded();
    await ui('welcome.next').click();
    await expect(page.getByRole('heading', { name: 'Готово', exact: true })).toBeFocused();
    await ui('welcome.next').click();
    await expect(page).not.toHaveURL(/welcome=1/);
  } finally {
    await closeExtensionBrowser(launched, { removeUserDataDir: true });
  }
});
