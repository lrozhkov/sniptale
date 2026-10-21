import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { z } from 'zod';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  CaptureMode,
  VideoRecordingStatus,
  VideoResolutionPreset,
  VideoOutputCodec,
  VideoOutputContainer,
} from '@sniptale/runtime-contracts/video/types/types';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  openRealPopup,
  sendRuntimeMessage,
  sendRuntimeMessageInTarget,
  triggerExtensionAction,
  evaluateInTarget,
} from '../support/recording-action';

const replySchema = z.object({
  state: z.object({ status: z.string(), duration: z.number(), error: z.unknown() }),
  postRecordResult: z.object({ recordingId: z.string() }).nullish(),
});

async function recordingState(page: Page) {
  return replySchema.parse(await sendRuntimeMessage(page, { type: 'GET_RECORDING_STATE' }));
}

async function observeSourceSizes(context: BrowserContext) {
  const browser = context.browser();
  if (!browser) throw new Error('Recording browser unavailable');
  const session = await browser.newBrowserCDPSession();
  const targets = await session.send('Target.getTargets');
  await session.detach();
  const target = targets.targetInfos.find((entry) => entry.url.includes('/offscreen/'));
  if (!target) throw new Error('Recording offscreen target unavailable');
  const install = () => {
    const sizes: string[] = [];
    Reflect.set(globalThis, '__recordingSourceSizes', sizes);
    const read = ReadableStreamDefaultReader.prototype.read;
    ReadableStreamDefaultReader.prototype.read = function () {
      return read.call(this).then((result) => {
        const frame: unknown = result.value;
        if (frame instanceof VideoFrame) {
          const size = `${frame.codedWidth}x${frame.codedHeight}`;
          if (!sizes.includes(size)) sizes.push(size);
        }
        return result;
      });
    };
  };
  await evaluateInTarget(context, target.targetId, `(${install.toString()})()`);
  return async () =>
    z
      .array(z.string())
      .parse(await evaluateInTarget(context, target.targetId, 'globalThis.__recordingSourceSizes'));
}

async function inspectSavedVideo(page: Page) {
  const refs = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const request = database.transaction('asset_refs').objectStore('asset_refs').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
  const [asset] = z
    .array(z.object({ location: z.object({ objectKey: z.string() }) }))
    .min(1)
    .parse(refs);
  return page.evaluate(async (objectKey) => {
    let directory = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('sniptale-assets');
    const parts = objectKey.split('/');
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    const file = await (await directory.getFileHandle(parts.at(-1)!)).getFile();
    const video = document.createElement('video');
    video.muted = true;
    const url = URL.createObjectURL(file);
    try {
      const ready = new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () =>
          reject(new Error(`Saved video failed to decode: ${video.error?.message}`));
      });
      video.src = url;
      await ready;
      const dimensions = { width: video.videoWidth, height: video.videoHeight };
      const canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Video inspection canvas unavailable');
      const frames = [];
      for (const timestamp of [1, 3, 5]) {
        const seeked = new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        });
        video.currentTime = timestamp;
        await seeked;
        context.drawImage(video, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const corners = Array.from({ length: 4 }, () => ({ count: 0, width: 0, height: 0 }));
        const horizontal = [0, 0, 0, 0];
        const vertical = Array.from({ length: 4 }, () => new Uint32Array(canvas.width));
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const red = pixels[offset]!;
          const green = pixels[offset + 1]!;
          const blue = pixels[offset + 2]!;
          const color =
            red > 180 && green < 90 && blue < 90
              ? 0
              : red < 90 && green > 180 && blue < 90
                ? 1
                : red < 90 && green < 90 && blue > 180
                  ? 2
                  : red > 180 && green > 180 && blue < 90
                    ? 3
                    : -1;
          const column = (offset / 4) % canvas.width;
          for (const [index, marker] of corners.entries()) {
            if (index === color) {
              marker.count += 1;
              horizontal[index] = column === 0 ? 1 : horizontal[index]! + 1;
              vertical[index]![column]! += 1;
              marker.width = Math.max(marker.width, horizontal[index]!);
              marker.height = Math.max(marker.height, vertical[index]![column]!);
            } else {
              horizontal[index] = 0;
              vertical[index]![column] = 0;
            }
          }
        }
        frames.push({
          timestamp: video.currentTime,
          width: video.videoWidth,
          height: video.videoHeight,
          corners,
        });
      }
      return {
        dimensions,
        duration: Number.isFinite(video.duration) ? video.duration : null,
        frames,
        bytes: file.size,
      };
    } finally {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
  }, asset!.location.objectKey);
}

