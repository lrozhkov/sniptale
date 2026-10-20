import { writeFile } from 'node:fs/promises';
import { expect, test, type Browser } from '@playwright/test';
import { z } from 'zod';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  CaptureMode,
  VideoRecordingStatus,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { parseRuntimeResponseForMessage } from '../../../../apps/extension/src/contracts/messaging/parsers/boundary';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  evaluateInTarget,
  openRealPopup,
  sendRuntimeMessageInTarget,
  triggerExtensionAction,
} from '../support/recording-action';

async function saveActionScreenshot(browser: Browser, targetId: string, path: string) {
  const session = await browser.newBrowserCDPSession();
  let attachedId: string | null = null;
  let listener: ((event: { sessionId: string; message: string }) => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const attached = await session.send('Target.attachToTarget', { targetId, flatten: false });
    attachedId = attached.sessionId;
    const captured = new Promise<string>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Action popup screenshot timed out')), 5_000);
      listener = (event) => {
        if (event.sessionId !== attached.sessionId) return;
        const reply: unknown = JSON.parse(event.message);
        const parsed = z
          .object({
            id: z.literal(1),
            result: z.object({ data: z.string() }),
          })
          .safeParse(reply);
        if (parsed.success) resolve(parsed.data.result.data);
        else if (typeof reply === 'object' && reply !== null && 'error' in reply)
          reject(new Error('Action popup screenshot failed'));
      };
      session.on('Target.receivedMessageFromTarget', listener);
    });
    await session.send('Target.sendMessageToTarget', {
      sessionId: attached.sessionId,
      message: JSON.stringify({
        id: 1,
        method: 'Page.captureScreenshot',
        params: { format: 'png', captureBeyondViewport: false },
      }),
    });
    await writeFile(path, Buffer.from(await captured, 'base64'));
  } finally {
    clearTimeout(timeout);
    if (listener) session.off('Target.receivedMessageFromTarget', listener);
    if (attachedId)
      await session
        .send('Target.detachFromTarget', { sessionId: attachedId })
        .catch(() => undefined);
    await session.detach();
  }
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const captureMode of [CaptureMode.SCREEN, CaptureMode.CAMERA]) {
    test(`actual action popup camera countdown ${captureMode} ${viewport.name}`, async ({}, info) => {
      const server = await startHostServer();
      const launched = await launchExtensionBrowser({
        viewport: viewport.size,
        fakeMediaDevices: true,
      });
      try {
        const { context, browser, extensionId } = launched;
        const settings = {
          ...DEFAULT_VIDEO_SETTINGS,
          webcamEnabled: true,
          microphoneEnabled: false,
          systemAudioEnabled: false,
          warnWithoutMicrophone: false,
          qualityProfileId: null,
          outputProfile: {
            ...DEFAULT_VIDEO_SETTINGS.outputProfile,
            resolution: VideoResolutionPreset.P240,
          },
        };
        const seed = await openRealPopup(context, extensionId);
        await seed.evaluate(async () =>
          chrome.storage.local.set({
            'sniptale-locale-preference': 'en',
          })
        );
        const gallery = await context.newPage();
        await gallery.goto(
          `chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`
        );
        await gallery.getByText('Your Library is empty', { exact: true }).waitFor();
        await gallery.close();
        const target = await context.newPage();
        await target.goto(`${server.origin}/fixtures/host-page.html?actual-countdown=1`);
        const tabId = await seed.evaluate(async (url) => {
          const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
          if (tab?.id === undefined) throw new Error('Countdown source tab is unavailable');
          return tab.id;
        }, target.url());
        await seed.close();
        await target.bringToFront();
        const action = await triggerExtensionAction(context, extensionId, target);
        await expect
          .poll(() =>
            evaluateInTarget(
              context,
              action,
              `Boolean(document.querySelector('[data-ui="popup.app.tabs"] button[data-page="video"]'))`
            )
          )
          .toBe(true);
        await evaluateInTarget(
          context,
          action,
          `document.querySelector('[data-ui="popup.app.tabs"] button[data-page="video"]')?.click()`
        );
        const started = await sendRuntimeMessageInTarget(context, action, {
          type: VideoMessageType.START_RECORDING,
          captureMode,
          tabId,
          viewportPresetId: null,
          settings,
        });
        expect(
          z
            .object({
              success: z.boolean(),
              error: z.string().optional(),
              failureCode: z.string().optional(),
            })
            .parse(started)
        ).toEqual({ success: true });
        const inspect = () =>
          evaluateInTarget(
            context,
            action,
            `(() => {
          const preview = document.querySelector('[data-ui="popup.video-active.countdown-camera-preview"]');
          const video = preview?.querySelector('video');
          const button = document.querySelector('[aria-label="Turn camera off"]');
          const row = button?.parentElement;
          return {
            hasFrames: Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0),
            unavailable: preview?.textContent?.includes('Preview unavailable') ?? false,
            cameraIcons: row?.querySelectorAll('svg').length ?? 0,
            cameraFirst: row?.firstElementChild === button,
            cameraDisabled: button?.disabled ?? false,
          };
        })()`
          );
        await expect.poll(inspect, { intervals: [50, 100], timeout: 4_000 }).toEqual({
          hasFrames: true,
          unavailable: false,
          cameraIcons: 1,
          cameraFirst: true,
          cameraDisabled: true,
        });
        await saveActionScreenshot(browser, action, info.outputPath('actual-countdown.png'));
        const readStatus = async () => {
          const response = parseRuntimeResponseForMessage(
            VideoMessageType.GET_RECORDING_STATE,
            await sendRuntimeMessageInTarget(context, action, {
              type: VideoMessageType.GET_RECORDING_STATE,
            })
          );
          return response.success ? response.state?.status : null;
        };
        await expect.poll(readStatus).toBe(VideoRecordingStatus.RECORDING);
        expect(
          await evaluateInTarget(
            context,
            action,
            `document.querySelectorAll('[data-ui="popup.video-active.countdown-camera-preview"]').length`
          )
        ).toBe(0);
      } finally {
        await closeExtensionBrowser(launched);
        server.server.closeAllConnections();
        await new Promise<void>((resolve) => server.server.close(() => resolve()));
      }
    });
  }
}
