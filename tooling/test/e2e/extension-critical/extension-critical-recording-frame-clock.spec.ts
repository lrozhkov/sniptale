import { translate } from '../../../../apps/extension/src/platform/i18n';
import { projectRecordingObservationClock } from '../../../../apps/extension/src/features/video/project/observation-clock';
import type { RecordingTelemetryEntry } from '../../../../apps/extension/src/composition/persistence/recordings/contracts';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import http from 'node:http';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  CaptureMode,
  VideoRecordingStatus,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingFrameClockAnchor } from '../../../../apps/extension/src/contracts/video/recording-frame-clock';
import { resolveBrowserViewport } from '../support/browser-viewport';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { installReviewModeChoice } from '../support/quick-editor-media-fixture';

import {
  sendRuntimeMessage,
  openRealPopup,
  triggerExtensionAction,
  sendRuntimeMessageInTarget,
  evaluateInTarget,
} from '../support/recording-action';
interface NativeFramePair {
  sourceTimestampUs: number;
  chosenTimestampUs: number;
  epoch: number;
}
interface ClockSample {
  label: string;
  document: { dateNow: number; timeOrigin: number; now: number };
  metrics: { name: string; value: number }[];
}
interface SourceEvent {
  epoch: number;
  origin: number;
  x: number;
  y: number;
  trusted: boolean;
  label: string;
}
interface ClockEvent {
  type: string;
  frameClock: RecordingFrameClockAnchor | null;
}
interface RecordedAction {
  time: number;
  point: { x: number; y: number };
  recordingPoint: { x: number; y: number };
}
interface DecodedFrame {
  pts: number;
  marker: [number, number] | null;
  paintIndex: number;
}
interface SourcePaint {
  index: number;
  epoch: number;
  origin: number;
  markerX: number | null;
}
interface DecodedVideo {
  width: number;
  height: number;
  frames: DecodedFrame[];
  keys: number[];
}

async function countDurableRecordings(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === 'sniptale-db')) return 0;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = database
        .transaction('recordings', 'readonly')
        .objectStore('recordings')
        .count();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    return count;
  });
}

const TARGET_HTML = `<!doctype html>
<title>Clock moving target</title>
<style>html,body{margin:0}canvas{display:block}</style>
<canvas id="c" width="1280" height="560">
</canvas>
<script>
const c=document.getElementById('c'),ctx=c.getContext('2d');
 const epoch=performance.now();
 window.raw=[];
window.paints=[];
let paintIndex=0;
let clicked=null;

document.addEventListener('pointerdown',e=>{window.raw.push({
  epoch:performance.timeOrigin+e.timeStamp,origin:performance.timeOrigin,
  x:e.clientX,y:e.clientY,trusted:e.isTrusted});
clicked={x:e.clientX,y:e.clientY,at:performance.now()}});

function draw(){const stamp=performance.now()-epoch;
const index=paintIndex++;
window.paints.push({index,epoch:performance.timeOrigin+performance.now(),
  origin:performance.timeOrigin,markerX:clicked&&performance.now()-clicked.at<160?clicked.x:null});
ctx.fillStyle='white';
ctx.fillRect(0,0,1280,560);
for(let b=0;
b<20;
b++){ctx.fillStyle=index&(1<<b)?'white':'black';
ctx.fillRect(b*20,0,20,30)}ctx.strokeStyle='#ccc';
for(let x=0;
x<1280;
x+=80){ctx.beginPath();
ctx.moveTo(x,40);
ctx.lineTo(x,560);
ctx.stroke()};
ctx.fillStyle='blue';
const x=20+(stamp/4)%1120;
ctx.fillRect(x,200,80,60);
if(clicked&&performance.now()-clicked.at<160){ctx.fillStyle='red';
ctx.fillRect(clicked.x-12,310,24,40)}window.targetX=x+40;
requestAnimationFrame(draw)}draw();

</script>
`;