for (const codec of [VideoOutputCodec.VP9, VideoOutputCodec.AVC]) {
  test(`native window SOURCE recording survives fullscreen and restore with ${codec}`, async ({}, info) => {
    test.setTimeout(120_000);
    const host = await startHostServer();
    let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
    try {
      launched = await launchExtensionBrowser({
        viewport: { width: 1280, height: 560 },
        windowCaptureTitle: 'Sniptale native capture',
      });
      const { context, extensionId } = launched;
      const popup = await openRealPopup(context, extensionId);
      await sendRuntimeMessage(popup, {
        type: 'PAGE_ACCESS',
        operation: 'register-granted-all-sites',
      });
      const target = await context.newPage();
      await target.goto(`${host.origin}/fixtures/host-page.html?window-resize=${codec}`);
      await target.evaluate(() => {
        document.title = 'Sniptale native capture';
        for (const [index, color] of [
          'rgb(240,20,20)',
          'rgb(20,240,20)',
          'rgb(20,20,240)',
          'rgb(240,240,20)',
        ].entries()) {
          const marker = document.createElement('div');
          marker.style.cssText = `position:fixed;width:48px;height:48px;background:${color};z-index:1000;${index < 2 ? 'top' : 'bottom'}:0;${index % 2 ? 'right' : 'left'}:0;`;
          document.body.append(marker);
        }
        const clock = document.createElement('div');
        document.body.append(clock);
        const paint = () => {
          clock.textContent = String(performance.now());
          requestAnimationFrame(paint);
        };
        requestAnimationFrame(paint);
      });
      const source = await popup.evaluate(async (url) => {
        const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
        if (tab?.id === undefined) throw new Error('Source tab unavailable');
        const window = await chrome.windows.create({
          tabId: tab.id,
          type: 'normal',
          width: 1366,
          height: 768,
        });
        if (window.id === undefined) throw new Error('Source window unavailable');
        return { tabId: tab.id, windowId: window.id };
      }, target.url());
      await target.bringToFront();
      const action = await triggerExtensionAction(context, extensionId, target);
      await sendRuntimeMessageInTarget(
        context,
        action,
        {
          type: 'START_RECORDING',
          captureMode: CaptureMode.SCREEN,
          tabId: source.tabId,
          viewportPresetId: null,
          settings: {
            ...DEFAULT_VIDEO_SETTINGS,
            countdownSeconds: 0,
            microphoneEnabled: false,
            webcamEnabled: false,
            systemAudioEnabled: false,
            controlledCursorCaptureEnabled: false,
            sourceCount: 1,
            qualityProfileId: null,
            outputProfile: {
              ...DEFAULT_VIDEO_SETTINGS.outputProfile,
              codec,
              container:
                codec === VideoOutputCodec.AVC
                  ? VideoOutputContainer.MP4
                  : VideoOutputContainer.WEBM,
              resolution: VideoResolutionPreset.SOURCE,
              frameRate: 30,
            },
          },
        },
        false
      );
      const waitForDuration = async (minimum: number) => {
        await expect
          .poll(
            async () => {
              const { state } = await recordingState(popup);
              return {
                status: state.status,
                error: state.error,
                minimumReached: state.duration >= minimum,
              };
            },
            { timeout: 30_000 }
          )
          .toEqual({ status: VideoRecordingStatus.RECORDING, error: null, minimumReached: true });
      };
      await waitForDuration(2);
      const sourceSizes = await observeSourceSizes(context);
      await popup.evaluate(
        (windowId) => chrome.windows.update(windowId, { state: 'fullscreen' }),
        source.windowId
      );
      await waitForDuration(4);
      await popup.evaluate(
        (windowId) =>
          chrome.windows.update(windowId, { state: 'normal', width: 1366, height: 768 }),
        source.windowId
      );
      await waitForDuration(6);
      const capturedSizes = await sourceSizes();
      await info.attach('native-source-sizes', {
        body: JSON.stringify(capturedSizes),
        contentType: 'application/json',
      });
      await popup.reload();
      await popup.locator('[data-ui="popup.video-active.stop-button"]').click();
      await expect
        .poll(async () => (await recordingState(popup)).postRecordResult, { timeout: 30_000 })
        .toBeTruthy();
      const report = await inspectSavedVideo(popup);
      await info.attach('fullscreen-recording-evidence', {
        body: JSON.stringify(report),
        contentType: 'application/json',
      });
      expect(report.frames.map((frame) => frame.timestamp)).toEqual([1, 3, 5]);
      expect(report.bytes).toBeGreaterThan(1000);
      expect(
        capturedSizes.some(
          (size) => size !== `${report.dimensions.width}x${report.dimensions.height}`
        )
      ).toBe(true);
      for (const frame of report.frames) {
        expect({ width: frame.width, height: frame.height }).toEqual(report.dimensions);
        for (const marker of frame.corners) {
          expect(marker.count).toBeGreaterThanOrEqual(80);
          expect(Math.abs(marker.width - marker.height)).toBeLessThanOrEqual(3);
        }
      }
      await target.screenshot({ path: info.outputPath('restored-window.png'), fullPage: false });
    } finally {
      if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
