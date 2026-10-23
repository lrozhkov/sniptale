import { expect, test } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { translate, type AppLocale } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { evaluateInTarget, triggerExtensionAction } from '../support/recording-action';

test.setTimeout(90000);

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`microphone recording gain ${name} ${orientation}`, async ({}, info) => {
      const locale: AppLocale = size.width === 1280 ? 'en' : 'ru';
      const host = await startHostServer();
      const browser = await launchExtensionBrowser({
        viewport: size,
        fakeMediaDevices: true,
        autoGrantMediaPermissions: false,
      });
      await browser.context.grantPermissions(['microphone']);
      try {
        const { page, popup } = await openDesignReview(
          browser.context,
          browser.extensionId,
          host.origin,
          size
        );
        await popup.evaluate(
          async ({ settings, locale, dark }) => {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const deviceId = stream.getAudioTracks()[0]!.getSettings().deviceId;
            stream.getTracks().forEach((track) => track.stop());
            await chrome.storage.local.set({
              sniptale_video_settings: {
                ...settings,
                microphoneEnabled: true,
                microphoneDeviceId: deviceId,
                microphoneGain: 1,
                countdownSeconds: 0,
                systemAudioEnabled: false,
                warnWithoutMicrophone: false,
                qualityProfileId: null,
              },
              'sniptale-theme-preference': dark ? 'dark' : 'light',
              'sniptale-locale-preference': locale,
            });
          },
          {
            settings: {
              ...DEFAULT_VIDEO_SETTINGS,
              outputProfile: {
                ...DEFAULT_VIDEO_SETTINGS.outputProfile,
                resolution: VideoResolutionPreset.P240,
              },
            },
            locale,
            dark: size.width === 1920,
          }
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
        const trigger = page.locator('[data-ui="content.toolbar.video-recording.microphone.menu"]');
        await trigger.click();
        const menu = page.locator(
          '[data-ui="content.toolbar.video-recording.microphone.dropdown"]'
        );
        const volume = menu.getByRole('textbox', {
          name: translate('popup.video.microphoneGainLabel', locale),
          exact: true,
        });
        await expect(volume).toHaveValue('100');
        await volume.fill('150');
        await volume.press('Enter');
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.local.get('sniptale_video_settings')).sniptale_video_settings
                  .microphoneGain
            )
          )
          .toBe(1.5);
        await expect(volume).toHaveValue('150');
        await expect(menu.getByRole('button', { name: /Fake/iu }).first()).toBeVisible();
        const list = menu.locator('.sniptale-toolbar-menu-list');
        const overflow = await list.evaluate((element) => ({
          height: element.clientHeight,
          contentHeight: element.scrollHeight,
          width: element.clientWidth,
          contentWidth: element.scrollWidth,
        }));
        expect(overflow.contentHeight, JSON.stringify(overflow)).toBeLessThanOrEqual(
          overflow.height
        );
        expect(overflow.contentWidth).toBeLessThanOrEqual(overflow.width);
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await page.screenshot({ path: info.outputPath('microphone-volume.png'), fullPage: false });
        const bounds = await menu.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height);
        await page.keyboard.press('Escape');
        await trigger.click();
        await expect(volume).toHaveValue('150');
        await volume.fill('0');
        await volume.press('Enter');
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.local.get('sniptale_video_settings')).sniptale_video_settings
                  .microphoneGain
            )
          )
          .toBe(0);
        await page.keyboard.press('Escape');
        const action = await triggerExtensionAction(browser.context, browser.extensionId, page);
        await evaluateInTarget(browser.context, action, 'window.close()').catch(() => undefined);
        await page.bringToFront();
        const session = await browser.context.browser()!.newBrowserCDPSession();
        const targets = await session.send('Target.getTargets');
        const offscreen = targets.targetInfos.find((target) => target.url.includes('/offscreen/'))!;
        await session.detach();
        await evaluateInTarget(
          browser.context,
          offscreen.targetId,
          `(() => {
          globalThis.__microphoneGainNodes = [];
          const createGain = AudioContext.prototype.createGain;
          AudioContext.prototype.createGain = function () {
            const gain = createGain.call(this);
            globalThis.__microphoneGainNodes.push(gain);
            return gain;
          };
        })()`
        );
        await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
        const stop = page.locator('[data-ui="content.toolbar.video-recording.stop"]');
        await expect(stop).toBeVisible({ timeout: 20000 });
        await trigger.click();
        await volume.fill('125');
        await volume.press('Enter');
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.local.get('sniptale_video_settings')).sniptale_video_settings
                  .microphoneGain
            )
          )
          .toBe(1.25);
        await expect(stop).toBeVisible();
        await expect
          .poll(() =>
            evaluateInTarget(
              browser.context,
              offscreen.targetId,
              'globalThis.__microphoneGainNodes.map(node => node.gain.value)'
            )
          )
          .toContain(1.25);
        await page.screenshot({
          path: info.outputPath('microphone-volume-recording.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await stop.click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.start"]')).toBeVisible(
          { timeout: 20000 }
        );
        await evaluateInTarget(
          browser.context,
          offscreen.targetId,
          `(() => {
          const enumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
          navigator.mediaDevices.enumerateDevices = async () => (await enumerate()).flatMap(device =>
            device.kind === 'audioinput' ? Array.from({ length: 8 }, (_, index) => ({
              deviceId: device.deviceId + '-' + index,
              kind: device.kind,
              groupId: device.groupId,
              label: device.label + ' ' + index,
            })) : [device]);
        })()`
        );
        await trigger.click();
        await expect(menu.getByRole('button', { name: /Fake/iu })).toHaveCount(24);
        const longList = menu.locator('.sniptale-toolbar-menu-list');
        expect(
          await longList.evaluate((element) => element.scrollHeight > element.clientHeight)
        ).toBe(true);
        await volume.scrollIntoViewIfNeeded();
        await expect(volume).toBeVisible();
        const longBounds = await menu.boundingBox();
        expect(longBounds!.y).toBeGreaterThanOrEqual(0);
        expect(longBounds!.y + longBounds!.height).toBeLessThanOrEqual(size.height);
        await page.screenshot({
          path: info.outputPath('microphone-long-list.png'),
          fullPage: false,
        });
      } finally {
        await closeExtensionBrowser(browser);
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
