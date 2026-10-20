import { expect, test, type BrowserContext, type Page } from '@playwright/test';
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
  sendRuntimeMessage,
  sendRuntimeMessageInTarget,
  triggerExtensionAction,
} from '../support/recording-action';

const START = '[data-ui="popup.video-setup.start-recording-button"]';
const CANCEL = '[data-ui="popup.video-active.cancel-button"]';
const METER = '[data-ui="popup.video-active.microphone-meter"]';
const PREVIEW = '[data-ui="popup.video-active.countdown-camera-preview"] video';
const WARNING = '[data-ui="popup.video-active.microphone-warning"]';

async function readState(page: Page) {
  const response = parseRuntimeResponseForMessage(
    VideoMessageType.GET_RECORDING_STATE,
    await sendRuntimeMessage(page, { type: VideoMessageType.GET_RECORDING_STATE })
  );
  if (response.success !== true || !response.state) {
    throw new Error('Recording readiness state response is unavailable');
  }
  return { ...response, state: response.state };
}

async function openVideoSetup(context: BrowserContext, extensionId: string) {
  const popup = await openRealPopup(context, extensionId);
  await popup.locator('[data-ui="popup.app.tabs"] button[data-page="video"]').click();
  return popup;
}

async function discardRecording(popup: Page) {
  await popup.locator(CANCEL).click();
  const confirm = popup.locator('[data-ui="popup.video-active.cancel-delete-button"]');
  if (await confirm.isVisible()) await confirm.click();
  await expect
    .poll(async () => (await readState(popup)).state.status, { timeout: 30_000 })
    .toBe(VideoRecordingStatus.IDLE);
}

async function stopContentRecording(target: Page, popup: Page) {
  await target.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
  await expect
    .poll(async () => (await readState(popup)).state.status, { timeout: 30_000 })
    .toBe(VideoRecordingStatus.IDLE);
  const result = (await readState(popup)).postRecordResult;
  if (result) {
    expect(
      await sendRuntimeMessage(popup, {
        type: 'ACKNOWLEDGE_POST_RECORD_RESULT',
        recordingId: result.recordingId,
      })
    ).toMatchObject({ success: true, result: 'acknowledged' });
    await expect.poll(async () => (await readState(popup)).postRecordResult).toBeUndefined();
  }
}

async function findOffscreenTarget(context: BrowserContext) {
  const browser = context.browser();
  if (!browser) throw new Error('Recording readiness browser is unavailable');
  const session = await browser.newBrowserCDPSession();
  try {
    const targets = await session.send('Target.getTargets');
    const target = targets.targetInfos.find((candidate) =>
      candidate.url.includes('/offscreen/offscreen.html')
    );
    if (!target) throw new Error('Recording readiness offscreen document is unavailable');
    return target.targetId;
  } finally {
    await session.detach();
  }
}

async function installMicrophoneSignal(context: BrowserContext, targetId: string) {
  const install = async () => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const destination = audio.createMediaStreamDestination();
    oscillator.frequency.value = 440;
    gain.gain.value = 0.1;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    await audio.resume();
    const probe = {
      audio,
      destination,
      gain,
      microphoneRequests: 0,
      cameraRequests: 0,
      cameraStreams: [] as MediaStream[],
    };
    Reflect.set(globalThis, '__sniptaleReadinessSignal', probe);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints?.audio && !constraints.video) {
        probe.microphoneRequests += 1;
        return destination.stream;
      }
      if (constraints?.video) probe.cameraRequests += 1;
      const stream = await original(constraints);
      if (stream.getVideoTracks().length) probe.cameraStreams.push(stream);
      return stream;
    };
  };
  await evaluateInTarget(context, targetId, `(${install.toString()})()`, true);
}

const READ_SIGNAL = `(() => {
  const probe = globalThis.__sniptaleReadinessSignal;
  return {
    microphoneRequests: probe.microphoneRequests,
    cameraRequests: probe.cameraRequests,
    microphoneLive: probe.destination.stream.getAudioTracks().every(track => track.readyState === 'live'),
    cameraLive: probe.cameraStreams.length > 0 && probe.cameraStreams.every(stream => stream.getVideoTracks().every(track => track.readyState === 'live')),
    audioState: probe.audio.state,
  };
})()`;

