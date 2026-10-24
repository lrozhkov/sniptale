import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
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
  sendRuntimeMessage,
  triggerExtensionAction,
} from '../support/recording-action';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { clickNativeStart } from './camera-recorder-design.test-support';

async function readState(page: Page) {
  const response = parseRuntimeResponseForMessage(
    VideoMessageType.GET_RECORDING_STATE,
    await sendRuntimeMessage(page, { type: VideoMessageType.GET_RECORDING_STATE })
  );
  if (response.success !== true || !response.state) {
    throw new Error('TAB camera recording state is unavailable');
  }
  return { ...response, state: response.state };
}

async function installControlledRecordingSensors() {
  const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const audio = new AudioContext({ sampleRate: 48000 });
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const destination = audio.createMediaStreamDestination();
  oscillator.frequency.value = 440;
  gain.gain.value = 0.1;
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  await audio.resume();
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Native camera canvas is unavailable');
  const draw = () => {
    drawing.fillStyle = `hsl(${(performance.now() / 20) % 360} 75% 50%)`;
    drawing.fillRect(0, 0, canvas.width, canvas.height);
  };
  draw();
  const camera = canvas.captureStream(30);
  const timer = setInterval(draw, 33);
  const probe = {
    audio,
    camera,
    destination,
    timer,
    tabRequests: 0,
    cameraRequests: 0,
    microphoneRequests: 0,
    audioErrors: 0,
  };
  Reflect.set(globalThis, '__tabCameraSensors', probe);
  const send = chrome.runtime.sendMessage.bind(chrome.runtime);
  Reflect.set(chrome.runtime, 'sendMessage', (message: unknown) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'OFFSCREEN_ERROR' &&
      'error' in message &&
      typeof message.error === 'string' &&
      /audio/iu.test(message.error)
    )
      probe.audioErrors += 1;
    return send(message);
  });
  // Chromium's global fake-device flag rejects tabCapture IDs. Substitute only sensor inputs.
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const video = constraints?.video;
    if (video && typeof video === 'object' && Reflect.has(video, 'mandatory')) {
      probe.tabRequests += 1;
      return native(constraints);
    }
    const tracks: MediaStreamTrack[] = [];
    if (constraints?.audio) {
      probe.microphoneRequests += 1;
      tracks.push(...destination.stream.clone().getAudioTracks());
    }
    if (video) {
      probe.cameraRequests += 1;
      tracks.push(...camera.clone().getVideoTracks());
    }
    return new MediaStream(tracks);
  };
}

async function installRecordingSensors(context: BrowserContext, includePopupSensors = false) {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('Recording background worker is unavailable');
  await worker.evaluate(async () => {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: `apps/extension/src/offscreen/offscreen.html?offscreenStartupId=${crypto.randomUUID()}`,
        reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA],
        justification: 'Native TAB recording with controlled camera and microphone inputs',
      });
    }
  });
  const browser = context.browser();
  if (!browser) throw new Error('Native recording browser is unavailable');
  const session = await browser.newBrowserCDPSession();
  let targetId: string;
  try {
    const targets = await session.send('Target.getTargets');
    const offscreen = targets.targetInfos.find((target) =>
      target.url.includes('/offscreen/offscreen.html')
    );
    if (!offscreen) throw new Error('Native recording offscreen document is unavailable');
    targetId = offscreen.targetId;
  } finally {
    await session.detach();
  }

  await evaluateInTarget(
    context,
    targetId,
    `(${installControlledRecordingSensors.toString()})()`,
    true
  );
  if (includePopupSensors) await context.addInitScript(installControlledRecordingSensors);
  return targetId;
}

