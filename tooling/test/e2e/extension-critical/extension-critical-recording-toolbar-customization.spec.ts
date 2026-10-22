import { expect, test } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { RECORDING_TOOLBAR_CONTROLS } from '../../../../apps/extension/src/contracts/settings';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  evaluateInTarget,
  sendRuntimeMessage,
  triggerExtensionAction,
} from '../support/recording-action';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

test.setTimeout(120000);
test.use({ actionTimeout: 10000 });

for (const { name, size } of [
  ...PRIMARY_BROWSER_VIEWPORTS,
  { name: '960x560', size: { width: 960, height: 560 } },
]) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    if (size.width < 1280 && orientation === 'vertical') continue;
    test(`recording controls customization ${name} ${orientation}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      const diagnostics: string[] = [];
      launched.context.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error') {
          diagnostics.push(message.text().slice(0, 2000));
        }
      });
      try {
        const { page, popup } = await openDesignReview(
          launched.context,
          launched.extensionId,
          host.origin,
          size
        );
        await popup.evaluate(
          async ({ defaults, dark }) => {
            await chrome.storage.local.set({
              sniptale_video_settings: {
                ...defaults,
                microphoneEnabled: false,
                webcamEnabled: false,
                systemAudioEnabled: false,
                warnWithoutMicrophone: false,
                countdownSeconds: 0,
                qualityProfileId: null,
                outputProfile: defaults.outputProfile,
              },
              'sniptale-theme-preference': dark ? 'dark' : 'light',
              'sniptale-locale-preference': dark ? 'ru' : 'en',
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
            dark: size.width === 1920,
          }
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        const action = await triggerExtensionAction(launched.context, launched.extensionId, page);
        await evaluateInTarget(launched.context, action, 'window.close()').catch(() => undefined);
        await page.bringToFront();
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
        const bounds = await toolbar.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(-1);
        expect(bounds!.y).toBeGreaterThanOrEqual(-1);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width + 1);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        ).toBe(true);
        const customize = page.locator('[data-ui="content.toolbar.video-recording.customize"]');
        await expect(customize).toBeEnabled();
        await customize.click();
        await expect(customize).toHaveAttribute('aria-pressed', 'true');
        await expect(
          page.locator('[data-ui="content.toolbar.mode-selector-button"]')
        ).toBeDisabled();
        for (const control of RECORDING_TOOLBAR_CONTROLS) {
          const toggle = page.locator(
            `[data-ui="content.toolbar.video-recording.visibility.${control}"]`
          );
          await expect(toggle).toHaveAttribute('aria-pressed', 'true');
          await toggle.click();
          await expect(toggle).toHaveAttribute('aria-pressed', 'false');
          expect(await toggle.evaluate((button) => button.matches(':focus-visible'))).toBe(false);
        }
        await page.evaluate(async () => document.fonts.ready);
        await page.screenshot({
          path: info.outputPath('customizing-controls.png'),
          fullPage: false,
        });
        await customize.click();
        await expect(page.locator('[data-ui="content.toolbar.drawing.pencil"]')).toBeVisible();
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.camera.toggle"]')
        ).toBeVisible();
        const saved = await popup.evaluate(async () => {
          const stored = await chrome.storage.sync.get('sniptale_settings');
          return stored['sniptale_settings'].contentToolbar.recordingControls;
        });
        expect(saved).toEqual(
          Object.fromEntries(RECORDING_TOOLBAR_CONTROLS.map((control) => [control, false]))
        );
        await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
        const pause = page.locator('[data-ui="content.toolbar.video-recording.pause"]');
        try {
          await expect(pause).toBeVisible({ timeout: 30000 });
        } catch (error) {
          await info.attach('recording-start-diagnostics', {
            body: JSON.stringify(
              {
                state: await sendRuntimeMessage(popup, {
                  type: VideoMessageType.GET_RECORDING_STATE,
                }),
                diagnostics,
              },
              null,
              2
            ),
            contentType: 'application/json',
          });
          throw error;
        }
        await expect(customize).toHaveCount(0);
        await expect(page.locator('[data-ui="content.toolbar.mode-selector-button"]')).toHaveCount(
          0
        );
        await expect(page.locator('[data-ui="content.toolbar.settings-button"]')).toHaveCount(0);
        await expect(page.locator('[data-ui="content.toolbar.drawing.pencil"]')).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.microphone.toggle"]')
        ).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.camera.toggle"]')
        ).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.auto-hide"]')
        ).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.navigation"]')
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath('compact-recording-controls.png'),
          fullPage: false,
        });
        await pause.click();
        const resume = page.locator('[data-ui="content.toolbar.video-recording.resume"]');
        await expect(resume).toBeVisible();
        await resume.click();
        await expect(pause).toBeVisible();
        await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.start"]')).toBeVisible(
          { timeout: 30000 }
        );
        await expect(customize).toBeVisible();
        await expect(page.locator('[data-ui="content.toolbar.drawing.pencil"]')).toBeVisible();
        await expect(page.locator('[data-ui="content.toolbar.settings-button"]')).toBeVisible();
        await page.screenshot({
          path: info.outputPath('restored-idle-controls.png'),
          fullPage: false,
        });
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        await expect(customize).toBeEnabled();
        await customize.click();
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.visibility.pencil"]')
        ).toHaveAttribute('aria-pressed', 'false');
        const text = page.locator('[data-ui="content.toolbar.video-recording.visibility.text"]');
        await text.focus();
        await page.keyboard.press('Enter');
        await expect(text).toHaveAttribute('aria-pressed', 'true');
        await customize.click();
        const media = await popup.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale_video_settings'))['sniptale_video_settings']
        );
        expect(media.microphoneEnabled).toBe(false);
        expect(media.webcamEnabled).toBe(false);
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