test('native context-menu recording handoff keeps the explicit source tab through confirmation', async ({}, info) => {
  test.setTimeout(80_000);
  const host = await startHostServer();
  const launched = await launchExtensionBrowser({ viewport: PRIMARY_BROWSER_VIEWPORTS[0].size });
  try {
    const { context, extensionId } = launched;
    const observer = await openRealPopup(context, extensionId);
    await observer.evaluate(
      async (settings) => {
        await chrome.storage.local.set({
          sniptale_video_settings: settings,
          'sniptale-locale-preference': 'en',
        });
      },
      {
        ...DEFAULT_VIDEO_SETTINGS,
        microphoneEnabled: false,
        webcamEnabled: false,
        systemAudioEnabled: false,
        warnWithoutMicrophone: true,
        countdownSeconds: 0,
        qualityProfileId: null,
        outputProfile: {
          ...DEFAULT_VIDEO_SETTINGS.outputProfile,
          resolution: VideoResolutionPreset.P240,
        },
      }
    );
    const target = await context.newPage();
    await target.goto(`${host.origin}/fixtures/host-page.html?context-recording-source=1`);
    const tabId = await observer.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
      if (tab?.id === undefined) throw new Error('Context handoff source tab is unavailable');
      return tab.id;
    }, target.url());
    const action = await triggerExtensionAction(context, extensionId, target);
    expect(
      await sendRuntimeMessageInTarget(context, action, {
        type: 'PAGE_ACCESS',
        operation: 'activate-current-tab',
        tabId,
      })
    ).toMatchObject({ success: true, status: { currentTabActive: true, currentTabId: tabId } });
    await evaluateInTarget(context, action, 'window.close()').catch(() => undefined);
    const decoy = await context.newPage();
    await decoy.goto(`${host.origin}/fixtures/host-page.html?context-recording-decoy=1`);
    await decoy.bringToFront();
    const handoff = await context.newPage();
    await handoff.setViewportSize(PRIMARY_BROWSER_VIEWPORTS[0].size);
    await handoff.goto(
      `chrome-extension://${extensionId}/apps/extension/src/popup/index.html?videoLaunchMode=TAB&videoLaunchTabId=${tabId}`
    );
    await expect(handoff.locator(START)).toBeEnabled();
    await handoff.evaluate(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      const replies: { success: unknown; result: unknown; error: unknown; failureCode: unknown }[] =
        [];
      Reflect.set(globalThis, '__sniptaleReadinessStartReplies', replies);
      Reflect.set(chrome.runtime, 'sendMessage', (...args: unknown[]) => {
        const response: unknown = Reflect.apply(original, chrome.runtime, args);
        const message = args[0];
        if (
          typeof message === 'object' &&
          message !== null &&
          Reflect.get(message, 'type') === 'START_RECORDING'
        ) {
          void Promise.resolve(response).then((reply: unknown) => {
            if (typeof reply !== 'object' || reply === null || replies.length >= 5) return;
            replies.push({
              success: Reflect.get(reply, 'success'),
              result: Reflect.get(reply, 'result'),
              error: Reflect.get(reply, 'error'),
              failureCode: Reflect.get(reply, 'failureCode'),
            });
          });
        }
        return response;
      });
    });
    expect(new URL(handoff.url()).searchParams.has('videoLaunchMode')).toBe(false);
    expect((await readState(observer)).state.status).toBe(VideoRecordingStatus.IDLE);
    await handoff.locator(START).click();
    await expect(
      handoff.getByText('Start recording without a microphone?', { exact: true })
    ).toBeVisible();
    expect((await readState(observer)).state.status).toBe(VideoRecordingStatus.IDLE);
    await handoff.screenshot({
      path: info.outputPath('context-handoff-without-microphone.png'),
      fullPage: false,
    });
    await handoff.getByRole('button', { name: 'Continue', exact: true }).click();
    await handoff.screenshot({
      path: info.outputPath('context-handoff-after-continue.png'),
      fullPage: false,
    });
    try {
      await expect
        .poll(
          async () => {
            const { state } = await readState(observer);
            return {
              status: state.status,
              mode: state.captureMode,
              tabId: state.captureSource?.tabId,
              error: state.error,
            };
          },
          { timeout: 30_000 }
        )
        .toEqual({
          status: VideoRecordingStatus.RECORDING,
          mode: CaptureMode.TAB,
          tabId,
          error: null,
        });
    } catch (error) {
      await handoff.screenshot({
        path: info.outputPath('context-handoff-start-failure.png'),
        fullPage: false,
      });
      await info.attach('context-handoff-start-diagnostics', {
        body: JSON.stringify(
          {
            popup: await handoff.evaluate(() => ({
              text: document.body.innerText.slice(0, 12_000),
              startReplies: Reflect.get(globalThis, '__sniptaleReadinessStartReplies'),
            })),
            runtimeState: (await readState(observer)).state,
          },
          null,
          2
        ),
        contentType: 'application/json',
      });
      throw error;
    }
    await handoff.screenshot({
      path: info.outputPath('context-handoff-recording.png'),
      fullPage: false,
    });
    await discardRecording(handoff);
  } finally {
    await closeExtensionBrowser(launched);
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`native recording left microphone toggle ${viewport.name}`, async ({}, info) => {
    const launched = await launchExtensionBrowser({
      viewport: viewport.size,
      fakeMediaDevices: true,
    });
    try {
      const { context, extensionId } = launched;
      const browser = context.browser();
      if (!browser) throw new Error('Recording microphone browser is unavailable');
      const session = await browser.newBrowserCDPSession();
      try {
        for (const name of ['microphone', 'camera']) {
          await session.send('Browser.setPermission', {
            origin: `chrome-extension://${extensionId}`,
            permission: { name },
            setting: 'granted',
          });
        }
      } finally {
        await session.detach();
      }
      const seed = await openRealPopup(context, extensionId);
      const microphoneLabel = await seed.evaluate(
        async ({ defaults, resolution }) => {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const microphone = devices.find((device) => device.kind === 'audioinput');
          const webcam = devices.find((device) => device.kind === 'videoinput');
          if (!microphone?.label || !webcam)
            throw new Error('Fake recording devices are unavailable');
          await chrome.storage.local.set({
            sniptale_video_settings: {
              ...defaults,
              microphoneDeviceId: microphone.deviceId,
              microphoneEnabled: true,
              webcamDeviceId: webcam.deviceId,
              webcamEnabled: true,
              systemAudioEnabled: false,
              countdownSeconds: 0,
              warnWithoutMicrophone: false,
              qualityProfileId: null,
              outputProfile: { ...defaults.outputProfile, resolution },
            },
            sniptale_video_ui_state: { captureMode: 'CAMERA', viewportPresetId: null },
            'sniptale-locale-preference': 'en',
          });
          return microphone.label;
        },
        { defaults: DEFAULT_VIDEO_SETTINGS, resolution: VideoResolutionPreset.P240 }
      );
      await seed.close();
      const libraryPopup = await openVideoSetup(context, extensionId);
      const galleryOpened = context.waitForEvent('page');
      await libraryPopup.locator('[data-ui="popup.video-setup.gallery-button"]').click();
      const gallery = await galleryOpened;
      await gallery.waitForURL('**/gallery/index.html*');
      await expect(
        gallery
          .locator('[data-ui="gallery.content.surface"]')
          .getByText('Your Library is empty', { exact: true })
      ).toBeVisible();
      await expect(gallery.getByText('Error', { exact: true })).toHaveCount(0);
      await gallery.close();
      const popup = await openVideoSetup(context, extensionId);
      try {
        await expect(
          popup.locator('[data-ui="popup.icon-state-button"][aria-label="Microphone"]')
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(
          popup.locator('button[aria-label="Camera"]:not([data-ui="popup.icon-state-button"])')
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(
          popup.getByRole('button', { name: 'Microphone device', exact: true })
        ).toContainText(microphoneLabel);
        await popup.locator(START).click();
        await expect(popup.getByText('Recording', { exact: true })).toBeVisible();
        expect((await readState(popup)).state.status).toBe(VideoRecordingStatus.RECORDING);
      } catch (error) {
        await info.attach('left-microphone-start-diagnostics', {
          body: JSON.stringify(
            {
              popupText: await popup
                .evaluate(() => document.body.innerText.slice(0, 12_000))
                .catch(() => null),
              runtimeState: await readState(popup).catch(() => null),
            },
            null,
            2
          ),
          contentType: 'application/json',
        });
        throw error;
      }
      const mute = popup.getByRole('button', { name: 'Mute microphone', exact: true });
      const row = mute.locator('..');
      await expect(row.locator('svg')).toHaveCount(1);
      await expect(mute.locator('svg')).toHaveCount(1);
      expect(
        await mute.evaluate((button) => button.parentElement?.firstElementChild === button)
      ).toBe(true);
      const deviceName = row.locator('[title]').filter({ hasText: microphoneLabel });
      await expect(deviceName).toHaveText(microphoneLabel);
      const buttonBounds = await mute.boundingBox();
      const nameBounds = await deviceName.boundingBox();
      expect(buttonBounds).not.toBeNull();
      expect(nameBounds).not.toBeNull();
      expect(buttonBounds!.x + buttonBounds!.width).toBeLessThan(nameBounds!.x);
      await mute.click();
      await expect
        .poll(async () => (await readState(popup)).state.liveMedia?.microphoneEnabled)
        .toBe(false);
      const unmute = popup.getByRole('button', { name: 'Unmute microphone', exact: true });
      await expect(unmute).toBeEnabled();
      expect(await unmute.evaluate((button) => button.matches(':focus-visible'))).toBe(false);
      await unmute.focus();
      await popup.keyboard.press('Space');
      await expect
        .poll(async () => (await readState(popup)).state.liveMedia?.microphoneEnabled)
        .toBe(true);
      await expect(mute).toBeEnabled();
      await expect(deviceName).toHaveText(microphoneLabel);
      expect((await readState(popup)).state.liveMedia?.microphoneSelected).toBe(true);
      await popup.screenshot({
        path: info.outputPath('recording-left-microphone-toggle.png'),
        fullPage: false,
      });
      await discardRecording(popup);
    } finally {
      await closeExtensionBrowser(launched);
    }
  });

  test(`native content toolbar confirms recording without microphone ${viewport.name}`, async ({}, info) => {
    test.setTimeout(100_000);
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({ viewport: viewport.size });
    try {
      const { context, extensionId } = launched;
      let popup = await openRealPopup(context, extensionId);
      await popup.evaluate(
        async (settings) => {
          await chrome.storage.local.set({
            sniptale_video_settings: settings,
            'sniptale-locale-preference': 'en',
          });
        },
        {
          ...DEFAULT_VIDEO_SETTINGS,
          microphoneEnabled: false,
          webcamEnabled: false,
          systemAudioEnabled: false,
          warnWithoutMicrophone: true,
          countdownSeconds: 0,
          qualityProfileId: null,
          outputProfile: {
            ...DEFAULT_VIDEO_SETTINGS.outputProfile,
            resolution: VideoResolutionPreset.P240,
          },
        }
      );
      const target = await context.newPage();
      await target.goto(`${host.origin}/fixtures/host-page.html?content-recording-readiness=1`);
      await popup.evaluate((origin) => {
        const grant = document.createElement('button');
        grant.textContent = 'Grant readiness test host';
        grant.onclick = async () => {
          grant.dataset['granted'] = String(
            await chrome.permissions.request({ origins: [`${origin}/*`] })
          );
        };
        document.body.append(grant);
      }, host.origin);
      const grant = popup.getByRole('button', { name: 'Grant readiness test host', exact: true });
      await grant.click();
      await expect(grant).toHaveAttribute('data-granted', 'true');
      const tabId = await popup.evaluate(async (url) => {
        const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
        if (tab?.id === undefined) throw new Error('Readiness content tab is unavailable');
        return tab.id;
      }, target.url());
      await target.reload();
      expect(
        await sendRuntimeMessage(popup, {
          type: 'PAGE_ACCESS',
          operation: 'register-granted-site',
          tabId,
        })
      ).toMatchObject({ success: true, result: 'registered' });
      expect(
        await popup.evaluate(
          (id) =>
            chrome.tabs.sendMessage(id, {
              type: 'ENABLE_SCREENSHOT_MODE',
              workingMode: 'design-review',
            }),
          tabId
        )
      ).toMatchObject({ success: true });
      await target.bringToFront();
      await expect(target.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
      await target.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await target.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
      const action = await triggerExtensionAction(context, extensionId, target);
      await evaluateInTarget(context, action, 'window.close()').catch(() => undefined);
      await target.bringToFront();
      const start = target.locator('[data-ui="content.toolbar.video-recording.start"]');
      await start.click();
      const confirmation = target.getByRole('alertdialog', {
        name: 'Continue recording without a microphone?',
        exact: true,
      });
      await expect(confirmation).toBeVisible();
      const cancelConfirmation = confirmation.getByRole('button', { name: 'Cancel', exact: true });
      await expect(cancelConfirmation).toBeFocused();
      expect(await cancelConfirmation.evaluate((button) => button.matches(':focus-visible'))).toBe(
        false
      );
      expect((await readState(popup)).state.status).toBe(VideoRecordingStatus.IDLE);
      expect(
        await popup.evaluate(
          async () =>
            (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length
        )
      ).toBe(0);
      await target.screenshot({
        path: info.outputPath('content-without-microphone-confirmation.png'),
        fullPage: false,
      });
      await cancelConfirmation.click();
      await expect(confirmation).toHaveCount(0);
      await expect(start).toBeFocused();
      expect(await start.evaluate((button) => button.matches(':focus-visible'))).toBe(false);
      expect((await readState(popup)).state.status).toBe(VideoRecordingStatus.IDLE);
      await expect(target.locator('.sniptale-toast')).toHaveCount(0);
      await start.click();
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole('checkbox', { name: "Don't ask me again", exact: true }).check();
      const continueConfirmation = confirmation.getByRole('button', {
        name: 'Continue',
        exact: true,
      });
      await continueConfirmation.hover();
      await target.mouse.down();
      expect(
        await continueConfirmation.evaluate((button) => button.matches(':focus-visible'))
      ).toBe(false);
      await target.mouse.up();
      await expect(target.locator('[data-ui="content.toolbar.video-recording.pause"]')).toBeVisible(
        { timeout: 30_000 }
      );
      await expect
        .poll(async () => (await readState(popup)).state.status)
        .toBe(VideoRecordingStatus.RECORDING);
      await expect
        .poll(() =>
          popup.evaluate(
            async () =>
              (await chrome.storage.local.get('sniptale_video_settings')).sniptale_video_settings
                ?.warnWithoutMicrophone
          )
        )
        .toBe(false);
      expect((await readState(popup)).state.error).toBeNull();
      await expect(target.locator('.sniptale-toast')).toHaveCount(0);
      await target.screenshot({
        path: info.outputPath('content-without-microphone-recording.png'),
        fullPage: false,
      });
      await popup.close();
      popup = await openRealPopup(context, extensionId);
      await stopContentRecording(target, popup);
      await expect(start).toBeEnabled();
      await target.bringToFront();
      const nextAction = await triggerExtensionAction(context, extensionId, target);
      await evaluateInTarget(context, nextAction, 'window.close()').catch(() => undefined);
      await target.bringToFront();
      await start.click();
      await expect(target.locator('[data-ui="content.toolbar.video-recording.pause"]')).toBeVisible(
        { timeout: 30_000 }
      );
      await expect(confirmation).toHaveCount(0);
      expect((await readState(popup)).state.error).toBeNull();
      await expect(target.locator('.sniptale-toast')).toHaveCount(0);
      await stopContentRecording(target, popup);
    } finally {
      await closeExtensionBrowser(launched);
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });

  test(`native recording readiness confirmation, countdown and microphone recovery ${viewport.name}`, async ({}, info) => {
    test.setTimeout(150_000);
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({
      viewport: viewport.size,
      fakeMediaDevices: true,
    });
    try {
      const { context, extensionId } = launched;
      let popup = await openRealPopup(context, extensionId);
      const settings = {
        ...DEFAULT_VIDEO_SETTINGS,
        countdownSeconds: 0,
        microphoneEnabled: false,
        systemAudioEnabled: false,
        webcamEnabled: true,
        warnWithoutMicrophone: true,
        qualityProfileId: null,
        outputProfile: {
          ...DEFAULT_VIDEO_SETTINGS.outputProfile,
          resolution: VideoResolutionPreset.P240,
        },
      };
      await popup.evaluate(async (videoSettings) => {
        await chrome.storage.local.set({
          sniptale_video_settings: videoSettings,
          sniptale_video_ui_state: { captureMode: 'CAMERA', viewportPresetId: null },
          'sniptale-locale-preference': 'en',
        });
      }, settings);
      await popup.close();
      popup = await openVideoSetup(context, extensionId);
      await popup.locator(START).click();
      await expect(
        popup.getByText('Start recording without a microphone?', { exact: true })
      ).toBeVisible();
      await popup.screenshot({
        path: info.outputPath('without-microphone-confirmation.png'),
        fullPage: false,
      });
      await popup.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect((await readState(popup)).state.status).toBe(VideoRecordingStatus.IDLE);
      await expect(popup.locator(START)).toBeEnabled();
      await popup.locator(START).click();
      await popup.getByRole('checkbox', { name: 'Don’t ask again', exact: true }).check();
      await popup.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect
        .poll(async () => (await readState(popup)).state.status, { timeout: 30_000 })
        .toBe(VideoRecordingStatus.RECORDING);
      await expect
        .poll(() =>
          popup.evaluate(
            async () =>
              (await chrome.storage.local.get('sniptale_video_settings')).sniptale_video_settings
                ?.warnWithoutMicrophone
          )
        )
        .toBe(false);
      await discardRecording(popup);
      await popup.close();
      popup = await openVideoSetup(context, extensionId);
      await popup.locator(START).click();
      await expect
        .poll(async () => (await readState(popup)).state.status, { timeout: 30_000 })
        .toBe(VideoRecordingStatus.RECORDING);
      await expect(
        popup.getByText('Start recording without a microphone?', { exact: true })
      ).toHaveCount(0);
      await discardRecording(popup);

      const offscreen = await findOffscreenTarget(context);
      await installMicrophoneSignal(context, offscreen);
      const devices = await popup.evaluate(async () => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return {
          microphoneDeviceId:
            devices.find((device) => device.kind === 'audioinput')?.deviceId ?? null,
          webcamDeviceId: devices.find((device) => device.kind === 'videoinput')?.deviceId ?? null,
        };
      });
      const target = await context.newPage();
      await target.goto(`${host.origin}/fixtures/host-page.html?recording-readiness=1`);
      await target.bringToFront();
      const action = await triggerExtensionAction(context, extensionId, target);
      await sendRuntimeMessageInTarget(
        context,
        action,
        {
          type: 'START_RECORDING',
          captureMode: CaptureMode.CAMERA,
          viewportPresetId: null,
          settings: {
            ...settings,
            ...devices,
            countdownSeconds: 10,
            microphoneEnabled: true,
            microphoneGain: 1,
            warnWithoutMicrophone: false,
          },
        },
        false
      );
      await popup.close();
      popup = await openRealPopup(context, extensionId);
      await popup.evaluate(
        ({ startFailure, offscreenFailure }) => {
          const failures: { type: string; error: string }[] = [];
          Reflect.set(globalThis, '__sniptaleReadinessFailures', failures);
          chrome.runtime.onMessage.addListener((message: unknown) => {
            if (
              typeof message !== 'object' ||
              message === null ||
              !('type' in message) ||
              (message.type !== startFailure && message.type !== offscreenFailure) ||
              !('error' in message) ||
              typeof message.error !== 'string'
            ) {
              return;
            }
            if (failures.length < 20) {
              failures.push({ type: message.type, error: message.error });
            }
          });
        },
        {
          startFailure: VideoMessageType.RECORDING_START_FAILED,
          offscreenFailure: VideoMessageType.OFFSCREEN_ERROR,
        }
      );
      await expect
        .poll(async () => (await readState(popup)).state.status)
        .toBe(VideoRecordingStatus.COUNTDOWN);
      await expect(popup.locator(METER)).toBeVisible();
      await expect
        .poll(async () => Number(await popup.locator(METER).getAttribute('aria-valuenow')))
        .toBeGreaterThan(0);
      await expect
        .poll(() =>
          popup
            .locator(PREVIEW)
            .evaluate(
              (video: HTMLVideoElement) =>
                video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
            )
        )
        .toBe(true);
      expect((await readState(popup)).state.duration).toBe(0);
      await popup.screenshot({ path: info.outputPath('countdown-devices.png'), fullPage: false });
      await expect
        .poll(async () => (await readState(popup)).state.status, { timeout: 20_000 })
        .toBe(VideoRecordingStatus.RECORDING);
      await expect(popup.locator(PREVIEW)).toHaveCount(0);
      await expect.poll(async () => (await readState(popup)).state.duration).toBeGreaterThan(1);
      expect(await evaluateInTarget(context, offscreen, READ_SIGNAL)).toEqual({
        microphoneRequests: 1,
        cameraRequests: 1,
        microphoneLive: true,
        cameraLive: true,
        audioState: 'running',
      });
      const quietStartedAt = Date.now();
      await evaluateInTarget(
        context,
        offscreen,
        'globalThis.__sniptaleReadinessSignal.gain.gain.value = 0'
      );
      let lastQuietState: Awaited<ReturnType<typeof readState>> | undefined;
      try {
        await expect
          .poll(
            async () => {
              lastQuietState = await readState(popup);
              return lastQuietState.state.microphoneActivity?.warning;
            },
            { timeout: 27_000 }
          )
          .toBe(true);
      } catch (error) {
        await info.attach('microphone-warning-failure-state', {
          body: JSON.stringify({
            lastQuietState,
            finalState: await readState(popup).catch(() => null),
            signal: await evaluateInTarget(context, offscreen, READ_SIGNAL).catch(() => null),
            recordingFailures: await popup
              .evaluate(() => Reflect.get(globalThis, '__sniptaleReadinessFailures'))
              .catch(() => null),
          }),
          contentType: 'application/json',
        });
        throw error;
      }
      expect(Date.now() - quietStartedAt).toBeGreaterThanOrEqual(19_000);
      await expect(popup.locator(WARNING)).toBeVisible();
      const warningBadge = await popup.evaluate(() => chrome.action.getBadgeBackgroundColor({}));
      expect(warningBadge).toEqual([234, 179, 8, 255]);
      await popup.close();
      popup = await openRealPopup(context, extensionId);
      await expect(popup.locator(WARNING)).toBeVisible();
      await popup.screenshot({
        path: info.outputPath('microphone-quiet-warning.png'),
        fullPage: false,
      });
      await popup.setViewportSize({ width: 1100, height: viewport.size.height });
      expect(
        await popup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await popup.screenshot({
        path: info.outputPath('microphone-quiet-below-1280.png'),
        fullPage: false,
      });
      await popup.setViewportSize(viewport.size);
      await evaluateInTarget(
        context,
        offscreen,
        'globalThis.__sniptaleReadinessSignal.gain.gain.value = 0.1'
      );
      await expect(popup.locator(WARNING)).toHaveCount(0, { timeout: 5_000 });
      await expect
        .poll(async () => (await readState(popup)).state.microphoneActivity?.warning)
        .toBe(false);
      expect(await popup.evaluate(() => chrome.action.getBadgeBackgroundColor({}))).not.toEqual(
        warningBadge
      );
      expect((await readState(popup)).state.status).toBe(VideoRecordingStatus.RECORDING);
      expect(await evaluateInTarget(context, offscreen, READ_SIGNAL)).toEqual({
        microphoneRequests: 1,
        cameraRequests: 1,
        microphoneLive: true,
        cameraLive: true,
        audioState: 'running',
      });
      await popup.screenshot({
        path: info.outputPath('microphone-recovered.png'),
        fullPage: false,
      });
      await discardRecording(popup);
    } finally {
      await closeExtensionBrowser(launched);
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