async function inspectSavedArtifacts(page: Page, primaryId: string) {
  return page.evaluate(async (groupId) => {
    const object = (value: unknown): Record<string, unknown> => {
      if (typeof value !== 'object' || value === null)
        throw new Error('Invalid saved media record');
      return Object.fromEntries(Object.entries(value));
    };
    const text = (value: unknown): string => {
      if (typeof value !== 'string' || !value) throw new Error('Missing saved media identity');
      return value;
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (store: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = database.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    let records: unknown[];
    let refs: unknown[];
    try {
      [records, refs] = await Promise.all([read('recordings'), read('asset_refs')]);
    } finally {
      database.close();
    }
    const artifacts = [];
    for (const value of records) {
      const entry = object(value);
      const group = object(entry['recordingGroup']);
      if (group['groupId'] !== groupId) continue;
      const ref = refs.map(object).find((candidate) => candidate['assetId'] === entry['assetId']);
      if (!ref) throw new Error('Saved recording asset is unavailable');
      const location = object(ref['location']);
      const parts = text(location['objectKey']).split('/');
      let directory = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('sniptale-assets');
      for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
      const filename = parts.at(-1);
      if (!filename) throw new Error('Saved recording path is unavailable');
      const file = await (await directory.getFileHandle(filename)).getFile();
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.muted = true;
      document.body.append(video);
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Saved recording video cannot be decoded'));
          video.src = url;
        });
        await video.play();
        await new Promise<void>((resolve, reject) => {
          video.ontimeupdate = () => {
            if (video.currentTime > 0.1) resolve();
          };
          video.onerror = () => reject(new Error('Saved recording video cannot be played'));
        });
        let audio: { duration: number; rms: number } | null = null;
        if (group['role'] === 'display') {
          const decoder = new AudioContext();
          try {
            const pcm = await decoder.decodeAudioData(await file.arrayBuffer());
            const channel = pcm.getChannelData(0);
            let energy = 0;
            for (const sample of channel) energy += sample * sample;
            audio = { duration: pcm.duration, rms: Math.sqrt(energy / channel.length) };
          } finally {
            await decoder.close();
          }
        }
        artifacts.push({
          role: text(group['role']),
          id: text(entry['id']),
          size: file.size,
          width: video.videoWidth,
          height: video.videoHeight,
          playedUntil: video.currentTime,
          audio,
        });
      } finally {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
        URL.revokeObjectURL(url);
      }
    }
    return artifacts;
  }, primaryId);
}

