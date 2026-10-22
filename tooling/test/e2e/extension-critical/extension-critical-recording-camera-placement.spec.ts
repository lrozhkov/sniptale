import { expect, test } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

test.setTimeout(90000);
test.use({ actionTimeout: 10000 });

for (const { name, size } of [
  ...PRIMARY_BROWSER_VIEWPORTS,
  { name: '960x560', size: { width: 960, height: 560 } },
]) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`camera placement sync ${name} ${orientation}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size, fakeMediaDevices: true });
      try {
        const { page, popup } = await openDesignReview(
          launched.context,
          launched.extensionId,
          host.origin,
          size
        );
        const cameraDiagnostics: string[] = [];
        page.on('console', (message) => {
          if (message.type() === 'error' || message.type() === 'warning')
            cameraDiagnostics.push(message.text());
        });
        await popup.evaluate(
          async ({ settings, dark, shape }) => {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const deviceId = stream.getVideoTracks()[0]!.getSettings().deviceId;
            stream.getTracks().forEach((track) => track.stop());
            await chrome.storage.local.set({
              sniptale_video_settings: {
                ...settings,
                microphoneEnabled: false,
                webcamEnabled: true,
                webcamDeviceId: deviceId,
                webcamPresentation: { ...settings.webcamPresentation!, mode: 'embedded', shape },
                countdownSeconds: 0,
              },
              'sniptale-theme-preference': dark ? 'dark' : 'light',
              'sniptale-locale-preference': dark ? 'ru' : 'en',
            });
          },
          {
            settings: DEFAULT_VIDEO_SETTINGS,
            dark: size.width === 1920,
            shape: orientation === 'vertical' ? 'circle' : 'rectangle',
          }
        );
        await page.bringToFront();
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        const toolbar = page.locator('[data-ui="content.toolbar.root"]');
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        if (
          !(await page.getByRole('button', { name: /Vertical view|Вертикальный вид/u }).isVisible())
        ) {
          await page
            .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
            .click();
        }
        await page
          .getByRole('button', {
            name:
              orientation === 'vertical'
                ? /Vertical view|Вертикальный вид/u
                : /Horizontal view|Горизонтальный вид/u,
          })
          .click();
        await page.keyboard.press('Escape');
        await expect(toolbar).toHaveAttribute('data-display-mode', orientation);
        const trigger = page.locator('[data-ui="content.toolbar.video-recording.camera.menu"]');
        await trigger.click();
        const placement = page.locator(
          '[data-ui="content.toolbar.video-recording.camera.placement"]'
        );
        const embedded = placement.getByRole('button', { name: /^(On page|На странице)$/u });
        const separate = placement.getByRole('button', {
          name: /^(Separate track|Отдельная дорожка)$/u,
        });
        await expect(embedded).toHaveAttribute('aria-pressed', 'true');
        const worker = launched.context.serviceWorkers()[0]!;
        await worker.evaluate(() => {
          const original = chrome.storage.local.set;
          Object.defineProperty(chrome.storage.local, 'set', {
            configurable: true,
            value: (items: Record<string, unknown>, callback?: () => void) => {
              if ('sniptale_video_settings' in items) {
                Object.defineProperty(chrome.storage.local, 'set', {
                  configurable: true,
                  value: original,
                });
                throw new Error('Simulated camera placement write failure');
              }
              return callback ? original(items, callback) : original(items);
            },
          });
        });
        await separate.click();
        const errorToast = page.locator('.sniptale-toast-error');
        await expect(errorToast).toHaveCount(1);
        await expect(errorToast).toBeVisible();
        await expect(embedded).toHaveAttribute('aria-pressed', 'true');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('.sniptale-recording-media-control [role="alert"]')).toHaveCount(
          0
        );
        expect((await errorToast.boundingBox())!.width).toBeGreaterThan(200);
        await page.screenshot({
          path: info.outputPath('camera-placement-error-toast.png'),
          fullPage: false,
        });
        await separate.click();
        await expect(separate).toHaveAttribute('aria-pressed', 'true');
        expect(
          await placement
            .locator('button span')
            .evaluateAll((labels) =>
              labels.every((label) => label.scrollWidth <= label.clientWidth + 1)
            )
        ).toBe(true);
        const preview = page.locator('[data-ui="content.video-recording.embedded-camera"] video');
        await expect(preview).toBeHidden();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect
          .poll(() =>
            popup.evaluate(async () => {
              const settings = (await chrome.storage.local.get('sniptale_video_settings'))[
                'sniptale_video_settings'
              ];
              return settings.webcamPresentation.mode;
            })
          )
          .toBe('separate-track');
        await embedded.click();
        await expect(embedded).toHaveAttribute('aria-pressed', 'true');
        await expect(preview).toBeVisible();
        await expect
          .poll(() => preview.evaluate((video: HTMLVideoElement) => video.readyState))
          .toBeGreaterThanOrEqual(2);
        await separate.click();
        await expect(separate).toHaveAttribute('aria-pressed', 'true');
        await expect(preview).toBeHidden();
        const bounds = (await placement.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height);
        await page.evaluate(async () => document.fonts.ready);
        await page.screenshot({
          path: info.outputPath('toolbar-camera-placement.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');

        await popup.bringToFront();
        await popup.locator('button[data-page="video"]').click();
        await popup.getByRole('button', { name: /^(Configure camera|Настроить камеру)$/u }).click();
        const popupSeparate = popup.getByRole('button', {
          name: /^(Separate track|Отдельная дорожка)$/u,
        });
        await expect(popupSeparate).toHaveAttribute('aria-pressed', 'true');
        await popup.getByRole('button', { name: /^(On page|На странице)$/u }).click();
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.local.get('sniptale_video_settings'))[
                  'sniptale_video_settings'
                ].webcamPresentation.mode
            )
          )
          .toBe('embedded');
        await popup.screenshot({
          path: info.outputPath('popup-camera-placement.png'),
          fullPage: false,
        });

        await page.bringToFront();
        await trigger.click();
        await expect(embedded).toHaveAttribute('aria-pressed', 'true');
        try {
          await expect(preview).toBeVisible();
        } catch (error) {
          await info.attach('camera-diagnostics', {
            body: cameraDiagnostics.join('\n'),
            contentType: 'text/plain',
          });
          throw error;
        }
        await expect
          .poll(() => preview.evaluate((video: HTMLVideoElement) => video.readyState))
          .toBeGreaterThanOrEqual(2);
        await page.keyboard.press('Escape');
        const camera = page.locator('[data-ui="content.video-recording.embedded-camera"]');
        const resize = camera.locator('[data-resize="true"]');
        await expect(resize).toHaveCount(1);
        await expect(resize).toHaveCSS('opacity', '0');
        await camera.focus();
        await page.keyboard.press('Tab');
        await expect(resize).toBeFocused();
        await expect(resize).toHaveCSS('opacity', '1');
        await expect(resize).toHaveCSS('outline-style', 'solid');
        expect(await resize.evaluate((button) => getComputedStyle(button).outlineColor)).not.toBe(
          'rgba(0, 0, 0, 0)'
        );
        await page.getByRole('button', { name: 'Host action', exact: true }).click();
        await expect(resize).toHaveCSS('opacity', '0');
        await camera.hover();
        await expect(resize).toHaveCSS('opacity', '1');
        expect(
          await resize.evaluate((button) => getComputedStyle(button).backgroundColor)
        ).not.toBe('rgba(0, 0, 0, 0)');
        const grip = (await resize.boundingBox())!;
        const before = (await camera.boundingBox())!;
        expect(grip.x).toBeGreaterThanOrEqual(0);
        expect(grip.y + grip.height).toBeLessThanOrEqual(size.height + 1);
        expect(
          await resize.evaluate((button) => {
            const rect = button.getBoundingClientRect();
            const root = button.getRootNode();
            return (
              root instanceof ShadowRoot &&
              button.contains(
                root.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
              )
            );
          })
        ).toBe(true);
        const streamId = await preview.evaluate((video: HTMLVideoElement) =>
          video.srcObject instanceof MediaStream ? video.srcObject.id : null
        );
        expect(streamId).not.toBeNull();
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
        await page.mouse.down();
        await page.mouse.move(grip.x + grip.width / 2 + 28, grip.y + grip.height / 2 + 28, {
          steps: 5,
        });
        await page.mouse.up();
        await expect(resize).toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)');
        await expect
          .poll(async () => (await camera.boundingBox())!.width)
          .toBeGreaterThan(before.width + 10);
        const after = (await camera.boundingBox())!;
        expect(after.x).toBeGreaterThanOrEqual(-1);
        expect(after.y).toBeGreaterThanOrEqual(-1);
        expect(after.x + after.width).toBeLessThanOrEqual(size.width + 1);
        expect(after.y + after.height).toBeLessThanOrEqual(size.height + 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          size.width
        );
        expect(after.width / after.height).toBeCloseTo(before.width / before.height, 1);
        expect(
          await preview.evaluate((video: HTMLVideoElement) =>
            video.srcObject instanceof MediaStream ? video.srcObject.id : null
          )
        ).toBe(streamId);
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.local.get('sniptale_video_settings'))[
                  'sniptale_video_settings'
                ].webcamPresentation.sizeFraction
            )
          )
          .toBeGreaterThan(DEFAULT_VIDEO_SETTINGS.webcamPresentation!.sizeFraction);
        await page.screenshot({
          path: info.outputPath('embedded-camera-resize.png'),
          fullPage: false,
        });
        await trigger.click();
        await expect(embedded).toHaveAttribute('aria-pressed', 'true');
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
