import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { test, expect } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { grantNativeSimplifyCapture } from './extension-critical-simplify-native.helpers';
import {
  readSavedRecordingAsset,
  startSimplifyRecording,
  stopAndSaveDrawingRecording,
} from './extension-critical-simplify-recording.helpers';

// Stage bits are ordinary captured page pixels. They identify admission boundaries independently
// of React state and also establish that pause-only editing never entered the published video.
const STAGES = {
  start: 1,
  shape: 2,
  arrow: 3,
  text: 4,
  group: 5,
  pending: 6,
  accepted: 7,
  paused: 8,
  resumed: 9,
  end: 10,
} as const;
const WORKSPACE = { x: 200, y: 150, width: 800, height: 310 };
const TEXT_ROI = { x: 245, y: 300, width: 370, height: 115 };
const MASK_ROI = { x: 775, y: 175, width: 195, height: 280 };

async function settleCapturedPaint(page: Page, frames = 12) {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const next = () => {
          if (--count <= 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames
  );
}

async function paintStage(page: Page, value: number) {
  await page.evaluate((stage) => {
    document.querySelectorAll<HTMLElement>('[data-recording-stage-bit]').forEach((node, bit) => {
      node.style.background = stage & (1 << bit) ? '#ffffff' : '#000000';
    });
  }, value);
}

async function tool(page: Page, name: 'shape' | 'arrow' | 'text' | 'select' | 'blur' | 'simplify') {
  await page.locator(`[data-ui="content.toolbar.drawing.${name}"]`).click();
}

async function drag(page: Page, x: number, y: number, endX: number, endY: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 8 });
  await page.mouse.up();
}

async function addProtectiveSimplify(page: Page, y = 180) {
  await tool(page, 'simplify');
  const color = page.locator('[data-ui="content.toolbar.drawing-options.simplify.color"]');
  if ((await color.getAttribute('aria-pressed')) !== 'true') await color.click();
  await page
    .locator(
      '[data-ui="content.toolbar.drawing-options.simplify.color-palette"] button[title="#ff7f50"]'
    )
    .click();
  await drag(page, 780, y, 970, y + 85);
  const raster = page.locator('[data-ui="content.drawing.simplify-private"]').last();
  await expect(raster).toBeVisible();
  await expect(raster).not.toHaveAttribute('data-simplify-pending', 'true');
  await settleCapturedPaint(page);
}

interface DecodedFrame {
  timestamp: number;
  stage: number;
  purple: number;
  blue: number;
  selectionRun: number;
  ink: number;
  simplifyInk: number;
  blurRange: number;
}
interface DecodedRecording {
  width: number;
  height: number;
  packetCount: number;
  sourceProjection: { scaleX: number; scaleY: number; offsetX: number; offsetY: number };
  frames: DecodedFrame[];
  first: string;
  resumed: string | null;
  maskOcclusion: string | null;
  last: string;
}

async function installSelectionRecordingSource(page: Page) {
  await page.evaluate(() => {
    const source = document.createElement('div');
    source.id = 'selection-recording-source';
    source.style.cssText = [
      'position:fixed;inset:0;background:#f8f8f8;z-index:1;pointer-events:none;',
      'color:#222;font:24px/28px sans-serif',
    ].join('');
    for (const [x, y] of [
      [100, 70],
      [1100, 490],
    ]) {
      const calibration = document.createElement('div');
      calibration.style.cssText = [
        `position:absolute;left:${x}px;top:${y}px;width:40px;height:20px;`,
        `background:#00ff00`,
      ].join('');
      source.append(calibration);
    }
    for (let bit = 0; bit < 4; bit++) {
      const marker = document.createElement('div');
      marker.dataset['recordingStageBit'] = String(bit);
      marker.style.cssText = [
        `position:absolute;left:${100 + bit * 22}px;top:110px;width:18px;height:18px;`,
        `background:#000`,
      ].join('');
      source.append(marker);
    }
    for (const [y, text] of [
      [180, 'Private account\nContact details'],
      [400, 'Pending private\nSensitive detail'],
    ] as const) {
      const target = document.createElement('div');
      target.style.cssText = [
        `position:absolute;left:790px;top:${y + 10}px;width:170px;height:65px;`,
        `white-space:pre;background:#fff;filter:grayscale(1)`,
      ].join('');
      target.textContent = text;
      source.append(target);
    }
    const stripes = document.createElement('div');
    stripes.style.cssText = [
      'position:absolute;left:810px;top:310px;width:140px;height:80px;',
      'background:repeating-linear-gradient(90deg,#000 0 3px,#fff 3px 6px)',
    ].join('');
    source.append(stripes);
    document.body.append(source);
  });
}

