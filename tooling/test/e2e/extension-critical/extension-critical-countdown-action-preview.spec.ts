import { writeFile } from 'node:fs/promises';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { z } from 'zod';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  CaptureMode,
  VideoRecordingStatus,
  VideoResolutionPreset,
  WebcamPresentationMode,
} from '@sniptale/runtime-contracts/video/types/types';
import { parseRuntimeResponseForMessage } from '../../../../apps/extension/src/contracts/messaging/parsers/boundary';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  evaluateInTarget,
  openRealPopup,
  sendRuntimeMessage,
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

async function installControlledTabCamera(
  context: BrowserContext,
  browser: Browser,
  delayMs: number
) {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(async () => {
    await chrome.offscreen.createDocument({
      url: `apps/extension/src/offscreen/offscreen.html?offscreenStartupId=${crypto.randomUUID()}`,
      reasons: [
        chrome.offscreen.Reason.USER_MEDIA,
        chrome.offscreen.Reason.CLIPBOARD,
        chrome.offscreen.Reason.DISPLAY_MEDIA,
      ],
      justification: 'Test a controlled camera with native tab capture',
    });
  });
  const session = await browser.newBrowserCDPSession();
  let targetId: string;
  try {
    await expect
      .poll(async () => {
        const { targetInfos } = await session.send('Target.getTargets');
        return targetInfos.some((target) => target.url.includes('/offscreen/offscreen.html'));
      })
      .toBe(true);
    const { targetInfos } = await session.send('Target.getTargets');
    const offscreen = targetInfos.find((target) =>
      target.url.includes('/offscreen/offscreen.html')
    );
    if (!offscreen) throw new Error('Controlled camera offscreen target is unavailable');
    targetId = offscreen.targetId;
  } finally {
    await session.detach();
  }
  const install = (acquisitionDelay: number) => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const probe = {
      requests: 0,
      streams: [] as MediaStream[],
      captureStreams: [] as MediaStream[],
    };
    Reflect.set(globalThis, '__countdownCameraSource', probe);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const video = constraints?.video;
      const mandatory = typeof video === 'object' ? Reflect.get(video, 'mandatory') : undefined;
      const tabSource =
        typeof mandatory === 'object' &&
        mandatory !== null &&
        Reflect.get(mandatory, 'chromeMediaSource') === 'tab';
      if (!video || tabSource) {
        const stream = await original(constraints);
        probe.captureStreams.push(stream);
        return stream;
      }
      probe.requests += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, acquisitionDelay));
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const drawing = canvas.getContext('2d');
      if (!drawing) throw new Error('Controlled camera drawing context is unavailable');
      let frame = 0;
      const draw = () => {
        drawing.fillStyle = frame % 2 ? '#ff6600' : '#2244ff';
        drawing.fillRect(0, 0, canvas.width, canvas.height);
        drawing.fillStyle = '#fff';
        drawing.font = '32px sans-serif';
        drawing.fillText(`Camera frame ${++frame}`, 32, 96);
        window.setTimeout(draw, 33);
      };
      draw();
      const stream = canvas.captureStream(30);
      probe.streams.push(stream);
      return stream;
    };
  };
  await evaluateInTarget(context, targetId, `(${install.toString()})(${delayMs})`);
  return targetId;
}

