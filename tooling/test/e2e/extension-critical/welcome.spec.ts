import { expect, test, type Page } from '@playwright/test';
import { acceptOptionalExtensionPermissionPrompt } from '../support/native-permission-prompt';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';

test.setTimeout(120_000);
test.use({ actionTimeout: 10_000 });
const ui = (page: Page, name: string) => page.locator(`[data-ui="${name}"]`);
const choose = (page: Page, field: string, name: string) =>
  ui(page, `welcome.${field}`).getByRole('button', { name, exact: true });

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
      const welcomeUrl = page.url();
      await expect(ui(page, 'settings.welcome.root')).toBeVisible();
      await expect(page.locator('.welcome-brand img')).toHaveJSProperty('naturalWidth', 128);
      const read = () =>
        page.evaluate(async () => ({
          local: await chrome.storage.local.get(null),
          sync: await chrome.storage.sync.get(null),
        }));
      expect((await read()).local.sniptale_welcome_shown).toBe(true);
      await page.evaluate(async () => {
        const local = await chrome.storage.local.get('sniptale_video_settings');
        const sync = await chrome.storage.sync.get('sniptale_settings');
        await chrome.storage.local.set({
          sniptale_video_settings: {
            ...local.sniptale_video_settings,
            microphoneDeviceId: 'existing-microphone',
            webcamDeviceId: 'existing-camera',
          },
        });
        await chrome.storage.sync.set({
          sniptale_settings: {
            ...sync.sniptale_settings,
            voiceInput: {
              ...sync.sniptale_settings?.voiceInput,
              microphoneDeviceId: 'existing-voice-microphone',
            },
          },
        });
      });
      await choose(page, 'language', 'English').click();
      await choose(page, 'theme', 'Dark').click();
      await expect(choose(page, 'theme', 'Dark')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText('Language', { exact: true })).toHaveCount(1);
      await expect(page.getByText('Theme', { exact: true })).toHaveCount(1);
      await expect(page.getByRole('combobox')).toHaveCount(0);
      await expect(ui(page, 'welcome.next')).toBeEnabled();
      await page.screenshot({
        path: info.outputPath('welcome-appearance.png'),
        fullPage: false,
        animations: 'disabled',
      });
      await ui(page, 'welcome.next').click();
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
      await expect(page.getByText('Checking access…', { exact: true })).toHaveCount(0);
      for (const kind of ['microphone', 'camera']) {
        const request = ui(page, `welcome.${kind}-allow`);
        if (await request.count()) await request.click();
        await expect(ui(page, `welcome.${kind}`).getByRole('status')).toHaveText('Access allowed');
        await expect(request).toHaveCount(0);
      }
      const alreadyGranted = await page.evaluate(() =>
        chrome.permissions.contains({ origins: ['<all_urls>'] })
      );
      if (!alreadyGranted) {
        await ui(page, 'welcome.origins-allow').click();
        // The browser owns this confirmation; wait for it to appear before sending its keys.
        await new Promise((resolve) => setTimeout(resolve, 250));
        acceptOptionalExtensionPermissionPrompt();
      }
      await expect(ui(page, 'welcome.origins').getByRole('status')).toHaveText('Access allowed');
      expect(
        await page.evaluate(() => chrome.permissions.contains({ origins: ['<all_urls>'] }))
      ).toBe(true);
      await expect
        .poll(() =>
          page.evaluate(async () =>
            (await chrome.scripting.getRegisteredContentScripts()).some(
              (script) => script.id === 'sniptale-page-access-all-sites'
            )
          )
        )
        .toBe(true);
      await expect(page.getByRole('combobox')).toHaveCount(0);
      const footer = (await page.locator('footer').boundingBox())!;
      expect((await page.locator('h1').boundingBox())!.y).toBeGreaterThanOrEqual(0);
      expect(footer.y + footer.height).toBeLessThanOrEqual(viewport.size.height);
      await ui(page, 'welcome.body').evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      expect(await page.locator('footer').boundingBox()).toEqual(footer);
      await page.screenshot({
        path: info.outputPath('welcome-devices.png'),
        fullPage: false,
        animations: 'disabled',
      });
      await ui(page, 'welcome.back').click();
      await expect(choose(page, 'language', 'English')).toHaveAttribute('aria-pressed', 'true');
      await ui(page, 'welcome.next').click();
      await ui(page, 'welcome.next').click();
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
      await expect(ui(page, 'welcome.pin-illustration')).toHaveJSProperty('naturalWidth', 768);
      await expect(ui(page, 'welcome.settings-link')).toHaveAttribute(
        'href',
        'index.html?section=interface-browser&view=interface'
      );
      await page.screenshot({
        path: info.outputPath('welcome-pin.png'),
        fullPage: false,
        animations: 'disabled',
      });
      await ui(page, 'welcome.next').click();
      await expect(page).not.toHaveURL(/welcome=1/);
      const stored = await read();
      expect(stored.local.sniptale_video_settings).toMatchObject({
        microphoneDeviceId: 'existing-microphone',
        webcamDeviceId: 'existing-camera',
      });
      expect(stored.sync.sniptale_settings.voiceInput.microphoneDeviceId).toBe(
        'existing-voice-microphone'
      );
      await page.goto(welcomeUrl);
      await page.reload();
      await expect(choose(page, 'language', 'English')).toHaveAttribute('aria-pressed', 'true');
      await expect(choose(page, 'theme', 'Dark')).toHaveAttribute('aria-pressed', 'true');
      expect((await read()).local.sniptale_welcome_shown).toBe(true);
      await ui(page, 'welcome.skip').click();
      await expect(page).not.toHaveURL(/welcome=1/);
      const other = await context.newPage();
      await other.goto(`chrome-extension://${extensionId}/apps/extension/src/settings/index.html`);
      await expect(ui(other, 'settings.welcome.root')).toHaveCount(0);
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
    await expect
      .poll(() => context.pages().filter((page) => page.url().includes('welcome=1')).length)
      .toBe(1);
    const page = context.pages().find((candidate) => candidate.url().includes('welcome=1'))!;
    await page.bringToFront();
    const origin = `chrome-extension://${extensionId}`;
    await choose(page, 'language', 'Русский').click();
    await choose(page, 'theme', 'Светлая').click();
    await expect(choose(page, 'theme', 'Светлая')).toHaveAttribute('aria-pressed', 'true');
    await expect(ui(page, 'welcome.next')).toBeEnabled();
    await expect(page.getByText('Язык', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Тема', { exact: true })).toHaveCount(1);
    await page.screenshot({
      path: info.outputPath('welcome-russian-light.png'),
      fullPage: false,
      animations: 'disabled',
    });
    await ui(page, 'welcome.language')
      .locator('.welcome-languages')
      .evaluate((grid) => {
        for (const label of ['Deutsch', 'Español', 'Français', 'Italiano', 'Português', '日本語']) {
          const choice = grid.querySelector('button')!.cloneNode(false) as HTMLButtonElement;
          choice.textContent = label;
          choice.dataset.layoutFixture = 'true';
          choice.setAttribute('aria-pressed', 'false');
          grid.append(choice);
        }
      });
    const languages = ui(page, 'welcome.language').getByRole('button');
    await expect(languages).toHaveCount(8);
    for (const choice of await languages.all()) {
      const box = (await choice.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(1280);
      expect(box.y + box.height).toBeLessThan((await page.locator('footer').boundingBox())!.y);
    }
    await page.screenshot({
      path: info.outputPath('welcome-eight-language-layout-fixture.png'),
      fullPage: false,
      animations: 'disabled',
    });
    await page
      .locator('[data-layout-fixture]')
      .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
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
    await ui(page, 'welcome.next').click();
    await ui(page, 'welcome.microphone-allow').click();
    await expect(ui(page, 'welcome.microphone').getByRole('status')).toContainText('Доступ закрыт');
    await ui(page, 'welcome.camera-allow').click();
    await expect(ui(page, 'welcome.camera').getByRole('status')).toContainText('Доступ закрыт');
    await expect(page.getByRole('combobox')).toHaveCount(0);
    const footer = (await page.locator('footer').boundingBox())!;
    await ui(page, 'welcome.body').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(ui(page, 'welcome.body')).toHaveCSS('overflow-y', 'auto');
    expect((await page.locator('h1').boundingBox())!.y).toBeGreaterThanOrEqual(0);
    expect(await page.locator('footer').boundingBox()).toEqual(footer);
    expect(footer.y + footer.height).toBeLessThanOrEqual(560);
    await ui(page, 'welcome.body').evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.screenshot({
      path: info.outputPath('welcome-denied.png'),
      fullPage: false,
      animations: 'disabled',
    });
    await ui(page, 'welcome.next').click();
    await expect(ui(page, 'welcome.pin-illustration')).toHaveJSProperty('naturalWidth', 768);
    await page.screenshot({
      path: info.outputPath('welcome-pin-russian-light.png'),
      fullPage: false,
      animations: 'disabled',
    });
    await ui(page, 'welcome.settings-link').click();
    await expect(page).not.toHaveURL(/welcome=1/);
  } finally {
    await closeExtensionBrowser(launched, { removeUserDataDir: true });
  }
});