/** Passive constructor metadata: preserves each frame, timestamp argument and native prototype. */
async function observeNativeFrameTimestampPairs(context: BrowserContext): Promise<string> {
  const browser = context.browser();
  if (!browser) throw new Error('Extension context has no browser owner');
  const session = await browser.newBrowserCDPSession();
  let targetId: string | undefined;
  try {
    const targets = await session.send('Target.getTargets');
    targetId = targets.targetInfos.find((target) => target.url.includes('/offscreen'))?.targetId;
  } finally {
    await session.detach();
  }
  if (!targetId) throw new Error('Native recording observer target is unavailable');
  const install = () => {
    const Native = VideoFrame;
    const pairs: { sourceTimestampUs: number; chosenTimestampUs: number; epoch: number }[] = [];
    Reflect.set(window, '__nativeFramePairs', pairs);
    Reflect.set(
      window,
      'VideoFrame',
      new Proxy(Native, {
        construct(target, args, newTarget) {
          const frame = Reflect.construct(target, args, newTarget) as VideoFrame;
          const input: unknown = args[0],
            init: unknown = args[1];
          if (
            pairs.length < 1024 &&
            input instanceof Native &&
            typeof init === 'object' &&
            init !== null &&
            'timestamp' in init &&
            typeof init.timestamp === 'number'
          ) {
            pairs.push({
              sourceTimestampUs: input.timestamp,
              chosenTimestampUs: init.timestamp,
              epoch: performance.timeOrigin + performance.now(),
            });
          }
          return frame;
        },
      })
    );
  };
  await evaluateInTarget(context, targetId, `(${install.toString()})()`);
  return targetId;
}

async function readNativeFrameTimestampPairs(context: BrowserContext, targetId: string) {
  return (await evaluateInTarget(
    context,
    targetId,
    "Reflect.get(window,'__nativeFramePairs') ?? []"
  )) as NativeFramePair[];
}

async function readSavedRecording(page: Page) {
  return page.evaluate(async () => {
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
    const telemetry = (await read('recording_telemetry')) as RecordingTelemetryEntry[];
    const refs = (await read('asset_refs')) as { location: { objectKey: string } }[];
    database.close();
    let directory = await navigator.storage.getDirectory();
    directory = await directory.getDirectoryHandle('sniptale-assets');
    const parts = refs[0]!.location.objectKey.split('/');
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    const file = await (await directory.getFileHandle(parts.at(-1)!)).getFile();
    const helpers = (await chrome.tabs.query({})).filter((tab) =>
      tab.url?.includes('/recording-clock/')
    ).length;
    return {
      telemetry: telemetry[0]!,
      helpers,
      bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    };
  });
}

