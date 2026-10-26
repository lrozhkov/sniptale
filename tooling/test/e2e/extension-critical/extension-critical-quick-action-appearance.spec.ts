import { readImageDataUrlDimensions } from '@sniptale/runtime-contracts/validation/data-url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import {
  evaluateInTarget,
  sendRuntimeMessageInTarget,
  triggerExtensionAction,
} from '../support/recording-action';
import { createQuickActionAppearance } from '../../../../apps/extension/src/contracts/quick-action-appearance';
import {
  DEFAULT_WINDOW_HEADER,
  windowHeaderGeometry,
} from '@sniptale/runtime-contracts/window-header';

async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));
  });
}
for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`compact quick-action appearance form ${name}`, async ({}, info) => {
    const browser = await launchExtensionBrowser({ viewport: size });
    try {
      const page = await browser.context.newPage();
      await page.goto(
        `chrome-extension://${browser.extensionId}/apps/extension/src/settings/index.html?section=quick-actions`
      );
      await page.evaluate(
        async (theme) => {
          localStorage.setItem('sniptale-theme-preference', theme);
          await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
        },
        size.width === 1920 ? 'dark' : 'light'
      );
      await page.reload();
      await page.getByRole('button', { name: /^(Add action|Добавить действие)$/u }).click();
      const dialog = page.getByRole('dialog');
      await settled(page);
      expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(540.5);
      await dialog
        .getByRole('textbox', { name: /Name|Название/u })
        .fill('A deliberately long quick-action name for compact layout proof');
      const original = await page.evaluate(() =>
        chrome.storage.local.get('sniptale_quick_actions')
      );
      const rail = dialog.getByRole('navigation');
      for (const label of [
        /^(Capture|Захват)$/u,
        /^(Window header|Шапка окна)$/u,
        /^(Background|Фон)$/u,
        /^(Information|Информация)$/u,
      ]) {
        await rail.getByRole('button', { name: label }).click();
        if (label.source.includes('Window')) {
          await dialog.getByRole('button', { name: /^(Browser|Браузер)$/u }).click();
        }
        if (label.source.includes('Background')) {
          const preset = dialog.getByRole('button', {
            name: /Cobalt Silk|Кобальтовый шёлк/u,
            exact: true,
          });
          await expect(preset).toBeVisible();
          await preset.click();
          await expect(dialog.getByRole('textbox', { name: /Padding|Отступ/u })).toBeVisible();
        }
        if (label.source.includes('Information')) {
          await dialog.getByRole('switch', { name: /Add caption|Добавить подпись/u }).click();
          await dialog
            .getByRole('textbox', { name: /Custom caption text|Свой текст подписи/u })
            .fill('A long caption remains editable in the actual modal scroll owner.');
          await dialog
            .getByRole('textbox', { name: /Text size|Размер текста/u })
            .scrollIntoViewIfNeeded();
          if (size.height === 560) {
            expect(
              await dialog
                .locator('.sniptale-modal-body-sm')
                .evaluate((element) => element.scrollTop)
            ).toBeGreaterThan(0);
          }
        }
        await settled(page);
        await expect(dialog.getByRole('button', { name: /^(Save|Сохранить)$/u })).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
          false
        );
      }
      await page.screenshot({
        path: info.outputPath('appearance-information-compact.png'),
        fullPage: false,
      });
      await rail.getByRole('button', { name: /^(Action|Действие)$/u }).click();
      await expect(dialog.getByRole('textbox', { name: /Name|Название/u })).toHaveValue(
        'A deliberately long quick-action name for compact layout proof'
      );
      await rail.getByRole('button', { name: /^(Action|Действие)$/u }).focus();
      await page.keyboard.press('End');
      await expect(
        rail.getByRole('button', { name: /^(Information|Информация)$/u })
      ).toHaveAttribute('aria-pressed', 'true');
      await rail.getByRole('button', { name: /^(Background|Фон)$/u }).click();
      await settled(page);
      await page.screenshot({
        path: info.outputPath('appearance-background-compact.png'),
        fullPage: false,
      });
      await dialog.getByRole('button', { name: /^(Cancel|Отмена)$/u }).click();
      expect(await page.evaluate(() => chrome.storage.local.get('sniptale_quick_actions'))).toEqual(
        original
      );
      await page.setViewportSize({ width: 1000, height: 560 });
      await page.getByRole('button', { name: /^(Add action|Добавить действие)$/u }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false
      );
    } finally {
      await closeExtensionBrowser(browser);
    }
  });
}

