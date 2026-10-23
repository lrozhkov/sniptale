import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { RECORDING_TOOLBAR_CONTROLS } from '../../../../apps/extension/src/contracts/settings';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import { triggerExtensionAction } from '../support/recording-action';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

test.setTimeout(120000);
test.use({ actionTimeout: 10000 });

async function expectPointerDepartureFade(page: Page, info: TestInfo, name: string) {
  const toolbar = page.locator('[data-ui="content.toolbar.root"]');
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width - 4, viewport.height - 4);
  await expect
    .poll(() => toolbar.evaluate((element) => Number(getComputedStyle(element).opacity)))
    .toBeCloseTo(0.2, 2);
  await page.screenshot({ path: info.outputPath(name), fullPage: false });
  await toolbar.hover();
  await expect
    .poll(() => toolbar.evaluate((element) => Number(getComputedStyle(element).opacity)))
    .toBe(1);
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`recording temporary reveal ${name} ${orientation}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      try {
        const { page, popup } = await openDesignReview(
          launched.context,
          launched.extensionId,
          host.origin,
          size
        );
        await popup.evaluate(
          async ({ defaults, hidden, theme }) => {
            await chrome.storage.local.set({
              'sniptale-theme-preference': theme,
              sniptale_video_settings: {
                ...defaults,
                microphoneEnabled: false,
                webcamEnabled: false,
                systemAudioEnabled: false,
                warnWithoutMicrophone: false,
                countdownSeconds: 0,
                qualityProfileId: null,
              },
            });
            const stored = await chrome.storage.sync.get('sniptale_settings');
            await chrome.storage.sync.set({
              sniptale_settings: {
                ...stored.sniptale_settings,
                contentToolbar: {
                  ...stored.sniptale_settings?.contentToolbar,
                  recordingControls: hidden,
                },
              },
            });
          },
          {
            defaults: {
              ...DEFAULT_VIDEO_SETTINGS,
              outputProfile: {
                ...DEFAULT_VIDEO_SETTINGS.outputProfile,
                resolution: VideoResolutionPreset.P240,
              },
            },
            hidden: Object.fromEntries(
              RECORDING_TOOLBAR_CONTROLS.map((control) => [control, false])
            ),
            theme: size.width === 1920 ? 'dark' : 'light',
          }
        );
        const control = (name: string) =>
          page.locator(`[data-ui="content.toolbar.video-recording.${name}"]`);
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
        const toolbar = page.locator('[data-ui="content.toolbar.root"]');
        const saved = await popup.evaluate(
          async () =>
            (await chrome.storage.sync.get('sniptale_settings')).sniptale_settings.contentToolbar
              .recordingControls
        );
        await expect(control('reveal-controls')).toHaveCount(0);
        await triggerExtensionAction(launched.context, launched.extensionId, page);
        await page.bringToFront();
        await control('start').click();
        await expect(control('pause')).toBeVisible({ timeout: 30000 });
        const reveal = control('reveal-controls');
        await expect(reveal).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('[data-ui="content.toolbar.drawing.pencil"]')).toHaveCount(0);
        expect(await toolbar.locator('button[data-ui]').first().getAttribute('data-ui')).toBe(
          'content.toolbar.video-recording.reveal-controls'
        );
        const compactBounds = (await reveal.boundingBox())!;
        const standardBounds = (await control('navigation').boundingBox())!;
        expect(Math.abs(compactBounds.width * 2 - standardBounds.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(compactBounds.height - standardBounds.height)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: info.outputPath('collapsed.png'), fullPage: false });
        await reveal.click();
        await expect(reveal).toHaveAttribute('aria-expanded', 'true');
        await expectPointerDepartureFade(page, info, 'revealed-pointer-departure.png');
        for (const name of ['microphone.toggle', 'camera.toggle', 'eraser', 'clear', 'spotlight'])
          await expect(control(name)).toBeVisible();
        for (const name of ['customize', 'auto-hide']) await expect(control(name)).toHaveCount(0);
        await expect(page.locator('[data-ui="content.toolbar.settings-button"]')).toHaveCount(0);
        await expect(page.locator('[data-ui="content.toolbar.mode-selector-button"]')).toHaveCount(
          0
        );
        const pencil = page.locator('[data-ui="content.toolbar.drawing.pencil"]');
        await pencil.click();
        await expect(pencil).toHaveAttribute('aria-pressed', 'true');
        await control('navigation').click();
        await page.screenshot({ path: info.outputPath('revealed.png'), fullPage: false });
        if (orientation === 'horizontal' && size.width === 1280) {
          await page.setViewportSize({ width: 1000, height: size.height });
          await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
            .toBe(true);
          await page.setViewportSize(size);
        }
        await control('pause').click();
        await expect(control('resume')).toBeVisible();
        await expect(reveal).toHaveAttribute('aria-expanded', 'true');
        await control('resume').click();
        await expect(control('pause')).toBeVisible();
        await reveal.focus();
        await page.keyboard.press('Enter');
        await expect(reveal).toHaveAttribute('aria-expanded', 'false');
        await expect(reveal).toBeFocused();
        await expect(pencil).toHaveCount(0);
        await page.keyboard.press('Space');
        await expect(reveal).toHaveAttribute('aria-expanded', 'true');
        expect(
          await popup.evaluate(
            async () =>
              (await chrome.storage.sync.get('sniptale_settings')).sniptale_settings.contentToolbar
                .recordingControls
          )
        ).toEqual(saved);
        await control('stop').click();
        await expect(control('start')).toBeVisible({ timeout: 30000 });
        await expect(reveal).toHaveCount(0);
        await triggerExtensionAction(launched.context, launched.extensionId, page);
        await page.bringToFront();
        await control('start').click();
        await expect(control('pause')).toBeVisible({ timeout: 30000 });
        await expect(reveal).toHaveAttribute('aria-expanded', 'false');
        await control('stop').click();
        await expect(control('start')).toBeVisible({ timeout: 30000 });
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`recording fades after pointer color selection ${name}`, async ({}, info) => {
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({ viewport: size });
    try {
      const { page, popup } = await openDesignReview(
        launched.context,
        launched.extensionId,
        host.origin,
        size
      );
      await popup.evaluate(
        async (defaults) => {
          await chrome.storage.local.set({
            'sniptale-theme-preference': innerWidth > 1280 ? 'dark' : 'light',
            sniptale_video_settings: {
              ...defaults,
              microphoneEnabled: false,
              webcamEnabled: false,
              systemAudioEnabled: false,
              warnWithoutMicrophone: false,
              countdownSeconds: 0,
              qualityProfileId: null,
            },
          });
        },
        {
          ...DEFAULT_VIDEO_SETTINGS,
          outputProfile: {
            ...DEFAULT_VIDEO_SETTINGS.outputProfile,
            resolution: VideoResolutionPreset.P240,
          },
        }
      );
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
      await triggerExtensionAction(launched.context, launched.extensionId, page);
      await page.bringToFront();
      await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
      await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toBeVisible({
        timeout: 30000,
      });
      await page.locator('[data-ui="content.toolbar.drawing.pencil"]').click();
      const colors = page.locator('[data-ui="content.toolbar.drawing-options.quick-colors"]');
      await colors.getByRole('button').first().click();
      await expectPointerDepartureFade(page, info, 'color-pointer-departure.png');
      const navigation = page.locator('[data-ui="content.toolbar.video-recording.navigation"]');
      await navigation.click();
      await navigation.focus();
      await page.keyboard.press('Tab');
      await page.mouse.move(size.width - 4, size.height - 4);
      const toolbar = page.locator('[data-ui="content.toolbar.root"]');
      await expect
        .poll(() => toolbar.evaluate((element) => Number(getComputedStyle(element).opacity)))
        .toBe(1);
      await page.getByRole('button', { name: 'Host action', exact: true }).click();
      await expectPointerDepartureFade(page, info, 'keyboard-focus-released.png');
      await page.locator('[data-ui="content.toolbar.video-recording.spotlight"]').click();
      await page.mouse.move(size.width - 4, size.height - 4);
      await expect(toolbar).toHaveAttribute('data-menu-open', 'true');
      await expect
        .poll(() => toolbar.evaluate((element) => Number(getComputedStyle(element).opacity)))
        .toBe(1);
      await page.locator('[data-ui="content.toolbar.video-recording.spotlight"]').click();
      await expectPointerDepartureFade(page, info, 'menu-closed.png');
      await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
      await expect(page.locator('[data-ui="content.toolbar.video-recording.start"]')).toBeVisible({
        timeout: 30000,
      });
    } finally {
      await closeExtensionBrowser(launched);
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
