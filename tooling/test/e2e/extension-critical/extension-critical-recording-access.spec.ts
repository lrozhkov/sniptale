import { expect, test } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { openRealPopup, sendRuntimeMessage } from '../support/recording-action';

const START = '[data-ui="popup.video-setup.start-recording-button"]';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`recording access refusal and compact confirmation ${viewport.name}`, async ({}, info) => {
    const launched = await launchExtensionBrowser({
      viewport: viewport.size,
      fakeMediaDevices: true,
      autoGrantMediaPermissions: false,
    });
    const { context, browser, extensionId } = launched;
    const session = await browser.newBrowserCDPSession();
    const origin = `chrome-extension://${extensionId}`;
    const access = async (setting: 'denied' | 'granted') => {
      for (const name of ['microphone', 'camera']) {
        await session.send('Browser.setPermission', { origin, permission: { name }, setting });
      }
    };
    try {
      await access('denied');
      let popup = await openRealPopup(context, extensionId);
      await popup.evaluate(
        async (settings) => {
          await chrome.storage.local.set({
            sniptale_video_settings: settings,
            sniptale_video_ui_state: { captureMode: 'CAMERA', viewportPresetId: null },
            'sniptale-locale-preference': 'en',
          });
        },
        {
          ...DEFAULT_VIDEO_SETTINGS,
          microphoneEnabled: true,
          microphoneDeviceId: '',
          webcamEnabled: true,
          webcamDeviceId: '',
          systemAudioEnabled: false,
          warnWithoutMicrophone: true,
        }
      );
      await popup.close();
      popup = await openRealPopup(context, extensionId);
      await popup.locator('[data-ui="popup.app.tabs"] button[data-page="video"]').click();
      const microphone = popup.locator('[data-ui="popup.video.microphone-access"]');
      const camera = popup.locator('[data-ui="popup.video.camera-access"]');
      await expect(microphone).toContainText('Microphone access is blocked');
      await expect(camera).toContainText('Camera access is blocked');
      await expect(popup.getByText('Microphone 1', { exact: true })).toHaveCount(0);
      await expect(popup.getByText('Camera 1', { exact: true })).toHaveCount(0);
      await microphone.locator('[data-ui="popup.video.microphone-request-access"]').click();
      await expect(
        microphone.locator('[data-ui="popup.video.microphone-request-access"]')
      ).toBeEnabled();
      await expect(microphone).toContainText('Microphone access is blocked');
      await popup.locator(START).click();
      await expect(popup.getByText('Microphone access is blocked', { exact: false })).toHaveCount(
        2
      );
      expect(await sendRuntimeMessage(popup, { type: 'GET_RECORDING_STATE' })).toMatchObject({
        success: true,
        state: { status: 'IDLE' },
      });
      await popup.screenshot({
        path: info.outputPath('recording-access-denied.png'),
        fullPage: false,
        animations: 'disabled',
      });

      const opened = context.waitForEvent('page');
      await microphone.locator('[data-ui="popup.video.microphone-open-permissions"]').click();
      const settingsPage = await opened;
      await settingsPage.waitForURL(/settings.*permissions/);
      await settingsPage.close();
      await access('granted');
      await popup.bringToFront();
      await expect(microphone).toHaveCount(0);
      await expect(camera).toHaveCount(0);
      await expect(popup.getByText('Microphone access is blocked', { exact: false })).toHaveCount(
        0
      );
      expect(await sendRuntimeMessage(popup, { type: 'GET_RECORDING_STATE' })).toMatchObject({
        success: true,
        state: { status: 'IDLE' },
      });
      await popup.screenshot({
        path: info.outputPath('recording-access-granted.png'),
        fullPage: false,
        animations: 'disabled',
      });

      expect(
        await popup.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale_video_settings')).sniptale_video_settings
              .microphoneDeviceId
        )
      ).toBe('');
      const microphoneToggle = popup.getByRole('button', { name: 'Microphone', exact: true });
      await microphoneToggle.click();
      await expect(microphoneToggle).toHaveAttribute('aria-pressed', 'false');
      await microphoneToggle.click();
      await expect(microphoneToggle).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(() =>
          popup.evaluate(
            async () =>
              (await chrome.storage.local.get('sniptale_video_settings')).sniptale_video_settings
                .microphoneDeviceId
          )
        )
        .toEqual(expect.stringMatching(/.+/u));

      await popup.evaluate(async () => {
        const stored = await chrome.storage.local.get('sniptale_video_settings');
        await chrome.storage.local.set({
          sniptale_video_settings: {
            ...stored.sniptale_video_settings,
            microphoneEnabled: false,
            warnWithoutMicrophone: true,
          },
        });
      });
      await popup.close();
      popup = await openRealPopup(context, extensionId);
      await popup.locator('[data-ui="popup.app.tabs"] button[data-page="video"]').click();
      const geometry = await popup.locator('[data-ui="popup.app.root"]').evaluate((root) => ({
        height: root.scrollHeight,
        width: root.scrollWidth,
      }));
      const pageCount = context.pages().length;
      await popup.locator(START).click();
      const dialog = popup.getByRole('dialog', { name: 'Start recording without a microphone?' });
      const checkbox = dialog.getByRole('checkbox', { name: 'Don’t ask again' });
      await expect(dialog).toBeVisible();
      expect(context.pages()).toHaveLength(pageCount);
      expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(true);
      expect(
        await popup.locator('[data-ui="popup.app.root"]').evaluate((root) => ({
          height: root.scrollHeight,
          width: root.scrollWidth,
        }))
      ).toEqual(geometry);
      await checkbox.check();
      expect(await checkbox.evaluate((element) => element.matches(':focus-visible'))).toBe(false);
      const checkboxStyle = await checkbox.evaluate((element) => {
        const style = getComputedStyle(element);
        return { radius: Number.parseFloat(style.borderRadius), width: element.clientWidth };
      });
      expect(checkboxStyle.radius).toBeGreaterThanOrEqual(checkboxStyle.width / 2);
      const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
      expect((await cancel.boundingBox())?.height).toBeLessThanOrEqual(36);
      const checkboxBox = await checkbox.boundingBox();
      const cancelBox = await cancel.boundingBox();
      expect(
        Math.abs(checkboxBox!.y + checkboxBox!.height / 2 - (cancelBox!.y + cancelBox!.height / 2))
      ).toBeLessThanOrEqual(1);
      await popup.screenshot({
        path: info.outputPath('recording-without-microphone-modal.png'),
        fullPage: false,
        animations: 'disabled',
      });
      await popup.keyboard.press('Tab');
      await expect(cancel).toBeFocused();
      await popup.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
      await popup.keyboard.press('Tab');
      await expect(checkbox).toBeFocused();
      expect(await checkbox.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
      for (const width of [1100, 391, 392, 393, 392]) {
        await popup.setViewportSize({ width, height: 560 });
        expect(
          await popup.evaluate(() => document.documentElement.scrollWidth)
        ).toBeLessThanOrEqual(Math.max(width, geometry.width));
        const panel = await dialog.locator('.sniptale-modal').boundingBox();
        expect(panel?.x).toBeGreaterThanOrEqual(0);
        expect((panel?.x ?? 0) + (panel?.width ?? 0)).toBeLessThanOrEqual(width);
      }
      await popup.screenshot({
        path: info.outputPath('recording-modal-popup-width.png'),
        fullPage: false,
        animations: 'disabled',
      });
      await popup.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(popup.locator(START)).toBeFocused();
      expect(await sendRuntimeMessage(popup, { type: 'GET_RECORDING_STATE' })).toMatchObject({
        success: true,
        state: { status: 'IDLE' },
      });
    } finally {
      await session.detach();
      await closeExtensionBrowser(launched);
    }
  });
}
