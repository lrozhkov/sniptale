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

async function installRecordingSensors(context: BrowserContext) {
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
  const install = async () => {
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
    };
    Reflect.set(globalThis, '__tabCameraSensors', probe);
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
  };
  await evaluateInTarget(context, targetId, `(${install.toString()})()`, true);
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
