import { expect, test } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  CaptureMode,
  VideoRecordingStatus,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { parseRuntimeResponseForMessage } from '../../../../apps/extension/src/contracts/messaging/parsers/boundary';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { openRealPopup, sendRuntimeMessage } from '../support/recording-action';
import { startHostServer } from '../support/host-server';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const variant of [
    { locale: 'ru', theme: 'light' },
    { locale: 'en', theme: 'dark' },
  ]) {
    test(
      `admitted recording quality stays visible ${viewport.name} ${variant.locale}-` +
        `${variant.theme}`,
      async ({}, info) => {
        const host = await startHostServer();
        const launched = await launchExtensionBrowser({
          viewport: viewport.size,
          fakeMediaDevices: true,
        });
        try {
          const { context, extensionId } = launched;
          let popup = await openRealPopup(context, extensionId);
          const library = await context.newPage();
          await library.goto(
            `chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`
          );
          await library.getByText('Your Library is empty', { exact: true }).waitFor();
          await library.close();
          await popup.evaluate(async (variant) => {
            localStorage.setItem('sniptale-theme-preference', variant.theme);
            await chrome.storage.local.set({
              'sniptale-locale-preference': variant.locale,
              'sniptale-theme-preference': variant.theme,
            });
          }, variant);
          const target = await context.newPage();
          await target.goto(`${host.origin}/fixtures/host-page.html`);
          const settings = {
            ...DEFAULT_VIDEO_SETTINGS,
            countdownSeconds: 10,
            warnWithoutMicrophone: false,
            microphoneEnabled: false,
            webcamEnabled: false,
            systemAudioEnabled: false,
            qualityProfileId: null,
            outputProfile: {
              ...DEFAULT_VIDEO_SETTINGS.outputProfile,
              resolution: VideoResolutionPreset.P720,
            },
          };
          const tabId = await popup.evaluate(
            async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id,
            target.url()
          );
          await popup.reload();
          await popup.locator('[data-page="video"]').click();
          let startReply: unknown;
          const starting = sendRuntimeMessage(popup, {
            type: VideoMessageType.START_RECORDING,
            captureMode: CaptureMode.SCREEN,
            settings,
            tabId,
            viewportPresetId: null,
          }).then((reply) => {
            startReply = reply;
            return reply;
          });
          void starting.catch(() => undefined);
          const state = async () => {
            const reply = parseRuntimeResponseForMessage(
              VideoMessageType.GET_RECORDING_STATE,
              await sendRuntimeMessage(popup, { type: VideoMessageType.GET_RECORDING_STATE })
            );
            if (!reply.success || !reply.state)
              throw new Error('Recording projection is unavailable');
            return reply.state;
          };
          await expect
            .poll(
              async () => {
                if (
                  startReply !== undefined &&
                  typeof startReply === 'object' &&
                  startReply !== null &&
                  'success' in startReply &&
                  startReply.success === false
                )
                  throw new Error(JSON.stringify(startReply));
                return (await state()).status;
              },
              { timeout: 15_000 }
            )
            .toBe(VideoRecordingStatus.COUNTDOWN);
          expect((await state()).captureMode).toBe(CaptureMode.SCREEN);
          expect((await state()).outputProfile).toEqual(settings.outputProfile);
          let summary = popup.locator('[data-ui="popup.video-active.quality-summary"]');
          await expect(summary).toContainText('720p');
          await expect(summary).toContainText('30 fps');
          await expect(summary).toContainText('VP9');
          await popup.screenshot({
            path: info.outputPath('countdown-quality.png'),
            fullPage: false,
            clip: { x: 0, y: 0, width: 392, height: 560 },
          });
          await popup.evaluate(async (settings) => {
            await chrome.storage.local.set({
              sniptale_video_settings: {
                ...settings,
                outputProfile: { ...settings.outputProfile, resolution: '360P', frameRate: 24 },
              },
            });
          }, settings);
          popup = await openRealPopup(context, extensionId);
          summary = popup.locator('[data-ui="popup.video-active.quality-summary"]');
          await popup.locator('[data-page="video"]').click();
          await expect(summary).toContainText('720p');
          await expect(summary).not.toContainText('360p');
          await expect
            .poll(async () => (await state()).status, { timeout: 15_000 })
            .toBe(VideoRecordingStatus.RECORDING);
          expect(await starting).toMatchObject({ success: true });
          await expect(summary).toBeVisible();
          await expect(summary).toContainText('30 fps');
          await popup.screenshot({
            path: info.outputPath('recording-quality.png'),
            fullPage: false,
            clip: { x: 0, y: 0, width: 392, height: 560 },
          });
          await popup.locator('[data-ui="popup.video-active.stop-button"]').click();
          await expect
            .poll(async () => (await state()).status, { timeout: 30_000 })
            .toBe(VideoRecordingStatus.IDLE);
        } finally {
          await closeExtensionBrowser(launched);
          host.server.closeAllConnections();
          await new Promise<void>((resolve) => host.server.close(() => resolve()));
        }
      }
    );
  }
}
