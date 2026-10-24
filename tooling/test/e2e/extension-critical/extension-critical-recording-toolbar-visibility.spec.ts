import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { parseRuntimeResponseForMessage } from '../../../../apps/extension/src/contracts/messaging/parsers/boundary';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  evaluateInTarget,
  openRealPopup,
  sendRuntimeMessage,
  triggerExtensionAction,
} from '../support/recording-action';

test.use({ actionTimeout: 10000 });

async function recordingStatus(page: Page) {
  const response = parseRuntimeResponseForMessage(
    VideoMessageType.GET_RECORDING_STATE,
    await sendRuntimeMessage(page, { type: VideoMessageType.GET_RECORDING_STATE })
  );
  return response.state?.status;
}

async function discardRecording(popup: Page, observer: Page) {
  await popup.locator('[data-ui="popup.video-active.cancel-button"]').click();
  const confirm = popup.locator('[data-ui="popup.video-active.cancel-delete-button"]');
  if (await confirm.isVisible()) await confirm.click();
  await expect.poll(() => recordingStatus(observer)).toBe('IDLE');
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`popup recording toolbar preference ${viewport.name}`, async ({}, info) => {
    test.setTimeout(120000);
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({ viewport: viewport.size });
    try {
      const { context, extensionId } = launched;
      const observer = await openRealPopup(context, extensionId);
      await observer.evaluate(
        async (defaults) => {
          await chrome.storage.local.set({
            sniptale_video_settings: {
              ...defaults,
              recordingSurface: { toolbarEnabled: false, cursorSpotlightEnabled: false },
              microphoneEnabled: false,
              webcamEnabled: false,
              systemAudioEnabled: false,
              warnWithoutMicrophone: false,
              countdownSeconds: 0,
              qualityProfileId: null,
            },
            'sniptale-locale-preference': 'en',
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
      const target = await context.newPage();
      await target.goto(host.origin);
      const tabId = await observer.evaluate(async (url) => {
        const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
        if (tab?.id === undefined) throw new Error('Source tab is unavailable');
        return tab.id;
      }, target.url());
      const action = await triggerExtensionAction(context, extensionId, target);
      await evaluateInTarget(context, action, 'window.close()').catch(() => undefined);
      const popup = await context.newPage();
      await popup.goto(
        `chrome-extension://${extensionId}/apps/extension/src/popup/index.html?videoLaunchMode=TAB&videoLaunchTabId=${tabId}`
      );
      const toolbar = target.locator('[data-ui="content.toolbar.root"]');
      await expect(toolbar).toHaveCount(0);
      await popup.locator('[data-ui="popup.video-setup.start-recording-button"]').click();
      await expect(popup.locator('[data-ui="popup.video-active.cancel-button"]')).toBeVisible({
        timeout: 30000,
      });
      await expect.poll(() => recordingStatus(observer)).toBe('RECORDING');
      await expect(toolbar).toHaveCount(0);
      await target.screenshot({
        path: info.outputPath('popup-toolbar-disabled.png'),
        fullPage: false,
      });
      await discardRecording(popup, observer);

      const toggle = popup.locator('[data-ui="popup.video.recording-toolbar-toggle"]');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await popup.locator('[data-ui="popup.video-setup.start-recording-button"]').click();
      await expect.poll(() => recordingStatus(observer)).toBe('RECORDING');
      await expect(
        target.locator('[data-ui="content.toolbar.video-recording.pause"]')
      ).toBeVisible();
      await target.screenshot({
        path: info.outputPath('popup-toolbar-enabled.png'),
        fullPage: false,
      });
      await discardRecording(popup, observer);
      await target.locator('[data-ui="content.toolbar.settings-button"]').click();
      await target.getByRole('button', { name: 'Collapse', exact: true }).click();
      await expect(toolbar).toHaveCount(0);
      await expect
        .poll(() =>
          observer.evaluate(async () => {
            const stored = await chrome.storage.session.get(
              'video-recording-content-surface-lease'
            );
            return stored['video-recording-content-surface-lease']?.toolbarRequested;
          })
        )
        .toBe(false);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await target.reload();
      await expect(toolbar).toHaveCount(0);
      await popup.locator('[data-ui="popup.video-setup.start-recording-button"]').click();
      await expect.poll(() => recordingStatus(observer)).toBe('RECORDING');
      await expect(toolbar).toHaveCount(0);
      await target.screenshot({
        path: info.outputPath('popup-toolbar-disabled-after-hide.png'),
        fullPage: false,
      });
      await discardRecording(popup, observer);
    } finally {
      await closeExtensionBrowser(launched);
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