async function decodeEveryRecordingFrame(
  popup: Page,
  recordingId: string,
  cssSize: { width: number; height: number },
  artifactPath: string,
  selectionColor: number[]
) {
  const asset = await readSavedRecordingAsset(popup, recordingId);
  await writeFile(artifactPath, new Uint8Array(asset.bytes));
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
    import { Input, BlobSource, ALL_FORMATS, VideoSampleSink, EncodedPacketSink } from 'mediabunny';
    globalThis.inspectSelectionRecording = async ({
      bytes, cssSize, workspace, textRoi, maskRoi, selectionColor
    }) => {
      const input = new Input({
        source: new BlobSource(new Blob([new Uint8Array(bytes)])),
        formats: ALL_FORMATS
      });
      try {
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error('Saved recording has no video track');
        const width = track.displayWidth, height = track.displayHeight;
        const canvas = new OffscreenCanvas(width, height),
          context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Saved frame canvas unavailable');
        let sourceProjection = null;
        const frames = []; let first = '', last = '', resumed = null, maskOcclusion = null, packetCount = 0;
        const png = async () => {
          const blob = await canvas.convertToBlob({ type: 'image/png' });
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        };
        const inside = (x, y, box) => x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
        for await (const sample of new VideoSampleSink(track).samples()) {
          const frame = sample.toVideoFrame();
          try {
            context.drawImage(frame, 0, 0);
            const pixels = context.getImageData(0, 0, width, height).data;
            {
              const green = new Set();
              for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                if (pixels[index+1] > 180 && pixels[index] < 60 && pixels[index+2] < 60) green.add(y * width + x);
              }
              const components = [];
              while (green.size) {
                const stack = [green.values().next().value]; let count = 0, sumX = 0, sumY = 0;
                green.delete(stack[0]);
                while (stack.length) {
                  const index = stack.pop(); count++; sumX += index % width + 0.5;
                  sumY += Math.floor(index / width) + 0.5;
                  for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
                    if (green.delete(neighbor)) stack.push(neighbor);
                  }
                }
                components.push({ count, x: sumX / count, y: sumY / count });
              }
              const anchors = components.sort((a,b) => b.count - a.count).slice(0,2).sort((a,b) => a.x - b.x);
              if (anchors.length !== 2 || anchors.some(anchor => anchor.count < 30))
                throw new Error('Saved source calibration pixels missing');
              const left = [anchors[0].x, anchors[0].y], right = [anchors[1].x, anchors[1].y];
              const scaleX = (right[0] - left[0]) / 1000, scaleY = (right[1] - left[1]) / 420;
              sourceProjection = { scaleX, scaleY, offsetX: left[0] - 120 * scaleX, offsetY: left[1] - 80 * scaleY };
              if (!(scaleX > 0 && scaleY > 0)) throw new Error('Saved source projection invalid');
            }
            const { scaleX, scaleY, offsetX, offsetY } = sourceProjection;
            const at = (x, y) => (Math.floor(y * scaleY + offsetY) * width + Math.floor(x * scaleX + offsetX)) * 4;
            let stage = 0;
            for (let bit = 0; bit < 4; bit++) if (pixels[at(108 + bit * 22, 118)] > 128) stage |= 1 << bit;
            let purple = 0, blue = 0, selectionRun = 0, ink = 0, simplifyInk = 0, blurMin = 255, blurMax = 0;
            for (let y = Math.floor(workspace.y * scaleY + offsetY);
              y < (workspace.y + workspace.height) * scaleY + offsetY; y++) {
              let rowRun = 0;
              for (let x = Math.floor(workspace.x * scaleX + offsetX);
                x < (workspace.x + workspace.width) * scaleX + offsetX; x++) {
                const offset = (y * width + x) * 4, r = pixels[offset], g = pixels[offset+1], b = pixels[offset+2];
                const cssX = (x - offsetX) / scaleX, cssY = (y - offsetY) / scaleY;
                // Fixture ink is coral or neutral. These ranges retain antialiased service pixels
                // after YUV encoding while excluding coral and neutral chroma noise.
                if (r > 110 && b > 150 && g < r - 30 && g < b - 30) purple++;
                const blueRegion = inside(cssX, cssY, textRoi) || inside(cssX, cssY, maskRoi);
                if (blueRegion && b > 120 && b > g + 35 && b > r + 60) blue++;
                // The native selection color comes from the actual theme; a neutral selection
                // still paints a flat patch, unlike the sparse antialiasing of glyph edges.
                if (inside(cssX, cssY, textRoi) && Math.abs(r - selectionColor[0]) <= 8 &&
                  Math.abs(g - selectionColor[1]) <= 8 && Math.abs(b - selectionColor[2]) <= 8) rowRun++;
                else rowRun = 0;
                selectionRun = Math.max(selectionRun, rowRun);
                if (r > 190 && g > 65 && g < 175 && b < 130) {
                  ink++;
                  if (cssX > 790 && cssX < 960 && cssY > 190 && cssY < 255) simplifyInk++;
                }
                if (cssX > 835 && cssX < 925 && cssY > 330 && cssY < 370) {
                  blurMin = Math.min(blurMin, r); blurMax = Math.max(blurMax, r);
                }
              }
            }
            frames.push({ timestamp: sample.timestamp, stage, sourceProjection, purple, blue,
              selectionRun, ink, simplifyInk, blurRange: blurMax - blurMin });
            if (!first) first = await png();
            if (simplifyInk < 20 && !maskOcclusion) maskOcclusion = await png();
            if (stage === 9 && !resumed) resumed = await png();
          } finally { frame.close(); sample.close(); }
        }
        last = await png();
        for await (const packet of new EncodedPacketSink(track).packets()) packetCount++;
        return { width, height, packetCount, sourceProjection, frames, first, resumed, maskOcclusion, last };
      } finally { input.dispose(); }
    };`,
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
  });
  await popup.evaluate(bundle.outputFiles[0]!.text);
  return popup.evaluate(
    (data): Promise<DecodedRecording> => Reflect.get(window, 'inspectSelectionRecording')(data),
    {
      bytes: asset.bytes,
      cssSize,
      workspace: WORKSPACE,
      textRoi: TEXT_ROI,
      maskRoi: MASK_ROI,
      selectionColor,
    }
  );
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`native saved recording excludes drawing service UI at every frame ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(180_000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await grantNativeSimplifyCapture(popup);
      await popup.evaluate(async (video) => {
        await chrome.storage.local.set({
          sniptale_video_settings: {
            ...video,
            countdownSeconds: 0,
            autoFadeDelay: 0,
            systemAudioEnabled: false,
            microphoneEnabled: false,
            webcamEnabled: false,
            qualityProfileId: null,
            outputProfile: { ...video.outputProfile, resolution: 'SOURCE' },
            recordingSurface: { ...video.recordingSurface, toolbarEnabled: true },
          },
        });
      }, DEFAULT_VIDEO_SETTINGS);
      await installSelectionRecordingSource(page);
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
      await tool(page, 'shape');
      await drag(page, 260, 180, 380, 250);
      await page
        .locator(
          '[data-ui="content.drawing.surface"][aria-hidden="false"] [data-ui="content.drawing.selection-chrome"]'
        )
        .evaluate((canvas) => {
          const surface = canvas.closest('[data-ui="content.drawing.surface"]');
          if (!(surface instanceof HTMLElement))
            throw new Error('Expected extension drawing surface');
          // Give only drawing service paint a distinctive fixture accent; host content/ink stays coral/neutral.
          surface.style.setProperty('--sniptale-color-canvas-selection', '#a855f7');
          surface.style.setProperty('--sniptale-color-canvas-magnet', '#a855f7');
          surface.style.setProperty('--sniptale-color-text-primary', '#2563eb');
        });
      await tool(page, 'arrow');
      await page.locator('[data-ui="content.toolbar.drawing-options.arrow.freehand"]').click();
      await drag(page, 500, 180, 650, 240);
      await tool(page, 'blur');
      await drag(page, 810, 310, 950, 390);
      await addProtectiveSimplify(page);
      await tool(page, 'select');
      await page.mouse.click(310, 210);
      await settleCapturedPaint(page);
      const positivePng = await page.screenshot({
        path: info.outputPath('before-start-selected-positive-control.png'),
        fullPage: false,
      });
      const positive = await page.evaluate(async (encoded) => {
        const image = new Image();
        image.src = `data:image/png;base64,${encoded}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4)
          if (
            pixels[index]! > 110 &&
            pixels[index + 2]! > 150 &&
            pixels[index + 1]! < pixels[index]! - 30 &&
            pixels[index + 1]! < pixels[index + 2]! - 30
          )
            count++;
        return count;
      }, positivePng.toString('base64'));
      expect(
        positive,
        'Positive control must render detectable service pixels before start'
      ).toBeGreaterThan(20);
      await paintStage(page, STAGES.start);
      await startSimplifyRecording(context, extensionId, page);
      await settleCapturedPaint(page);
      await tool(page, 'select');
      await page.mouse.click(310, 210);
      await paintStage(page, STAGES.shape);
      await page.mouse.move(310, 210);
      await page.mouse.down();
      await page.mouse.move(330, 210, { steps: 8 });
      await settleCapturedPaint(page);
      await page.mouse.up();
      await paintStage(page, STAGES.arrow);
      await page.mouse.click(570, 208);
      await page.mouse.move(575, 210);
      await settleCapturedPaint(page);
      await tool(page, 'text');
      await page.mouse.click(260, 320);
      const input = page.locator('[data-ui="content.drawing.text-input"]');
      await input.fill('Live draft stays in video');
      await input.selectText();
      await paintStage(page, STAGES.text);
      await settleCapturedPaint(page, 18);
      await input.press('Enter');
      await tool(page, 'select');
      await page.mouse.click(330, 210);
      await page.keyboard.down('Shift');
      await page.mouse.click(570, 208);
      await page.keyboard.up('Shift');
      await paintStage(page, STAGES.group);
      await settleCapturedPaint(page);
      await tool(page, 'simplify');
      await page.mouse.move(780, 400);
      await page.mouse.down();
      await page.mouse.move(970, 485, { steps: 8 });
      await paintStage(page, STAGES.pending);
      await settleCapturedPaint(page);
      await page.mouse.up();
      await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toHaveCount(2);
      await expect(
        page.locator('[data-ui="content.drawing.simplify-private"]').last()
      ).not.toHaveAttribute('data-simplify-pending', 'true');
      await paintStage(page, STAGES.accepted);
      await settleCapturedPaint(page);
      await page.locator('[data-ui="content.toolbar.video-recording.pause"]').click();
      await expect(
        page.locator('[data-ui="content.toolbar.video-recording.resume"]')
      ).toBeVisible();
      await paintStage(page, STAGES.paused);
      await tool(page, 'select');
      await page.mouse.click(330, 210);
      await drag(page, 280, 180, 270, 170);
      await tool(page, 'select');
      await page.mouse.click(575, 210);
      await drag(page, 575, 210, 575, 270);
      await tool(page, 'text');
      await page.mouse.click(260, 390);
      await input.fill('Draft before resume');
      await input.selectText();
      const selectionColor = await input.evaluate((editor) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#f8f8f8';
        context.fillRect(0, 0, 1, 1);
        context.fillStyle = getComputedStyle(editor, '::selection').backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
      });
      const pausedPng = await page.screenshot({
        path: info.outputPath('paused-text-caret-positive-control.png'),
        fullPage: false,
      });
      const selectionPositive = await page.evaluate(
        async ({ encoded, roi, cssSize, selectionColor }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${encoded}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const scaleX = image.width / cssSize.width,
            scaleY = image.height / cssSize.height;
          const data = context.getImageData(
            Math.floor(roi.x * scaleX),
            Math.floor(roi.y * scaleY),
            Math.floor(roi.width * scaleX),
            Math.floor(roi.height * scaleY)
          );
          let longest = 0;
          for (let y = 0; y < data.height; y++) {
            let run = 0;
            for (let x = 0; x < data.width; x++) {
              const index = (y * data.width + x) * 4,
                r = data.data[index]!,
                g = data.data[index + 1]!,
                b = data.data[index + 2]!;
              if (
                Math.abs(r - selectionColor[0]!) <= 8 &&
                Math.abs(g - selectionColor[1]!) <= 8 &&
                Math.abs(b - selectionColor[2]!) <= 8
              ) {
                run++;
                longest = Math.max(longest, run);
              } else run = 0;
            }
          }
          return longest;
        },
        { encoded: pausedPng.toString('base64'), roi: TEXT_ROI, cssSize: size, selectionColor }
      );
      expect(
        selectionPositive,
        'Paused native selection must be detectable by the saved-output classifier'
      ).toBeGreaterThanOrEqual(6);
      await settleCapturedPaint(page);
      await paintStage(page, STAGES.resumed);
      await page.locator('[data-ui="content.toolbar.video-recording.resume"]').click();
      await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toBeVisible();
      await settleCapturedPaint(page);
      await tool(page, 'select');
      await page.mouse.click(330, 210);
      await paintStage(page, STAGES.end);
      await settleCapturedPaint(page, 18);
      await page.screenshot({
        path: info.outputPath('recording-final-interaction.png'),
        fullPage: false,
      });
      const recordingId = await stopAndSaveDrawingRecording(page, popup);
      const decoded = await decodeEveryRecordingFrame(
        popup,
        recordingId,
        size,
        info.outputPath('saved-recording.webm'),
        selectionColor
      );
      const { first, resumed, maskOcclusion, last, ...measurements } = decoded;
      await writeFile(
        info.outputPath('all-decoded-frame-measurements.json'),
        JSON.stringify(measurements, null, 2)
      );
      for (const [label, data] of [
        ['first', first],
        ['resumed', resumed],
        ['mask-occlusion', maskOcclusion],
        ['last', last],
      ] as const) {
        if (data)
          await writeFile(
            info.outputPath(`saved-${label}-frame.png`),
            Buffer.from(data.slice(data.indexOf(',') + 1), 'base64')
          );
      }
      expect(decoded.frames.length).toBe(decoded.packetCount);
      expect(decoded.frames.length).toBeGreaterThan(30);
      expect(
        decoded.frames[0]!.stage,
        'The first encoded frame must belong to initial admission'
      ).toBe(STAGES.start);
      expect(
        decoded.frames.at(-1)!.stage,
        'The final encoded frame must retain completed drawings'
      ).toBe(STAGES.end);
      const stages = new Set(decoded.frames.map((frame) => frame.stage));
      for (const stage of Object.values(STAGES).filter((stage) => stage !== STAGES.paused))
        expect(stages.has(stage), `Decoded stage ${stage} missing`).toBe(true);
      expect(
        stages.has(STAGES.paused),
        'Frames edited only while paused must never enter output'
      ).toBe(false);
      expect(
        decoded.frames.filter(
          (frame) => frame.purple > 0 || frame.blue > 0 || frame.selectionRun >= 6
        ),
        'Every decoded frame must exclude drawing service paint'
      ).toEqual([]);
      expect(
        Math.min(...decoded.frames.map((frame) => frame.ink)),
        'Accepted ink must survive every recording boundary'
      ).toBeGreaterThan(100);
      expect(
        Math.min(...decoded.frames.map((frame) => frame.simplifyInk)),
        'Accepted Simplify result must remain in every recorded frame'
      ).toBeGreaterThan(20);
      expect(
        Math.max(...decoded.frames.map((frame) => frame.blurRange)),
        'The protective blur must not uncover its high-contrast source'
      ).toBeLessThan(100);
    } catch (error) {
      await page.screenshot({
        path: info.outputPath('native-selection-failure.png'),
        fullPage: false,
      });
      throw error;
    } finally {
      await popup.close();
      await page.close();
    }
  });
}
