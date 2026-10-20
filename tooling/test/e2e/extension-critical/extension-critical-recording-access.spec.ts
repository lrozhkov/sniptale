import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import {
  evaluateInTarget,
  openRealPopup,
  sendRuntimeMessage,
  triggerExtensionAction,
} from '../support/recording-action';

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
      await expect(popup.locator('[data-ui$="-request-access"]')).toHaveCount(0);
      await popup.setViewportSize({ width: 392, height: 560 });
      await microphone
        .locator('[data-ui="popup.video.microphone-open-permissions"]')
        .scrollIntoViewIfNeeded();
      await expect(
        microphone.locator('[data-ui="popup.video.microphone-open-permissions"]')
      ).toBeVisible();
      expect(await popup.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        392
      );
      await popup.screenshot({
        path: info.outputPath('missing-access-popup-width.png'),
        fullPage: false,
        animations: 'disabled',
      });
      await popup.setViewportSize(viewport.size);
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
      const microphoneCard = settingsPage.locator('[data-ui="settings.permissions.microphone"]');
      await expect(
        microphoneCard.getByRole('button', { name: 'Open browser settings' })
      ).toBeVisible();
      const browserSettingsOpened = context.waitForEvent('page');
      await microphoneCard.getByRole('button', { name: 'Open browser settings' }).click();
      const browserSettings = await browserSettingsOpened;
      await browserSettings.waitForURL('chrome://settings/content/microphone');
      await browserSettings.close();
      await settingsPage.bringToFront();
      await settingsPage.screenshot({
        path: info.outputPath('blocked-media-permission-recovery.png'),
        fullPage: false,
        animations: 'disabled',
      });
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

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`action popup toggles request matching media access once in Settings ${viewport.name}`, async ({}, info) => {
    const launched = await launchExtensionBrowser({
      viewport: viewport.size,
      fakeMediaDevices: true,
      autoGrantMediaPermissions: false,
    });
    const { context, browser, extensionId } = launched;
    const session = await browser.newBrowserCDPSession();
    const origin = `chrome-extension://${extensionId}`;
    try {
      for (const name of ['microphone', 'camera']) {
        await session.send('Browser.setPermission', {
          origin,
          permission: { name },
          setting: 'prompt',
        });
      }
      const seed = await openRealPopup(context, extensionId);
      await seed.evaluate(
        async (settings) => {
          await chrome.storage.local.set({
            sniptale_video_settings: settings,
            sniptale_video_ui_state: { captureMode: 'SCREEN', viewportPresetId: null },
            'sniptale-locale-preference': 'en',
          });
        },
        { ...DEFAULT_VIDEO_SETTINGS, microphoneEnabled: false, webcamEnabled: false }
      );
      await seed.close();
      const target = await context.newPage();
      await target.goto('about:blank');
      await context.addInitScript(() => {
        const original = navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
        if (!original) return;
        Reflect.set(globalThis, '__permissionRequests', []);
        Reflect.set(globalThis, '__permissionRequestSettled', 0);
        navigator.mediaDevices.getUserMedia = (constraints) => {
          const requests: unknown = Reflect.get(globalThis, '__permissionRequests');
          if (Array.isArray(requests)) {
            requests.push({
              audio: Boolean(constraints?.audio),
              video: Boolean(constraints?.video),
            });
          }
          return original(constraints).finally(() => {
            const settled = Reflect.get(globalThis, '__permissionRequestSettled');
            Reflect.set(
              globalThis,
              '__permissionRequestSettled',
              typeof settled === 'number' ? settled + 1 : 1
            );
          });
        };
      });
      let settings: Awaited<ReturnType<typeof context.newPage>> | undefined;
      for (const name of ['microphone', 'camera']) {
        await target.bringToFront();
        const popupTarget = await triggerExtensionAction(context, extensionId, target);
        const clickPopupControl = async (selector: string) => {
          await expect
            .poll(() =>
              evaluateInTarget(
                context,
                popupTarget,
                `Boolean(document.querySelector(${JSON.stringify(selector)}))`
              )
            )
            .toBe(true);
          const point = z
            .object({ x: z.number(), y: z.number() })
            .parse(
              await evaluateInTarget(
                context,
                popupTarget,
                `(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.scrollIntoView({block:'center'});const rect=element.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`
              )
            );
          const attached = await session.send('Target.attachToTarget', {
            targetId: popupTarget,
            flatten: false,
          });
          try {
            for (const type of ['mousePressed', 'mouseReleased']) {
              const commandId = type === 'mousePressed' ? 1 : 2;
              let timeout: ReturnType<typeof setTimeout> | undefined;
              let removeListener = () => {};
              const reply = new Promise<void>((resolve, reject) => {
                const listener = (event: { sessionId: string; message: string }) => {
                  if (event.sessionId !== attached.sessionId) return;
                  try {
                    const result = z
                      .object({ id: z.number().optional(), error: z.unknown().optional() })
                      .parse(JSON.parse(event.message));
                    if (result.id !== commandId) return;
                    if (result.error)
                      reject(
                        new Error(`Action popup input failed: ${JSON.stringify(result.error)}`)
                      );
                    else resolve();
                  } catch (error) {
                    reject(error);
                  }
                };
                removeListener = () => {
                  session.off('Target.receivedMessageFromTarget', listener);
                };
                session.on('Target.receivedMessageFromTarget', listener);
                timeout = setTimeout(
                  () => reject(new Error('Action popup input reply timed out')),
                  10000
                );
              });
              try {
                await session.send('Target.sendMessageToTarget', {
                  sessionId: attached.sessionId,
                  message: JSON.stringify({
                    id: commandId,
                    method: 'Input.dispatchMouseEvent',
                    params: { type, ...point, button: 'left', clickCount: 1 },
                  }),
                });
                await reply;
              } finally {
                clearTimeout(timeout);
                removeListener();
              }
            }
          } finally {
            await session.send('Target.detachFromTarget', { sessionId: attached.sessionId });
          }
        };
        await clickPopupControl('[data-ui="popup.app.tabs"] button[data-page="video"]');
        const previousPages = context.pages().length;
        const opened = settings
          ? settings.waitForEvent('domcontentloaded').then(() => settings!)
          : context.waitForEvent('page');
        await clickPopupControl(
          `button[data-ui="popup.icon-state-button"][aria-label="${name === 'microphone' ? 'Microphone' : 'Camera'}"]`
        );
        const previousSettings = settings;
        settings = await opened;
        await settings.waitForURL(/settings.*permissions/);
        if (previousSettings) {
          expect(settings).toBe(previousSettings);
          expect(context.pages().length).toBeLessThanOrEqual(previousPages);
        }
        await expect
          .poll(() =>
            settings!.evaluate(() => Reflect.get(globalThis, '__permissionRequestSettled'))
          )
          .toBe(1);
        expect(
          await settings.evaluate(() => Reflect.get(globalThis, '__permissionRequests'))
        ).toEqual([{ audio: name === 'microphone', video: name === 'camera' }]);
        expect(new URL(settings.url()).searchParams.has('requestMediaAccess')).toBe(false);
        const card = settings.locator(`[data-ui="settings.permissions.${name}"]`);
        await expect(card.getByRole('button', { name: 'Allow', exact: true })).toBeEnabled();
        await expect(card.getByRole('button', { name: 'Open browser settings' })).toHaveCount(0);
        await settings.screenshot({
          path: info.outputPath(`settings-targeted-${name}-dismissed.png`),
          fullPage: false,
          animations: 'disabled',
        });
        await settings.reload();
        await expect(card.getByRole('button', { name: 'Allow', exact: true })).toBeEnabled();
        expect(
          await settings.evaluate(() => Reflect.get(globalThis, '__permissionRequests'))
        ).toEqual([]);
      }
      if (!settings) throw new Error('Settings page was not opened');
      for (const name of ['microphone', 'camera']) {
        await session.send('Browser.setPermission', {
          origin,
          permission: { name },
          setting: 'granted',
        });
        await expect(
          settings
            .locator(`[data-ui="settings.permissions.${name}"]`)
            .getByText('Granted', { exact: true })
        ).toBeVisible();
      }
      const preferences = await settings.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale_video_settings')).sniptale_video_settings
      );
      expect(preferences).toMatchObject({ microphoneEnabled: false, webcamEnabled: false });
      expect(await sendRuntimeMessage(settings, { type: 'GET_RECORDING_STATE' })).toMatchObject({
        success: true,
        state: { status: 'IDLE' },
      });
    } finally {
      await session.detach();
      await closeExtensionBrowser(launched);
    }
  });
}
