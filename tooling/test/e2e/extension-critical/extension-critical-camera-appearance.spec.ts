import { expect, test, type Locator } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { translate, type AppLocale } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

test.setTimeout(90000);

async function chooseShape(surface: Locator, name: string, label: string) {
  const segment = surface.getByRole('button', { name, exact: true });
  if (await segment.isVisible()) await segment.click();
  else {
    await surface.getByRole('button', { name: label, exact: true }).click();
    await surface.page().getByRole('option', { name, exact: true }).click();
  }
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`page camera appearance ${name} ${orientation}`, async ({}, info) => {
      const locale: AppLocale = size.width === 1280 ? 'en' : 'ru';
      const text = (key: Parameters<typeof translate>[0]) => translate(key, locale);
      const host = await startHostServer();
      const browser = await launchExtensionBrowser({ viewport: size, fakeMediaDevices: true });
      try {
        const { page, popup } = await openDesignReview(
          browser.context,
          browser.extensionId,
          host.origin,
          size
        );
        await popup.evaluate(
          async ({ settings, locale, dark }) => {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const deviceId = stream.getVideoTracks()[0]!.getSettings().deviceId;
            stream.getTracks().forEach((track) => track.stop());
            await chrome.storage.local.set({
              sniptale_video_settings: {
                ...settings,
                webcamEnabled: true,
                webcamDeviceId: deviceId,
                microphoneEnabled: false,
                webcamPresentation: {
                  ...settings.webcamPresentation!,
                  mode: 'embedded',
                  dockPosition: 'se',
                },
              },
              'sniptale-theme-preference': dark ? 'dark' : 'light',
              'sniptale-locale-preference': locale,
            });
          },
          { settings: DEFAULT_VIDEO_SETTINGS, locale, dark: size.width === 1920 }
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        if (orientation === 'vertical') {
          await page.locator('[data-ui="content.toolbar.settings-button"]').click();
          const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
          if (!(await vertical.isVisible()))
            await page
              .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
              .click();
          await vertical.click();
          await page.keyboard.press('Escape');
        }
        await page.evaluate(() => {
          document.documentElement.style.overflow = 'scroll';
          const content = document.createElement('div');
          content.style.cssText = 'width:2500px;height:1800px';
          document.body.append(content);
        });
        const viewport = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        }));
        expect(viewport.width).toBeLessThan(size.width);
        expect(viewport.height).toBeLessThan(size.height);
        const camera = page.locator('[data-ui="content.video-recording.embedded-camera"]');
        const video = camera.locator('video');
        await expect
          .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState))
          .toBeGreaterThanOrEqual(2);
        const streamId = await video.evaluate(
          (element: HTMLVideoElement) => (element.srcObject as MediaStream).id
        );
        await expect
          .poll(async () => {
            await page.locator('[data-ui="content.toolbar.video-recording.camera.menu"]').click();
            const anchoredBounds = (await camera.boundingBox())!;
            const freeControl = page.getByRole('switch', {
              name: text('popup.video.webcamFreePlacement'),
              exact: true,
            });
            await freeControl.click();
            await expect
              .poll(async () => (await camera.boundingBox())!.x)
              .toBeCloseTo(anchoredBounds.x, 0);
            await expect
              .poll(async () => (await camera.boundingBox())!.y)
              .toBeCloseTo(anchoredBounds.y, 0);
            await freeControl.click();
            await page.keyboard.press('Escape');
            const bounds = (await camera.boundingBox())!;
            return Math.round(viewport.width - bounds.x - bounds.width);
          })
          .toBe(12);
        const bounds = (await camera.boundingBox())!;
        expect(viewport.height - bounds.y - bounds.height).toBeCloseTo(12, 0);
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width / 2 - 12, bounds.y + bounds.height / 2 - 12);
        const marker = page.locator('[data-ui="content.video-recording.camera-dock.se"]');
        await expect(marker).toBeVisible();
        const markerBounds = (await marker.boundingBox())!;
        expect(viewport.width - markerBounds.x - markerBounds.width).toBeGreaterThanOrEqual(10);
        expect(viewport.height - markerBounds.y - markerBounds.height).toBeGreaterThanOrEqual(10);
        await page.screenshot({
          path: info.outputPath('scrollbar-dock-guides.png'),
          fullPage: false,
        });
        await page.mouse.up();
        await page.locator('[data-ui="content.toolbar.video-recording.camera.menu"]').click();
        const controls = page.locator('[data-ui="recording.camera.appearance"]');
        await expect(controls).toBeVisible();
        expect(
          await controls.evaluate((element) => {
            const list = element.closest('.sniptale-toolbar-menu-list')!;
            return list.scrollWidth - list.clientWidth;
          })
        ).toBeLessThanOrEqual(1);
        await chooseShape(
          controls,
          text('popup.video.webcamPresentationRectangle'),
          text('popup.video.webcamPresentationShapeLabel')
        );
        const roundness = controls.getByRole('textbox', {
          name: text('popup.video.webcamPresentationRoundness'),
          exact: true,
        });
        await roundness.fill('60');
        await roundness.press('Enter');
        await expect(camera.locator(':scope > div')).toHaveCSS('border-radius', '30%');
        await chooseShape(
          controls,
          text('popup.video.webcamPresentationCircle'),
          text('popup.video.webcamPresentationShapeLabel')
        );
        await expect(camera.locator(':scope > div')).toHaveCSS('border-radius', '50%');
        await chooseShape(
          controls,
          text('popup.video.webcamPresentationSoft'),
          text('popup.video.webcamPresentationShapeLabel')
        );
        await expect(camera.locator(':scope > div')).toHaveCSS('clip-path', /^polygon\(/);
        await controls
          .getByRole('switch', { name: text('popup.video.webcamPresentationMirror'), exact: true })
          .click();
        await expect(video).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
        const horizontalCrop = controls.getByRole('textbox', {
          name: text('popup.video.webcamPresentationCropHorizontal'),
          exact: true,
        });
        for (const offset of ['-100', '100', '0']) {
          await horizontalCrop.fill(offset);
          await horizontalCrop.press('Enter');
          await expect(video).toHaveCSS('object-position', `${50 + Number(offset) / 2}% 50%`);
          const maskBounds = (await camera.locator(':scope > div').boundingBox())!;
          const videoBounds = (await video.boundingBox())!;
          expect(videoBounds.x).toBeLessThanOrEqual(maskBounds.x + 3);
          expect(videoBounds.x + videoBounds.width).toBeGreaterThanOrEqual(
            maskBounds.x + maskBounds.width - 3
          );
        }
        const zoom = controls.getByRole('textbox', {
          name: text('popup.video.webcamPresentationZoom'),
          exact: true,
        });
        await zoom.fill('175');
        await zoom.press('Enter');
        await expect(video).toHaveCSS('transform', 'matrix(-1.75, 0, 0, 1.75, 0, 0)');
        await controls
          .getByRole('switch', { name: text('popup.video.webcamPresentationShadow'), exact: true })
          .click();
        await expect(camera).toHaveCSS('filter', 'none');
        expect(
          await video.evaluate((element: HTMLVideoElement) => (element.srcObject as MediaStream).id)
        ).toBe(streamId);
        await controls
          .getByRole('switch', { name: text('popup.video.webcamFreePlacement'), exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('toolbar-camera-appearance.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await popup.reload();
        await popup.locator('[data-ui="popup.app.tabs"] button[data-page="video"]').click();
        await popup
          .getByRole('button', { name: text('popup.video.webcamSettingsActionAria'), exact: true })
          .click();
        const popupControls = popup.locator('[data-ui="recording.camera.appearance"]');
        const free = popupControls.getByRole('switch', {
          name: text('popup.video.webcamFreePlacement'),
          exact: true,
        });
        await expect(free).toHaveClass(/sniptale-glass-switch/u);
        await expect(free).toHaveCSS('width', '40px');
        await expect(free).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await free.click();
        await expect(free).toHaveAttribute('aria-checked', 'true');
        await chooseShape(
          popupControls,
          text('popup.video.webcamPresentationEllipse'),
          text('popup.video.webcamPresentationShapeLabel')
        );
        await expect(popup.locator('[data-ui="popup.video.webcam-preview-mask"]')).toHaveCSS(
          'border-radius',
          '50%'
        );
        await popup.screenshot({
          path: info.outputPath('popup-camera-appearance.png'),
          fullPage: false,
        });
        await page.bringToFront();
        await page.locator('[data-ui="content.toolbar.video-recording.camera.menu"]').click();
        await expect(camera.locator(':scope > div')).toHaveCSS('clip-path', 'none');
        await popupControls
          .getByRole('switch', { name: text('popup.video.webcamPresentationShadow'), exact: true })
          .click();
        const shadowColor = popupControls.locator(
          '[data-ui="shared.ui.compact-inspector.color-field"]'
        );
        await shadowColor.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
        await expect(popup.locator('[data-floating-ui-root]')).toBeVisible();
        await popup.keyboard.press('Escape');
        await expect(popup.locator('[data-floating-ui-root]')).toHaveCount(0);
        await expect(popupControls).toBeVisible();
        await shadowColor.locator('[data-ui="shared.ui.color-selector.value-trigger"]').click();
        const hex = shadowColor.getByRole('textbox', {
          name: text('popup.video.webcamPresentationShadowColor'),
          exact: true,
        });
        await hex.fill('#abcdef');
        await hex.press('Escape');
        await expect(hex).toHaveCount(0);
        await expect(
          shadowColor.locator('[data-ui="shared.ui.color-selector.value-trigger"]')
        ).toHaveText('#000000');
        await expect(popupControls).toBeVisible();
        await popup.keyboard.press('Escape');
        await expect(popupControls).toHaveCount(0);
        await popup
          .getByRole('button', { name: text('popup.video.webcamSettingsActionAria'), exact: true })
          .click();
        await popup
          .getByRole('button', {
            name: text('popup.video.webcamPresentationSeparateTrack'),
            exact: true,
          })
          .click();
        await expect(popupControls).toHaveCount(0);
        await expect(popup.locator('[data-ui="popup.video.webcam-preview-mask"] video')).toHaveCSS(
          'transform',
          'none'
        );
      } finally {
        await closeExtensionBrowser(browser);
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