const scenarios = [
  { captureMode: CaptureMode.TAB, countdownSeconds: 10, cameraDelay: 0, embedded: true },
  { captureMode: CaptureMode.SCREEN, countdownSeconds: 3, cameraDelay: null },
  { captureMode: CaptureMode.CAMERA, countdownSeconds: 3, cameraDelay: null },
  { captureMode: CaptureMode.TAB, countdownSeconds: 3, cameraDelay: 0 },
  { captureMode: CaptureMode.TAB, countdownSeconds: 3, cameraDelay: 2_600 },
  { captureMode: CaptureMode.TAB, countdownSeconds: 10, cameraDelay: 2_600, reopen: true },
  {
    captureMode: CaptureMode.TAB,
    countdownSeconds: 10,
    cameraDelay: 0,
    reopen: true,
    cancel: true,
  },
] as const;

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const scenario of scenarios) {
    const { captureMode, countdownSeconds, cameraDelay } = scenario;
    const reopen = 'reopen' in scenario && scenario.reopen;
    const cancel = 'cancel' in scenario && scenario.cancel;
    const embedded = 'embedded' in scenario && scenario.embedded;
    const name = `actual action popup camera countdown ${captureMode} ${countdownSeconds}s`;
    test(
      `${name} ${cameraDelay ?? 'native'}ms ` +
        `${embedded ? 'embedded' : cancel ? 'cancel-restart' : reopen ? 'reopen' : 'record'} ` +
        `${viewport.name}`,
      async ({}, info) => {
        const server = await startHostServer();
        const launched = await launchExtensionBrowser({
          viewport: viewport.size,
          fakeMediaDevices: cameraDelay === null,
        });
        try {
          const { context, browser, extensionId } = launched;
          const settings = {
            ...DEFAULT_VIDEO_SETTINGS,
            countdownSeconds,
            webcamEnabled: true,
            microphoneEnabled: false,
            systemAudioEnabled: false,
            warnWithoutMicrophone: false,
            qualityProfileId: null,
            webcamPresentation: {
              ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
              mode: embedded
                ? WebcamPresentationMode.EMBEDDED
                : WebcamPresentationMode.SEPARATE_TRACK,
            },
            outputProfile: {
              ...DEFAULT_VIDEO_SETTINGS.outputProfile,
              resolution: VideoResolutionPreset.P240,
            },
          };
          const seed = await openRealPopup(context, extensionId);
          if (embedded) {
            await seed.evaluate(async (settings) => {
              await chrome.storage.local.set({ sniptale_video_settings: settings });
            }, settings);
          }
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
          const offscreen =
            cameraDelay === null
              ? null
              : await installControlledTabCamera(context, browser, cameraDelay);
          const target = await context.newPage();
          await target.goto(`${server.origin}/fixtures/host-page.html?actual-countdown=1`);
          const tabId = await seed.evaluate(async (url) => {
            const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
            if (tab?.id === undefined) throw new Error('Countdown source tab is unavailable');
            return tab.id;
          }, target.url());
          if (!embedded) await seed.close();
          await target.bringToFront();
          let action = await triggerExtensionAction(context, extensionId, target);
          await expect
            .poll(() =>
              evaluateInTarget(
                context,
                action,
                `Boolean(document.querySelector('[data-ui="popup.app.tabs"] button[data-page="video"]'))`
              )
            )
            .toBe(true);
          if (embedded) {
            expect(
              await sendRuntimeMessageInTarget(context, action, {
                type: 'PAGE_ACCESS',
                operation: 'activate-current-tab',
              })
            ).toMatchObject({ success: true });
          }
          await evaluateInTarget(
            context,
            action,
            `document.querySelector('[data-ui="popup.app.tabs"] button[data-page="video"]')?.click()`
          );
          const started = await sendRuntimeMessageInTarget(
            context,
            action,
            {
              type: VideoMessageType.START_RECORDING,
              captureMode,
              tabId,
              viewportPresetId: null,
              settings,
            },
            captureMode !== CaptureMode.TAB
          );
          if (captureMode !== CaptureMode.TAB)
            expect(
              z
                .object({
                  success: z.boolean(),
                  error: z.string().optional(),
                  failureCode: z.string().optional(),
                })
                .parse(started)
            ).toEqual({ success: true });
          const inspect = async () => {
            const session = await browser.newBrowserCDPSession();
            try {
              const { targetInfos } = await session.send('Target.getTargets');
              if (!targetInfos.some((candidate) => candidate.targetId === action)) {
                await target.bringToFront();
                action = await triggerExtensionAction(context, extensionId, target);
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
              }
            } finally {
              await session.detach();
            }
            return evaluateInTarget(
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
          };
          await expect.poll(inspect, { intervals: [50, 100], timeout: 7_000 }).toEqual({
            hasFrames: true,
            unavailable: false,
            cameraIcons: 1,
            cameraFirst: true,
            cameraDisabled: true,
          });
          if (!embedded) {
            await saveActionScreenshot(browser, action, info.outputPath('actual-countdown.png'));
          }
          const readStatus = async () => {
            const response = parseRuntimeResponseForMessage(
              VideoMessageType.GET_RECORDING_STATE,
              embedded
                ? await sendRuntimeMessage(seed, { type: VideoMessageType.GET_RECORDING_STATE })
                : await sendRuntimeMessageInTarget(context, action, {
                    type: VideoMessageType.GET_RECORDING_STATE,
                  })
            );
            return response.success ? response.state?.status : null;
          };
          if (reopen) {
            const previous = action;
            const session = await browser.newBrowserCDPSession();
            try {
              await session.send('Target.closeTarget', { targetId: previous });
              await expect
                .poll(async () => {
                  const { targetInfos } = await session.send('Target.getTargets');
                  return targetInfos.some((candidate) => candidate.targetId === previous);
                })
                .toBe(false);
            } finally {
              await session.detach();
            }
            await expect.poll(inspect, { intervals: [50, 100] }).toMatchObject({ hasFrames: true });
            await expect.poll(readStatus).toBe(VideoRecordingStatus.COUNTDOWN);
          }
          if (cancel) {
            for (const attempt of ['first', 'restarted']) {
              if (attempt === 'restarted') {
                await sendRuntimeMessageInTarget(
                  context,
                  action,
                  {
                    type: VideoMessageType.START_RECORDING,
                    captureMode,
                    tabId,
                    viewportPresetId: null,
                    settings,
                  },
                  false
                );
                const previous = action;
                const session = await browser.newBrowserCDPSession();
                try {
                  await expect
                    .poll(async () => {
                      const { targetInfos } = await session.send('Target.getTargets');
                      return targetInfos.some((candidate) => candidate.targetId === previous);
                    })
                    .toBe(false);
                } finally {
                  await session.detach();
                }
                await expect.poll(inspect).toMatchObject({ hasFrames: true });
                await expect.poll(readStatus).toBe(VideoRecordingStatus.COUNTDOWN);
              }
              await expect
                .poll(() =>
                  evaluateInTarget(
                    context,
                    action,
                    `(() => {
                    const button = document.querySelector('[data-ui="popup.video-active.cancel-button"]');
                    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
                    button.scrollIntoView({ block: 'nearest' });
                    const bounds = button.getBoundingClientRect();
                    return bounds.top >= 0 && bounds.bottom <= innerHeight &&
                      bounds.left >= 0 && bounds.right <= innerWidth;
                  })()`
                  )
                )
                .toBe(true);
              await saveActionScreenshot(
                browser,
                action,
                info.outputPath(`cancel-${attempt}-countdown.png`)
              );
              await evaluateInTarget(
                context,
                action,
                `document.querySelector('[data-ui="popup.video-active.cancel-button"]')?.click()`
              );
              await expect
                .poll(readStatus)
                .toBe(VideoRecordingStatus.IDLE)
                .catch(async (error) => {
                  await saveActionScreenshot(
                    browser,
                    action,
                    info.outputPath('cancel-failure.png')
                  );
                  throw error;
                });
              const stopped = parseRuntimeResponseForMessage(
                VideoMessageType.GET_RECORDING_STATE,
                await sendRuntimeMessageInTarget(context, action, {
                  type: VideoMessageType.GET_RECORDING_STATE,
                })
              );
              expect(stopped).toMatchObject({
                success: true,
                state: { status: VideoRecordingStatus.IDLE, error: null, completion: null },
              });
              if (!offscreen) throw new Error('Cancellation track probe is unavailable');
              await expect
                .poll(() =>
                  evaluateInTarget(
                    context,
                    offscreen,
                    `(() => {
                    const source = globalThis.__countdownCameraSource;
                    const streams = [...source.streams, ...source.captureStreams];
                    return {
                      cameraRequests: source.requests,
                      hasCapture: source.captureStreams.length > 0,
                      liveTracks: streams.flatMap(stream => stream.getTracks())
                        .filter(track => track.readyState === 'live').length,
                    };
                  })()`
                  )
                )
                .toEqual({
                  cameraRequests: attempt === 'first' ? 1 : 2,
                  hasCapture: true,
                  liveTracks: 0,
                });
              await saveActionScreenshot(
                browser,
                action,
                info.outputPath(`cancel-${attempt}-idle.png`)
              );
            }
            const library = await context.newPage();
            await library.goto(
              `chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`
            );
            await expect(library.getByText('Your Library is empty', { exact: true })).toBeVisible();
            return;
          }
          await expect
            .poll(readStatus, { timeout: countdownSeconds * 1_000 + 10_000 })
            .toBe(VideoRecordingStatus.RECORDING);
          if (embedded) {
            await expect
              .poll(() =>
                target
                  .locator('[data-ui="content.video-recording.embedded-camera"] video')
                  .evaluateAll((videos) =>
                    videos.some(
                      (video) =>
                        video instanceof HTMLVideoElement &&
                        video.readyState >= 2 &&
                        video.videoWidth > 0
                    )
                  )
              )
              .toBe(true);
            await inspect();
          }
          expect(
            await evaluateInTarget(
              context,
              action,
              `document.querySelectorAll('[data-ui="popup.video-active.countdown-camera-preview"]').length`
            )
          ).toBe(0);
          if (offscreen) {
            const source = await evaluateInTarget(
              context,
              offscreen,
              `(() => {
            const source = globalThis.__countdownCameraSource;
            return { requests: source.requests, live: source.streams.every(stream =>
              stream.getVideoTracks().every(track => track.readyState === 'live')) };
          })()`
            );
            expect(source).toEqual({ requests: 1, live: true });
          }
          if (embedded) {
            await target.screenshot({
              path: info.outputPath('embedded-recording.png'),
              fullPage: false,
            });
            await expect
              .poll(async () => {
                const response = parseRuntimeResponseForMessage(
                  VideoMessageType.GET_RECORDING_STATE,
                  await sendRuntimeMessage(seed, { type: VideoMessageType.GET_RECORDING_STATE })
                );
                return response.success ? response.state?.duration : 0;
              })
              .toBeGreaterThan(0);
            await evaluateInTarget(
              context,
              action,
              `document.querySelector('[data-ui="popup.video-active.stop-button"]')?.click()`
            );
            await expect.poll(readStatus, { timeout: 30_000 }).toBe(VideoRecordingStatus.IDLE);
            if (!offscreen) throw new Error('Embedded camera track probe is unavailable');
            await expect
              .poll(() =>
                evaluateInTarget(
                  context,
                  offscreen,
                  `globalThis.__countdownCameraSource.streams.every(stream => ` +
                    `stream.getTracks().every(track => track.readyState === 'ended'))`
                )
              )
              .toBe(true);
            await expect(
              target.locator('[data-ui="content.video-recording.embedded-camera"]')
            ).toHaveCount(0);
          }
        } finally {
          await closeExtensionBrowser(launched);
          server.server.closeAllConnections();
          await new Promise<void>((resolve) => server.server.close(() => resolve()));
        }
      }
    );
  }
}
