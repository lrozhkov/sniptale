import { mkdir, readdir, readFile } from 'node:fs/promises';
import { triggerExtensionAction } from '../support/recording-action';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';

async function grantOrigin(popup: Page, origin: string) {
  await popup.evaluate((url) => {
    const button = document.createElement('button');
    button.textContent = 'Grant launcher proof';
    button.onclick = async () => {
      button.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${url}/*`] })
      );
    };
    document.body.append(button);
  }, origin);
  await popup.getByRole('button', { name: 'Grant launcher proof' }).click();
  await expect(popup.getByRole('button', { name: 'Grant launcher proof' })).toHaveAttribute(
    'data-granted',
    'true'
  );
}
async function checkCornerGrip(
  page: Page,
  popup: Page,
  group: Locator,
  grip: Locator,
  prefix: string,
  info: TestInfo
) {
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    await popup.evaluate(async (corner) => {
      const stored = await chrome.storage.sync.get('sniptale_settings');
      await chrome.storage.sync.set({
        sniptale_settings: {
          ...stored['sniptale_settings'],
          pageLaunch: { ...stored['sniptale_settings'].pageLaunch, corner },
        },
      });
    }, corner);
    await expect
      .poll(async () => {
        const box = await group.boundingBox();
        return Boolean(
          box &&
          (corner.endsWith('left') ? box.x < 100 : box.x > page.viewportSize()!.width / 2) &&
          (corner.startsWith('top') ? box.y < 100 : box.y > page.viewportSize()!.height / 2)
        );
      })
      .toBe(true);
    for (const background of ['#ffffff', '#111111']) {
      await page.evaluate((color) => {
        document.body.style.background = color;
      }, background);
      await group.hover();
      await expect(grip).toHaveCSS('opacity', '1');
      await grip.hover();
      if (background === '#ffffff') {
        const shell = (await group.boundingBox())!;
        const handle = (await grip.boundingBox())!;
        const x = Math.min(shell.x, handle.x) - 4;
        const y = Math.min(shell.y, handle.y) - 4;
        await page.screenshot({
          path: info.outputPath(`${prefix}-grip-${corner}.png`),
          fullPage: false,
          clip: {
            x,
            y,
            width: Math.max(shell.x + shell.width, handle.x + handle.width) - x + 4,
            height: Math.max(shell.y + shell.height, handle.y + handle.height) - y + 4,
          },
        });
      }
      const geometry = await grip.evaluate((button) => {
        const svg = button.querySelector('svg')!;
        const bounds = svg.getBoundingClientRect();
        const alpha = (color: string) =>
          color.startsWith('rgba')
            ? Number(color.slice(5, -1).split(',')[3])
            : color === 'transparent'
              ? 0
              : 1;
        const style = getComputedStyle(button);
        const before = getComputedStyle(button, '::before');
        return {
          width: bounds.width,
          height: bounds.height,
          backing: Math.max(
            alpha(style.backgroundColor),
            before.content !== 'none' ? alpha(before.backgroundColor) : 0
          ),
        };
      });
      expect(geometry.width).toBeGreaterThanOrEqual(12);
      expect(geometry.height).toBeGreaterThanOrEqual(12);
      expect
        .soft(geometry.backing, `${prefix} ${corner} ${background}`)
        .toBeGreaterThanOrEqual(0.9);
    }
  }
  await page.evaluate(() => {
    document.body.style.background = '';
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`native page launcher handback, shared corner and quick actions ${name}`, async ({}, info) => {
    const host = await startHostServer();
    const browser = await launchExtensionBrowser({ viewport: size });
    try {
      const page = await browser.context.newPage();
      await page.goto(host.origin);
      const popup = await browser.context.newPage();
      await popup.goto(
        `chrome-extension://${browser.extensionId}/apps/extension/src/popup/index.html`
      );
      await grantOrigin(popup, host.origin);
      await page.reload();
      const tabId = await popup.evaluate(async (url) => {
        const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
        if (tab?.id === undefined) throw new Error('Proof tab missing');
        return tab.id;
      }, page.url());
      const registration = await popup.evaluate(
        async (target) =>
          chrome.runtime.sendMessage({
            type: 'PAGE_ACCESS',
            operation: 'register-granted-site',
            tabId: target,
            __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
          }),
        tabId
      );
      expect(registration).toMatchObject({ success: true });
      await page.reload();
      const launcher = page.locator('#sniptale-page-launcher');
      await expect(launcher).toHaveCount(0);
      await popup.evaluate(async (wide) => {
        const result = await chrome.storage.sync.get('sniptale_settings');
        await chrome.storage.sync.set({
          sniptale_settings: {
            ...result['sniptale_settings'],
            pageLaunch: {
              enabled: true,
              hoverOnly: false,
              corner: 'bottom-right',
              quickActionsPopup: true,
              quickActionsCorner: true,
              quickActionsToolbar: true,
            },
          },
        });
        await chrome.storage.local.set({
          'sniptale-locale-preference': wide ? 'ru' : 'en',
          'sniptale-theme-preference': wide ? 'dark' : 'light',
        });
      }, size.width === 1920);
      await page.bringToFront();
      const open = launcher.getByRole('button', {
        name: /Open page toolbar|Открыть панель страницы/u,
      });
      await expect(open).toBeVisible();
      await expect(open).toHaveAttribute(
        'aria-label',
        size.width === 1920 ? 'Открыть панель страницы' : 'Open page toolbar'
      );
      await expect(page.locator('#sniptale-extension-root')).toHaveCount(0);
      await checkCornerGrip(
        page,
        popup,
        launcher.locator('.group'),
        launcher.getByRole('button', { name: /Move corner group|Переместить угловую группу/u }),
        'shim',
        info
      );
      const actions = launcher.getByRole('button', { name: /Quick actions|Быстрые действия/u });
      await actions.click();
      await expect(launcher.getByRole('menu')).toBeVisible();
      await popup.evaluate(async () => {
        await chrome.storage.local.set({
          sniptale_quick_actions: [
            { id: 'default-visible-download', status: false, hotkey: null },
            {
              id: 'menu-refresh-proof',
              name: 'Updated menu',
              status: true,
              customized: true,
              hotkey: null,
              icon: 'Camera',
              screenshotMode: 'visible',
              afterCapture: 'download_default',
              exitAfterCapture: true,
              imageFormat: 'png',
              imageQuality: 100,
            },
          ],
        });
      });
      await expect(launcher.getByRole('menu')).toHaveCount(0);
      await expect(actions).toBeFocused();
      await actions.click();
      await expect(launcher.getByRole('menuitem', { name: 'Updated menu' })).toBeVisible();
      await popup.evaluate(async () => chrome.storage.local.remove('sniptale_quick_actions'));
      await expect(launcher.getByRole('menu')).toHaveCount(0);
      await expect(actions).toBeFocused();
      await actions.click();
      await page.keyboard.press('Escape');
      await expect(launcher.getByRole('menu')).toHaveCount(0);
      // DOM-generated clicks cannot invoke the native opening capability.
      await open.evaluate((button: HTMLButtonElement) => button.click());
      await expect(page.locator('#sniptale-extension-root')).toHaveCount(0);
      await launcher.screenshot({ path: info.outputPath('launcher-corner.png') });
      await open.click();
      await expect(page.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
      await expect(launcher).toHaveCount(0);
      const menu = page.locator('[data-ui="content.quick-actions.trigger"]');
      await expect(menu).toBeVisible();
      await menu.click();
      await expect(
        page.locator('[data-ui="content.quick-actions.dropdown"] .sniptale-popover-menu')
      ).toBeVisible();
      const triggerBounds = (await menu.boundingBox())!;
      const menuBounds = (await page
        .locator('[data-ui="content.quick-actions.dropdown"] .sniptale-popover-menu')
        .boundingBox())!;
      expect(menuBounds.x).toBeLessThanOrEqual(triggerBounds.x + triggerBounds.width);
      expect(menuBounds.x + menuBounds.width).toBeGreaterThanOrEqual(triggerBounds.x);
      expect(menuBounds.y).toBeGreaterThanOrEqual(triggerBounds.y + triggerBounds.height);
      expect(menuBounds.y - triggerBounds.y - triggerBounds.height).toBeLessThan(20);
      await page.screenshot({ path: info.outputPath('toolbar-actions-menu.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await page.locator('[data-ui="content.toolbar.navigation.collapse"]').click();
      const collapsed = page.locator('[data-ui="content.collapsed-panels"]');
      await expect(collapsed).toBeVisible();
      await expect(collapsed.locator('[data-ui="content.quick-actions.trigger"]')).toBeVisible();
      await collapsed.hover();
      const grip = collapsed.locator('[data-ui="content.collapsed-panels.drag-handle"]');
      await checkCornerGrip(page, popup, collapsed, grip, 'collapsed', info);
      await grip.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(collapsed).toHaveAttribute('data-corner', 'bottom-left');
      await collapsed.locator('[data-ui="content.collapsed-panels.restore-toolbar"]').click();
      await page.locator('[data-ui="content.toolbar.settings-button"]').click();
      await page.getByText(/^(Clear and close|Очистить и закрыть)$/u).click();
      await expect(page.locator('#sniptale-extension-root')).toHaveCount(0);
      await expect(open).toBeVisible();
      await expect(launcher.locator('.group')).toHaveCSS('left', '20px');
      const status = await popup.evaluate(
        async (target) =>
          chrome.scripting.executeScript({
            target: { tabId: target },
            func: async () =>
              chrome.runtime.sendMessage({
                type: 'SCREENSHOT_MODE_STATUS',
                __sniptaleRuntimeFreshness: {
                  issuedAtEpochMs: Date.now(),
                  nonce: crypto.randomUUID(),
                },
              }),
          }),
        tabId
      );
      expect(status[0]?.result).toMatchObject({ success: true });
      await expect(page.locator('#sniptale-extension-root')).toHaveCount(0);
      await expect(open).toBeVisible();
      await launcher.locator('.group').hover();
      const launcherGrip = launcher.getByRole('button', {
        name: /Move corner group|Переместить угловую группу/u,
      });
      const bounds = (await launcherGrip.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await expect(launcherGrip).toHaveCSS('cursor', 'grabbing');
      await page.mouse.move(size.width - 40, 40, { steps: 8 });
      await expect(launcher.locator('.guide-zone')).toHaveCount(4);
      await page.mouse.up();
      await expect(launcher.locator('.group')).toHaveCSS('right', '20px');
      await expect(launcher.locator('.group')).toHaveCSS('top', '20px');
      await page.reload();
      await expect(open).toBeVisible();
      await expect(launcher.locator('.group')).toHaveCSS('right', '20px');
      await expect(launcher.locator('.group')).toHaveCSS('top', '20px');
      await popup.evaluate(async () => {
        const stored = await chrome.storage.sync.get('sniptale_settings');
        await chrome.storage.sync.set({
          sniptale_settings: {
            ...stored['sniptale_settings'],
            pageLaunch: { ...stored['sniptale_settings'].pageLaunch, hoverOnly: true },
          },
        });
      });
      await page.mouse.move(size.width / 2, size.height / 2);
      await expect(launcher.locator('.group')).toHaveAttribute('data-hidden', 'true');
      await page.mouse.move(size.width - 20, 20);
      await expect(launcher.locator('.group')).toHaveAttribute('data-hidden', 'false');
      await page.screenshot({ path: info.outputPath('launcher-handback.png'), fullPage: false });
      await open.click();
      await page.locator('[data-ui="content.toolbar.navigation.collapse"]').click();
      await page.mouse.move(size.width / 2, size.height / 2);
      await expect(page.locator('[data-ui="content.collapsed-panels"]')).toBeVisible();
      await expect(launcher).toHaveCount(0);
      await page.setViewportSize({ width: 1000, height: 560 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false
      );
    } finally {
      await closeExtensionBrowser(browser);
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`page launcher and placement settings remain independent ${name}`, async ({}, info) => {
    const browser = await launchExtensionBrowser({ viewport: size });
    try {
      const page = await browser.context.newPage();
      const base = `chrome-extension://${browser.extensionId}/apps/extension/src/settings/index.html`;
      await page.goto(`${base}?section=interface-browser&view=interface`);
      await page.evaluate(async (wide) => {
        const locale = wide ? 'ru' : 'en';
        const theme = wide ? 'dark' : 'light';
        localStorage.setItem('sniptale-locale-preference', locale);
        localStorage.setItem('sniptale-theme-preference', theme);
        await chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        });
      }, size.width === 1920);
      await page.reload();
      const launcher = page.getByRole('switch', {
        name: /^(Page launcher|Кнопка запуска на странице)$/u,
      });
      const hover = page.getByRole('switch', {
        name: /Show only when hovering|Показывать только при наведении/u,
      });
      await expect(launcher).toHaveAttribute('aria-checked', 'false');
      await expect(hover).toBeDisabled();
      await launcher.click();
      await expect(launcher).toHaveAttribute('aria-checked', 'true');
      await expect(hover).toBeEnabled();
      await hover.click();
      await expect(hover).toHaveAttribute('aria-checked', 'true');
      await launcher.click();
      await expect(hover).toBeDisabled();
      await expect(hover).toHaveAttribute('aria-checked', 'true');
      await page.screenshot({ path: info.outputPath('launcher-settings.png'), fullPage: false });
      await page.goto(`${base}?section=quick-actions`);
      const popup = page.getByRole('switch', {
        name: /^(In the extension popup|В окне расширения)$/u,
      });
      const corner = page.getByRole('switch', {
        name: /^(In the page corner group|В угловой группе страницы)$/u,
      });
      const toolbar = page.getByRole('switch', {
        name: /^(In the page toolbar|На панели страницы)$/u,
      });
      await expect(popup).toHaveAttribute('aria-checked', 'true');
      await expect(corner).toHaveAttribute('aria-checked', 'false');
      await expect(toolbar).toHaveAttribute('aria-checked', 'false');
      await corner.click();
      await expect(corner).toHaveAttribute('aria-checked', 'true');
      await expect(toolbar).toHaveAttribute('aria-checked', 'false');
      await toolbar.click();
      await expect(toolbar).toHaveAttribute('aria-checked', 'true');
      await popup.click();
      await expect(popup).toHaveAttribute('aria-checked', 'false');
      await expect(corner).toHaveAttribute('aria-checked', 'true');
      await page.screenshot({ path: info.outputPath('placement-settings.png'), fullPage: false });
      await page.setViewportSize({ width: 1000, height: 560 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false
      );
    } finally {
      await closeExtensionBrowser(browser);
    }
  });
}

test('native corner quick action captures after its menu group is hidden', async ({}, info) => {
  const host = await startHostServer();
  const browser = await launchExtensionBrowser({ viewport: PRIMARY_BROWSER_VIEWPORTS[0].size });
  const directory = info.outputPath('downloads');
  await mkdir(directory, { recursive: true });
  const downloadSession = await browser.browser.newBrowserCDPSession();
  await downloadSession.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: directory,
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(host.origin);
    const settings = await browser.context.newPage();
    await settings.goto(
      `chrome-extension://${browser.extensionId}/apps/extension/src/settings/index.html?section=quick-actions`
    );
    await grantOrigin(settings, host.origin);
    await settings.evaluate(async (origin) => {
      const tab = (await chrome.tabs.query({})).find((entry) => entry.url === `${origin}/`);
      await chrome.runtime.sendMessage({
        type: 'PAGE_ACCESS',
        operation: 'register-granted-site',
        tabId: tab!.id,
        __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
      });
      const action = {
        id: 'native-menu-proof',
        icon: 'Camera',
        screenshotMode: 'visible',
        afterCapture: 'download_default',
        exitAfterCapture: true,
        imageFormat: 'png',
        imageQuality: 100,
      };
      await chrome.storage.local.set({
        sniptale_quick_actions: [
          { ...action, name: 'Native menu proof', customized: true, status: true, hotkey: null },
        ],
      });
      const saved = await chrome.storage.sync.get('sniptale_settings');
      await chrome.storage.sync.set({
        sniptale_settings: {
          ...saved['sniptale_settings'],
          pageLaunch: {
            enabled: true,
            corner: 'bottom-right',
            quickActionsCorner: true,
          },
        },
      });
    }, host.origin);
    await page.reload();
    await page.bringToFront();
    await triggerExtensionAction(browser.context, browser.extensionId, page);
    await page.bringToFront();
    await page.evaluate(() => {
      document.body.style.background = '#c8e4d9';
      for (const child of document.body.children)
        if (child instanceof HTMLElement && child.id !== 'sniptale-extension-root')
          child.style.visibility = 'hidden';
    });
    const launcher = page.locator('#sniptale-page-launcher');
    await launcher.getByRole('button', { name: /Quick actions|Быстрые действия/u }).click();
    await launcher.getByRole('menuitem', { name: 'Native menu proof' }).click();
    await expect
      .poll(async () => (await readdir(directory)).filter((name) => name.endsWith('.png')).length)
      .toBe(1);
    const filename = (await readdir(directory)).find((name) => name.endsWith('.png'))!;
    const bytes = await readFile(`${directory}/${filename}`);
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const result = await settings.evaluate(
      async (dataUrl) => {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          group: [...context.getImageData(image.width - 40, image.height - 40, 1, 1).data],
          menu: [...context.getImageData(image.width - 70, image.height - 100, 1, 1).data],
        };
      },
      `data:image/png;base64,${bytes.toString('base64')}`
    );
    expect(result).toEqual({
      width: 1280,
      height: 560,
      group: [200, 228, 217, 255],
      menu: [200, 228, 217, 255],
    });
    await expect(
      launcher.getByRole('button', { name: /Open page toolbar|Открыть панель страницы/u })
    ).toBeVisible();
    await expect(page.locator('#sniptale-extension-root')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('corner-capture-completed.png'),
      fullPage: false,
    });
  } finally {
    await downloadSession.detach();
    await closeExtensionBrowser(browser);
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