async function decodeSavedVideo(page: Page, bytes: number[]): Promise<DecodedVideo> {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
      import {Input, BlobSource, ALL_FORMATS, VideoSampleSink, EncodedPacketSink} from 'mediabunny';
      globalThis.decodeClockVideo = async (bytes) => {
        const input = new Input({source:new BlobSource(new Blob([new Uint8Array(bytes)])),formats:ALL_FORMATS});
        try {
          const track = await input.getPrimaryVideoTrack();
          const width = track.displayWidth, height = track.displayHeight;
          const canvas = new OffscreenCanvas(width,height), context = canvas.getContext('2d');
          const frames = [], keys = [];
          for await (const sample of new VideoSampleSink(track).samples()) {
            const frame = sample.toVideoFrame();
            try {
              context.drawImage(frame,0,0);
              const row = context.getImageData(0,Math.floor(height*330/560),width,1).data;
              const red = [];
              for(let x=0;x<width;x++) if(row[x*4]>150&&row[x*4+1]<100&&row[x*4+2]<100) red.push(x);
              const bits = context.getImageData(0,Math.floor(height*10/560),width,1).data;
              let paintIndex=0;
              for(let bit=0;bit<20;bit++) if(bits[Math.floor((bit*20+10)*width/1280)*4]>128) paintIndex|=1<<bit;
              frames.push({pts:sample.timestamp,marker:red.length?[red[0],red.at(-1)]:null,paintIndex});
            } finally { frame.close(); sample.close(); }
          }
          for await (const packet of new EncodedPacketSink(track).packets())
            if(packet.type==='key') keys.push(packet.timestamp);
          return {width,height,frames,keys};
        } finally { input.dispose(); }
      };`,
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
  });
  await page.evaluate(bundle.outputFiles[0]!.text);
  return page.evaluate((data) => Reflect.get(window, 'decodeClockVideo')(data), bytes);
}

/** Faults only the optional isolated-world query; native capture and ordinary messages stay original. */
async function refuseContentCalibration(
  context: BrowserContext,
  target: Page,
  extensionId: string
) {
  const session = await context.newCDPSession(target);
  const contexts: { id: number; name: string }[] = [];
  session.on('Runtime.executionContextCreated', (event) => contexts.push(event.context));
  try {
    await session.send('Runtime.enable');
    let installed: number | null = null;
    for (const world of contexts) {
      const result = await session.send('Runtime.evaluate', {
        contextId: world.id,
        returnByValue: true,
        expression: `(() => {
          if (typeof chrome === 'undefined' || chrome.runtime?.id !== ${JSON.stringify(extensionId)}
              || !chrome.runtime.sendMessage) return false;
          const original = chrome.runtime.sendMessage.bind(chrome.runtime);
          globalThis.__calibrationFaults = 0;
          chrome.runtime.sendMessage = (...args) => {
            if (args[0]?.recordingClock) {
              globalThis.__calibrationFaults++;
              return Promise.reject(new Error('Forced optional calibration failure'));
            }
            return original(...args);
          };
          return true;
        })()`,
      });
      if (result.result.value === true) installed = world.id;
    }
    expect(installed).not.toBeNull();
    return installed!;
  } finally {
    await session.detach();
  }
}

for (const { resolution, fault, crop } of [
  { resolution: VideoResolutionPreset.SOURCE, fault: false, crop: false },
  { resolution: VideoResolutionPreset.P240, fault: false, crop: false },
  { resolution: VideoResolutionPreset.SOURCE, fault: true, crop: false },
  { resolution: VideoResolutionPreset.SOURCE, fault: false, crop: true },
]) {
  test(
    `${crop ? 'TAB_CROP' : 'TAB'} native clock preserves source events and encoded frame points ` +
      `at ${resolution} (calibration failure=${fault})`,
    async ({}, info) => {
      test.setTimeout(90000);
      const server = http.createServer((_request, response) => {
        response.setHeader('content-type', 'text/html');
        response.end(TARGET_HTML);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
      try {
        launched = await launchExtensionBrowser({ viewport: { width: 1280, height: 560 } });
        const { context, extensionId } = launched;
        const createdHelpers: string[] = [];
        context.on('page', (page) => {
          page.on('framenavigated', (frame) => {
            if (frame.url().includes('/recording-clock/')) createdHelpers.push(frame.url());
          });
        });
        const popup = await openRealPopup(context, extensionId);
        await popup.evaluate(() => {
          Reflect.set(window, '__clockEvents', []);
          chrome.runtime.onMessage.addListener((message) => {
            if (
              [
                'OFFSCREEN_RECORDING_STARTED',
                'OFFSCREEN_RECORDING_PAUSED',
                'OFFSCREEN_RECORDING_RESUMED',
              ].includes(message.type)
            ) {
              Reflect.get(window, '__clockEvents').push({
                type: message.type,
                frameClock: message.frameClock ?? null,
              });
            }
            return false;
          });
        });
        expect(
          await sendRuntimeMessage(popup, {
            operation: 'register-granted-all-sites',
            type: 'PAGE_ACCESS',
          })
        ).toMatchObject({ success: true });
        const address = server.address();
        if (!address || typeof address === 'string')
          throw new Error('Clock fixture server has no port');
        const origin = `http://127.0.0.1:${address.port}`;
        const target = await context.newPage();
        const regionResponseErrors: string[] = [];
        target.on('console', (message) => {
          if (message.text().includes('Failed to notify selected region'))
            regionResponseErrors.push(message.text());
        });
        await target.goto(origin + '/initial');
        await target.bringToFront();
        const actionTarget = await triggerExtensionAction(context, extensionId, target);
        const tabId = await popup.evaluate(
          async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id,
          target.url()
        );
        expect(
          await sendRuntimeMessage(popup, {
            operation: 'register-granted-all-sites',
            tabId,
            type: 'PAGE_ACCESS',
          })
        ).toMatchObject({ success: true });
        const faultWorldId = fault
          ? await refuseContentCalibration(context, target, extensionId)
          : null;
        await sendRuntimeMessageInTarget(
          context,
          actionTarget,
          {
            type: 'START_RECORDING',
            captureMode: crop ? CaptureMode.TAB_CROP : CaptureMode.TAB,
            tabId,
            viewportPresetId: null,
            settings: {
              ...DEFAULT_VIDEO_SETTINGS,
              outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, resolution },
              qualityProfileId: null,
              controlledCursorCaptureEnabled: false,
              countdownSeconds: fault ? 3 : 0,
              microphoneEnabled: false,
              sourceCount: 1,
              systemAudioEnabled: false,
              webcamEnabled: false,
            },
          },
          false
        );
        if (crop) {
          await target.locator('#sniptale-region-selector-root').waitFor();
          await target.bringToFront();
          await target.locator('#sniptale-width-input').fill('1281');
          await target.locator('#sniptale-width-input').press('Enter');
          await target.locator('#sniptale-height-input').fill('561');
          await target.locator('#sniptale-height-input').press('Enter');
          await expect(target.locator('#sniptale-width-input')).toHaveValue('1280');
          await expect(target.locator('#sniptale-height-input')).toHaveValue('560');
          await target.locator('.sniptale-selection-size-confirm-button').click({ timeout: 5000 });
        }
        const state = () => sendRuntimeMessage(popup, { type: 'GET_RECORDING_STATE' });
        await expect
          .poll(state, { timeout: 20000 })
          .toMatchObject({ success: true, state: { status: VideoRecordingStatus.RECORDING } });
        expect(regionResponseErrors).toEqual([]);
        if (faultWorldId !== null) {
          const session = await context.newCDPSession(target);
          try {
            await expect
              .poll(async () => {
                const result = await session.send('Runtime.evaluate', {
                  contextId: faultWorldId,
                  expression: 'globalThis.__calibrationFaults',
                  returnByValue: true,
                });
                return result.result.value;
              })
              .toBeGreaterThan(0);
          } finally {
            await session.detach();
          }
        }
        const { recordingId, controlToken } = (await state()) as {
          recordingId: string;
          controlToken: string;
        };
        const active = { recordingId, controlToken };
        const nativeFrameTarget = await observeNativeFrameTimestampPairs(context);
        const source: SourceEvent[] = [];
        const clockSamples: ClockSample[] = [];
        const paints: SourcePaint[] = [];
        const click = async (label: string) => {
          await target.bringToFront();
          await target.waitForTimeout(180);
          const x = await target.evaluate(() => Reflect.get(window, 'targetX') as number);
          await target.mouse.click(x, 230);
          const event = await target.evaluate(
            () => Reflect.get(window, 'raw').at(-1) as SourceEvent
          );
          source.push({ ...event, label });
          const session = await context.newCDPSession(target);
          try {
            await session.send('Performance.enable');
            const metrics = await session.send('Performance.getMetrics');
            const document = await target.evaluate(() => ({
              dateNow: Date.now(),
              timeOrigin: performance.timeOrigin,
              now: performance.now(),
            }));
            clockSamples.push({
              label,
              document,
              metrics: metrics.metrics.filter((item) =>
                ['Timestamp', 'NavigationStart'].includes(item.name)
              ),
            });
          } finally {
            await session.detach();
          }
        };
        await click('initial');
        await target.waitForTimeout(220);
        expect(
          await sendRuntimeMessage(popup, { type: 'PAUSE_RECORDING', ...active })
        ).toMatchObject({ result: 'accepted' });
        await expect.poll(state).toMatchObject({ state: { status: VideoRecordingStatus.PAUSED } });
        await click('excluded-paused');
        await target.waitForTimeout(300);
        expect(
          await sendRuntimeMessage(popup, { type: 'RESUME_RECORDING', ...active })
        ).toMatchObject({ result: 'accepted' });
        await expect
          .poll(state)
          .toMatchObject({ state: { status: VideoRecordingStatus.RECORDING } });
        await click('resumed');
        await target.waitForTimeout(220);
        paints.push(
          ...(await target.evaluate(() => Reflect.get(window, 'paints') as SourcePaint[]))
        );
        await target.goto(origin + '/navigation');
        await target.waitForTimeout(300);
        await click('navigated');
        await target.waitForTimeout(220);
        paints.push(
          ...(await target.evaluate(() => Reflect.get(window, 'paints') as SourcePaint[]))
        );
        await target.screenshot({ path: info.outputPath('moving-source.png'), fullPage: false });
        const clocks = await popup.evaluate(
          () => Reflect.get(window, '__clockEvents') as ClockEvent[]
        );
        const nativeFramePairs = await readNativeFrameTimestampPairs(context, nativeFrameTarget);
        expect(
          await sendRuntimeMessage(popup, { type: 'STOP_RECORDING', ...active })
        ).toMatchObject({
          result: 'accepted',
        });
        await expect.poll(() => countDurableRecordings(popup), { timeout: 30000 }).toBe(1);
        const rawSaved = await readSavedRecording(popup);
        const saved = {
          ...rawSaved,
          actions: projectRecordingObservationClock(rawSaved.telemetry)
            .actionEvents as RecordedAction[],
        };
        await writeFile(info.outputPath('native-recording.webm'), Buffer.from(saved.bytes));
        const decoded = await decodeSavedVideo(popup, saved.bytes);
        await writeFile(
          info.outputPath('raw-clock-evidence.json'),
          JSON.stringify(
            {
              resolution,
              source,
              clockSamples,
              nativeFramePairs,
              paints,
              clocks,
              actions: saved.actions,
              rawTelemetry: saved.telemetry,
              decoded,
              helpers: saved.helpers,
            },
            null,
            2
          )
        );
        const retained = source.filter((event) => event.label !== 'excluded-paused');
        expect(saved.actions).toHaveLength(retained.length);
        expect(saved.helpers).toBe(0);
        expect(createdHelpers).toEqual([]);
        expect(source.every((event) => event.trusted)).toBe(true);
        expect(retained[0]!.origin).not.toBe(retained.at(-1)!.origin);
        expect(decoded.height).toBe(resolution === VideoResolutionPreset.SOURCE ? 560 : 240);
        if (fault) {
          expect(saved.telemetry.capabilities?.timing).toEqual({
            mode: 'approximate',
            accuracyMs: null,
          });
          expect(saved.telemetry.cursorTrack?.samples.length).toBeGreaterThan(0);
          const filename = await popup.evaluate(async () => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open('sniptale-db');
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            try {
              return await new Promise<string>((resolve, reject) => {
                const request = db.transaction('recordings').objectStore('recordings').getAll();
                request.onsuccess = () => resolve(request.result[0].filename);
                request.onerror = () => reject(request.error);
              });
            } finally {
              db.close();
            }
          });
          const gallery = await context.newPage();
          await gallery.setViewportSize(resolveBrowserViewport());
          await gallery.goto(
            `chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`
          );
          await gallery.getByRole('button', { name: filename, exact: true }).first().click();
          await installReviewModeChoice(gallery);
          await gallery.locator('[data-ui="gallery.videoReview.enter"]').click();
          const strip = gallery.locator('[data-ui="gallery.videoReview.historyStrip"]');
          await expect(strip.locator('button').first()).toBeVisible();
          await expect(
            gallery.locator(
              '[data-ui="gallery.videoReview.trackHeader"] [data-ui="history.timing"]'
            )
          ).toBeInViewport();
          await gallery
            .getByRole('button', {
              name: translate('gallery.videoReview.advancedEditing', 'en'),
              exact: true,
            })
            .click();
          await strip.locator('[data-history-family="mouse"] button').first().click();
          await gallery
            .getByRole('button', {
              name: translate('gallery.videoReview.clickEffect', 'en'),
              exact: true,
            })
            .click();
          await gallery
            .getByRole('option', {
              name: translate('gallery.videoReview.click_ripple', 'en'),
              exact: true,
            })
            .click();
          await expect(strip.locator('[data-animated="true"]')).toHaveCount(1);
          await gallery.screenshot({
            path: info.outputPath('failed-calibration-gallery.png'),
            fullPage: false,
          });
          const editor = await context.newPage();
          await editor.setViewportSize(resolveBrowserViewport());
          await editor.goto(
            `chrome-extension://${extensionId}/apps/extension/src/video-editor/index.html` +
              `?id=${encodeURIComponent(recordingId)}`
          );
          await expect(editor.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
          await expect(editor.locator('[data-ui="history.timing"]')).toBeInViewport();
          await editor.screenshot({
            path: info.outputPath('failed-calibration-montage.png'),
            fullPage: false,
          });
          return;
        }
        const evidence = retained.map((event) => {
          const action = saved.actions.find(
            (candidate) => candidate.point.x === event.x && candidate.point.y === event.y
          );
          expect(action).toBeDefined();
          const anchor = clocks.find(
            (clock) =>
              clock.type ===
              (event.label === 'initial'
                ? 'OFFSCREEN_RECORDING_STARTED'
                : 'OFFSCREEN_RECORDING_RESUMED')
          )?.frameClock;
          expect(anchor).toBeDefined();
          const sample = clockSamples.find((sample) => sample.label === event.label)!;
          const navigationStart = sample.metrics.find(
            (metric) => metric.name === 'NavigationStart'
          )!.value;
          // Test-only independent monotonic clock: CDP navigation ticks + original DOM timestamp.
          // Production uses the measured four-timestamp translation; no debugger API is shipped.
          const eventTicksUs = navigationStart * 1_000_000 + (event.epoch - event.origin) * 1000;
          const nativePairs = nativeFramePairs
            .filter((pair) => pair.sourceTimestampUs > 1_000_000_000)
            .sort((a, b) => a.sourceTimestampUs - b.sourceTimestampUs);
          const lower = nativePairs.filter((pair) => pair.sourceTimestampUs <= eventTicksUs).at(-1);
          const upper = nativePairs.find((pair) => pair.sourceTimestampUs >= eventTicksUs);
          expect(lower).toBeDefined();
          expect(upper).toBeDefined();
          const frameBudgetSeconds =
            ((saved.telemetry.capabilities?.timing?.accuracyMs ?? 0) +
              (anchor!.uncertaintyMs ?? 0)) /
            1000;
          expect(action!.time).toBeGreaterThanOrEqual(
            lower!.chosenTimestampUs / 1_000_000 - frameBudgetSeconds - 0.001
          );
          expect(action!.time).toBeLessThanOrEqual(
            upper!.chosenTimestampUs / 1_000_000 + frameBudgetSeconds + 0.001
          );
          expect(action!.recordingPoint.x).toBeCloseTo(event.x / 1280, 10);
          expect(action!.recordingPoint.y).toBeCloseTo(event.y / 560, 10);
          const marker = decoded.frames.find(
            (frame) =>
              frame.marker &&
              Math.abs(
                ((frame.marker[0] + frame.marker[1]) / 2 / decoded.width) * 1280 - event.x
              ) <=
                1280 / decoded.width + 1
          );
          expect(marker).toBeDefined();
          const previous =
            decoded.frames.filter((frame) => frame.pts < marker!.pts).at(-1)?.pts ?? 0;
          // The first visible mark follows the actual source event; only WebM quantization can round its PTS down.
          // Compositor paint can follow an event by multiple native frames. Its latency is evidence, not calibration.
          expect(action!.time).toBeLessThanOrEqual(marker!.pts + frameBudgetSeconds + 0.001);
          const paint = paints.find(
            (candidate) =>
              candidate.origin === event.origin && candidate.index === marker!.paintIndex
          );
          expect(paint?.markerX).toBe(event.x);
          expect(paint!.epoch).toBeGreaterThanOrEqual(event.epoch);
          const eventToPaintSeconds = (paint!.epoch - event.epoch) / 1000;
          expect(marker!.pts - action!.time).toBeLessThanOrEqual(
            eventToPaintSeconds + 2 / 30 + frameBudgetSeconds + 0.001
          );
          return {
            source: event,
            action,
            anchor,
            eventTicksUs,
            nativeInterval: { lower, upper },
            firstPaint: marker,
            sourcePaint: paint,
            eventToPaintSeconds,
            previousFramePts: previous,
          };
        });
        const resumed = clocks.find(
          (clock) => clock.type === 'OFFSCREEN_RECORDING_RESUMED'
        )?.frameClock;
        expect(resumed).toBeDefined();
        expect(decoded.keys.some((pts) => Math.abs(pts - resumed!.mediaTimeSeconds) <= 0.001)).toBe(
          true
        );
        await writeFile(
          info.outputPath('native-clock-evidence.json'),
          JSON.stringify(
            { resolution, source, paints, clocks, evidence, decoded, helpers: saved.helpers },
            null,
            2
          )
        );
      } finally {
        if (launched) await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  );
}