test('TAB popup repeats recording after closing the camera teleprompter companion', async ({}, info) => {
  test.setTimeout(120_000);
  const host = await startHostServer();
  const launched = await launchExtensionBrowser({ viewport: { width: 1280, height: 560 } });
  const startupProof: unknown[] = [];
  try {
    const { context, extensionId } = launched;
    const { page, popup } = await openDesignReview(context, extensionId, host.origin, {
      width: 1280,
      height: 560,
    });
    await context.grantPermissions(['camera', 'microphone']);
    const offscreenId = await installRecordingSensors(context, true);
    await context.addInitScript(() => {
      if (!location.pathname.includes('/camera-recorder/')) return;
      const outcomes: unknown[] = [];
      Reflect.set(globalThis, '__repeatCompanionProof', {
        queryLaunch: new URLSearchParams(location.search).has('launchToken'),
        outcomes,
      });
      const native = chrome.runtime.sendMessage.bind(chrome.runtime);
      Reflect.set(chrome.runtime, 'sendMessage', async (message: unknown) => {
        const type =
          typeof message === 'object' && message !== null && 'type' in message
            ? message.type
            : null;
        const observe =
          type === 'REGISTER_CAMERA_RECORDER_CONTROL' || type === 'GET_RECORDING_STATE';
        try {
          const response: unknown = await native(message);
          if (observe && outcomes.length < 20) {
            const fields =
              typeof response === 'object' && response !== null
                ? Object.fromEntries(
                    Object.entries(response).filter(([key]) =>
                      ['success', 'result', 'error', 'recordingHealth'].includes(key)
                    )
                  )
                : { missing: true };
            outcomes.push({ type, ...fields });
          }
          return response;
        } catch (error) {
          if (observe && outcomes.length < 20)
            outcomes.push({
              type,
              exception:
                error instanceof Error
                  ? error.message.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu, '[identity]')
                  : 'Unknown transport failure',
            });
          throw error;
        }
      });
    });
    await popup.evaluate(async (defaults) => {
      await chrome.storage.local.set({
        sniptale_video_settings: {
          ...defaults,
          microphoneEnabled: true,
          webcamEnabled: true,
          webcamPresentation: { ...defaults.webcamPresentation, mode: 'separate-track' },
          systemAudioEnabled: false,
          countdownSeconds: 0,
          warnWithoutMicrophone: false,
          qualityProfileId: null,
          teleprompterEnabled: false,
        },
        sniptale_video_ui_state: { captureMode: 'TAB', viewportPresetId: null },
        'sniptale-locale-preference': 'en',
      });
    }, DEFAULT_VIDEO_SETTINGS);
    await popup.reload();
    await popup.locator('[data-ui="popup.app.tabs"] button[data-page="video"]').click();
    await popup.getByRole('button', { name: 'Teleprompter', exact: true }).click();
    const cameraPath = '/apps/extension/src/camera-recorder/index.html';
    await expect
      .poll(() =>
        context.pages().some((candidate) => new URL(candidate.url()).pathname === cameraPath)
      )
      .toBe(true);
    let companion = context
      .pages()
      .find((candidate) => new URL(candidate.url()).pathname === cameraPath);
    if (!companion) throw new Error('Prepared teleprompter window is unavailable');
    await expect(companion.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
    for (let run = 0; run < 2; run += 1) {
      await page.bringToFront();
      const action = await triggerExtensionAction(context, extensionId, page);
      await evaluateInTarget(
        context,
        action,
        `(${installControlledRecordingSensors.toString()})()`,
        true
      );
      await clickNativeStart(context, action);
      await expect
        .poll(
          () =>
            context.pages().some((candidate) => new URL(candidate.url()).pathname === cameraPath),
          { timeout: 20_000 }
        )
        .toBe(true);
      companion = context
        .pages()
        .find((candidate) => new URL(candidate.url()).pathname === cameraPath);
      if (!companion) throw new Error('Recording companion is unavailable');
      try {
        await expect(companion.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled({
          timeout: 20_000,
        });
        await expect(companion.getByRole('alert')).toHaveCount(0);
        const registration = await companion.evaluate(() =>
          Reflect.get(globalThis, '__repeatCompanionProof')
        );
        startupProof.push({ run: run + 1, registration });
        if (run === 1) expect(registration).toMatchObject({ queryLaunch: true });
        await expect
          .poll(
            async () => {
              const { state } = await readState(popup);
              return state.status === VideoRecordingStatus.RECORDING && state.duration > 3;
            },
            { timeout: 30_000 }
          )
          .toBe(true);
        await companion.screenshot({
          path: info.outputPath(`repeat-companion-${run + 1}.png`),
          fullPage: false,
        });
        await companion.getByRole('button', { name: 'Stop', exact: true }).click();
        await expect
          .poll(async () => (await readState(popup)).postRecordResult, { timeout: 30_000 })
          .toBeTruthy();
        const saved = (await readState(popup)).postRecordResult!;
        const artifacts = await inspectSavedArtifacts(popup, saved.primaryRecordingId);
        startupProof.push({ run: run + 1, artifacts });
        expect(artifacts.map((artifact) => artifact.role).sort()).toEqual(['display', 'webcam']);
        const primary = artifacts.find((artifact) => artifact.id === saved.primaryRecordingId);
        expect(primary?.audio?.duration).toBeGreaterThan(3);
        expect(primary?.audio?.rms).toBeGreaterThan(0.001);
        await expect(companion.locator('[data-ui="camera-recorder.result"]')).toBeVisible();
        await companion.getByRole('button', { name: 'Close', exact: true }).click();
        await expect.poll(() => companion?.isClosed()).toBe(true);
      } catch (error) {
        startupProof.push({
          run: run + 1,
          state: (await readState(popup)).state,
          registration: await companion.evaluate(() =>
            Reflect.get(globalThis, '__repeatCompanionProof')
          ),
          audioErrors: await evaluateInTarget(
            context,
            offscreenId,
            'globalThis.__tabCameraSensors.audioErrors'
          ),
          alerts: await companion.getByRole('alert').allTextContents(),
          popup: await evaluateInTarget(context, action, 'document.body.innerText').catch(
            () => 'Popup closed'
          ),
        });
        throw error;
      }
    }
    const sensors = await evaluateInTarget(
      context,
      offscreenId,
      `(() => {
      const probe = globalThis.__tabCameraSensors;
      return { tab: probe.tabRequests, camera: probe.cameraRequests, microphone: probe.microphoneRequests, audioErrors: probe.audioErrors };
    })()`
    );
    startupProof.push({ sensors });
    expect(sensors).toEqual({ tab: 2, camera: 2, microphone: 2, audioErrors: 0 });
  } finally {
    const proofPath = info.outputPath('repeat-companion-proof.json');
    await writeFile(proofPath, JSON.stringify(startupProof, null, 2));
    await info.attach('repeat-companion-proof', {
      path: proofPath,
      contentType: 'application/json',
    });
    await closeExtensionBrowser(launched);
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`TAB toolbar records controlled camera and microphone into playable artifacts ${viewport.name}`, async ({}, info) => {
    test.setTimeout(100_000);
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({
      viewport: viewport.size,
    });
    try {
      const { context, extensionId } = launched;
      const { page, popup } = await openDesignReview(
        context,
        extensionId,
        host.origin,
        viewport.size
      );
      const contentMessages: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
          contentMessages.push(message.text());
        }
      });
      await context.grantPermissions(['camera', 'microphone']);
      const worker = context.serviceWorkers()[0];
      if (!worker) throw new Error('Recording background worker is unavailable');
      expect(
        await worker.evaluate(async () => ({
          camera: (await navigator.permissions.query({ name: 'camera' as PermissionName })).state,
          microphone: (await navigator.permissions.query({ name: 'microphone' as PermissionName }))
            .state,
        }))
      ).toEqual({ camera: 'granted', microphone: 'granted' });
      await popup.evaluate(
        async (defaults) => {
          await chrome.storage.local.set({
            sniptale_video_settings: {
              ...defaults,
              microphoneDeviceId: null,
              microphoneEnabled: true,
              webcamDeviceId: null,
              webcamEnabled: true,
              webcamPresentation: { ...defaults.webcamPresentation, mode: 'separate-track' },
              systemAudioEnabled: false,
              countdownSeconds: 0,
              warnWithoutMicrophone: false,
              qualityProfileId: null,
            },
            sniptale_video_ui_state: { captureMode: 'TAB', viewportPresetId: null },
            'sniptale-locale-preference': 'en',
          });
        },
        {
          ...DEFAULT_VIDEO_SETTINGS,
          outputProfile: {
            ...DEFAULT_VIDEO_SETTINGS.outputProfile,
            resolution: VideoResolutionPreset.SOURCE,
          },
        }
      );
      await page.bringToFront();
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
      for (const kind of ['camera', 'microphone']) {
        await expect(
          page.locator(`[data-ui="content.toolbar.video-recording.${kind}.toggle"]`)
        ).toHaveAttribute('aria-pressed', 'true');
      }
      const action = await triggerExtensionAction(context, extensionId, page);
      await evaluateInTarget(context, action, 'window.close()').catch(() => undefined);
      await page.bringToFront();
      const offscreenId = await installRecordingSensors(context);
      await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
      try {
        await expect
          .poll(
            async () => {
              const { state } = await readState(popup);
              return { status: state.status, mode: state.captureMode, error: state.error };
            },
            { timeout: 30_000 }
          )
          .toEqual({
            status: VideoRecordingStatus.RECORDING,
            mode: CaptureMode.TAB,
            error: null,
          });
      } catch (error) {
        const diagnostics = {
          state: await readState(popup),
          content: await page.locator('body').innerText(),
          toolbar: await page.locator('[data-ui="content.toolbar.root"]').innerText(),
          toasts: await page.locator('.sniptale-toast').allTextContents(),
          contentMessages,
          popup: await popup.locator('body').innerText(),
        };
        console.log('TAB_CAMERA_START_FAILURE', JSON.stringify(diagnostics));
        await info.attach('tab-camera-start-failure', {
          body: JSON.stringify(diagnostics, null, 2),
          contentType: 'application/json',
        });
        await page.screenshot({
          path: info.outputPath('tab-camera-start-failure.png'),
          fullPage: false,
        });
        throw error;
      }
      await expect
        .poll(async () => (await readState(popup)).state.duration, {
          timeout: 30_000,
        })
        .toBeGreaterThan(3);
      expect(
        await evaluateInTarget(
          context,
          offscreenId,
          `(() => {
        const probe = globalThis.__tabCameraSensors;
        return { tab: probe.tabRequests, camera: probe.cameraRequests, microphone: probe.microphoneRequests };
      })()`
        )
      ).toMatchObject({ tab: 1, camera: 1, microphone: 1 });
      expect((await readState(popup)).state.liveMedia).toMatchObject({
        microphoneEnabled: true,
        webcamEnabled: true,
      });
      await page.screenshot({
        path: info.outputPath('tab-camera-microphone-recording.png'),
        fullPage: false,
      });
      await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
      await expect
        .poll(async () => (await readState(popup)).postRecordResult, {
          timeout: 30_000,
        })
        .toBeTruthy();
      const saved = (await readState(popup)).postRecordResult!;
      const artifacts = await inspectSavedArtifacts(popup, saved.primaryRecordingId);
      const artifactProof = info.outputPath('saved-tab-camera-artifacts.json');
      await writeFile(artifactProof, JSON.stringify(artifacts, null, 2));
      await info.attach('saved-tab-camera-artifacts', {
        path: artifactProof,
        contentType: 'application/json',
      });
      expect(artifacts.map((artifact) => artifact.role).sort()).toEqual(['display', 'webcam']);
      for (const artifact of artifacts) {
        expect(artifact.size).toBeGreaterThan(0);
        expect(artifact.width).toBeGreaterThan(0);
        expect(artifact.height).toBeGreaterThan(0);
        expect(artifact.playedUntil).toBeGreaterThan(0.1);
      }
      const display = artifacts.find((artifact) => artifact.id === saved.primaryRecordingId);
      expect(display?.audio?.duration).toBeGreaterThan(3);
      expect(display?.audio?.rms).toBeGreaterThan(0.001);
      expect((await readState(popup)).state.error).toBeNull();
    } finally {
      await closeExtensionBrowser(launched);
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