test('styles native visible, full and selection output with all captions and an overlong page address', async ({}, info) => {
  const size = { width: 1280, height: 560 };
  const browser = await launchExtensionBrowser({ viewport: size });
  const host = await startHostServer();
  const downloadSession = await browser.browser.newBrowserCDPSession();
  const downloadPath = info.outputPath('native-downloads');
  await mkdir(downloadPath, { recursive: true });
  await downloadSession.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${host.origin}/?query=${'a'.repeat(2200)}`);
    await page.evaluate(() => {
      document.body.style.minHeight = '1400px';
      document.body.style.background = '#f97316';
    });
    const popup = await browser.context.newPage();
    await popup.goto(
      `chrome-extension://${browser.extensionId}/apps/extension/src/popup/index.html`
    );
    await popup.evaluate((origin) => {
      const button = document.createElement('button');
      button.textContent = 'Grant appearance proof';
      button.onclick = async () => {
        button.dataset['granted'] = String(
          await chrome.permissions.request({ origins: [`${origin}/*`] })
        );
      };
      document.body.append(button);
    }, host.origin);
    await popup.getByRole('button', { name: 'Grant appearance proof' }).click();
    await expect(popup.getByRole('button', { name: 'Grant appearance proof' })).toHaveAttribute(
      'data-granted',
      'true'
    );
    await page.reload();
    await page.evaluate(() => {
      document.body.style.minHeight = '1400px';
      document.body.style.background = '#f97316';
    });
    const tabId = await popup.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((item) => item.url === url);
      if (tab?.id === undefined) throw new Error('Capture tab missing');
      return tab.id;
    }, page.url());
    const registered = await popup.evaluate(
      async (target) =>
        chrome.runtime.sendMessage({
          type: 'PAGE_ACCESS',
          operation: 'register-granted-site',
          tabId: target,
          __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
        }),
      tabId
    );
    expect(registered).toMatchObject({ success: true });
    const appearance = createQuickActionAppearance();
    appearance.header = {
      ...DEFAULT_WINDOW_HEADER,
      theme: 'dark',
      title: 'Quick action proof',
      faviconEnabled: true,
    };
    appearance.faviconMode = 'page';
    appearance.titleSource = 'static';
    appearance.background = {
      ...appearance.background,
      kind: 'paint',
      paint: { kind: 'solid', color: '#42b883ff' },
      padding: 20,
      radius: 0,
      shadow: 0,
    };
    appearance.information = {
      ...appearance.information,
      enabled: true,
      title: true,
      url: true,
      date: true,
      dimensions: true,
      text: 'Appearance proof',
    };
    for (const { mode, format } of [
      { mode: 'visible', format: 'png' },
      { mode: 'full', format: 'png' },
      { mode: 'selection', format: 'png' },
      { mode: 'visible', format: 'jpeg' },
      { mode: 'visible', format: 'webp' },
    ] as const) {
      appearance.information.position = format === 'webp' ? 'above' : 'below';
      appearance.background.radius = mode === 'visible' && format === 'png' ? 256 : 0;
      const id = `appearance-${mode}-${format}`;
      await popup.evaluate(
        async ({ id, mode, format, appearance }) =>
          chrome.storage.local.set({
            sniptale_quick_actions: [
              {
                id,
                name: id,
                icon: 'Camera',
                status: true,
                screenshotMode: mode,
                afterCapture: 'download_default',
                exitAfterCapture: true,
                imageFormat: format,
                imageQuality: 90,
                appearance,
              },
            ],
          }),
        { id, mode, format, appearance }
      );
      await page.bringToFront();
      const prior = await popup.evaluate(async () =>
        (await chrome.downloads.search({})).map((item) => item.id)
      );
      const target = await triggerExtensionAction(browser.context, browser.extensionId, page);
      try {
        const response = await sendRuntimeMessageInTarget(browser.context, target, {
          type: 'TRIGGER_QUICK_ACTION',
          tabId,
          actionId: id,
        });
        expect(response).toMatchObject({ success: true });
      } finally {
        await evaluateInTarget(browser.context, target, 'window.close()').catch(() => undefined);
      }
      if (mode === 'selection') {
        await page.bringToFront();
        await expect(page.locator('.sniptale-selection-container')).toBeVisible();
        await page.mouse.move(200, 200);
        await page.mouse.down();
        await page.mouse.move(500, 380, { steps: 4 });
        await page.mouse.up();
        await page.locator('.sniptale-selection-size-confirm-button').click();
      }
      let filename = '';
      await expect
        .poll(
          async () => {
            const download = await popup.evaluate(
              async (previous) =>
                (await chrome.downloads.search({})).find(
                  (item) => !previous.includes(item.id) && item.state === 'complete'
                ),
              prior
            );
            filename = download?.filename ?? '';
            return filename;
          },
          { timeout: 30_000 }
        )
        .not.toBe('');
      const bytes = await readFile(filename);
      expect(filename, `${mode}/${format} encoded output filename`).toMatch(
        { jpeg: /\.jpe?g$/u, png: /\.png$/u, webp: /\.webp$/u }[format]
      );
      const dataUrl = `data:image/${format};base64,${bytes.toString('base64')}`;
      const dimensions = readImageDataUrlDimensions(dataUrl)!;
      const { width, height } = dimensions;
      expect(width).toBe((mode === 'selection' ? 300 : 1280) + 40);
      expect(height).toBeGreaterThan((mode === 'selection' ? 180 : 560) + 80);
      const captionY =
        appearance.information.position === 'above'
          ? 20 + Math.ceil(windowHeaderGeometry(appearance.header!, size).height) + 36
          : height - 24;
      const pixels = await popup.evaluate(
        async ({ url, captionY, radius }) => {
          const image = await createImageBitmap(await (await fetch(url)).blob());
          const canvas = new OffscreenCanvas(image.width, image.height);
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          image.close();
          let captionInkOutsideCard = 0;
          if (radius) {
            context.beginPath();
            context.roundRect(20, 20, canvas.width - 40, canvas.height - 40, radius);
            const bandTop = canvas.height - 60;
            const band = context.getImageData(0, bandTop, canvas.width, 40);
            for (let y = 0; y < 40; y++) {
              for (let x = 0; x < canvas.width; x++) {
                const offset = (y * canvas.width + x) * 4;
                const isCaptionInk =
                  Math.abs(band.data[offset]! - 51) < 16 &&
                  Math.abs(band.data[offset + 1]! - 65) < 16 &&
                  Math.abs(band.data[offset + 2]! - 85) < 16;
                if (isCaptionInk && !context.isPointInPath(x + 0.5, bandTop + y + 0.5))
                  captionInkOutsideCard++;
              }
            }
          }
          return {
            captionInkOutsideCard,
            background: Array.from(context.getImageData(0, 0, 1, 1).data),
            caption: Array.from(
              context.getImageData(Math.floor(canvas.width / 2), captionY, 1, 1).data
            ),
          };
        },
        { url: dataUrl, captionY, radius: appearance.background.radius }
      );
      for (const [index, channel] of [66, 184, 131, 255].entries())
        expect(Math.abs(pixels.background[index]! - channel)).toBeLessThanOrEqual(
          format === 'png' ? 0 : 4
        );
      expect(pixels.captionInkOutsideCard).toBe(0);
      for (const channel of pixels.caption)
        expect(Math.abs(channel - 255)).toBeLessThanOrEqual(format === 'png' ? 0 : 4);
      await writeFile(
        info.outputPath(`appearance-${mode}.${format === 'jpeg' ? 'jpg' : format}`),
        bytes
      );
    }
    await page.screenshot({
      path: info.outputPath('appearance-capture-complete.png'),
      fullPage: false,
    });
  } finally {
    await downloadSession.detach().catch(() => undefined);
    await closeExtensionBrowser(browser);
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
