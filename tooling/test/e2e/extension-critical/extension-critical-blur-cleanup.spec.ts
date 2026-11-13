import { loadImage, createCanvas } from 'canvas';
import { test, expect } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import {
  grantNativeSimplifyCapture,
  prepareNativeSimplifySource,
  captureSimplifyToEditor,
} from './extension-critical-simplify-native.helpers';
import {
  startSimplifyRecording,
  stopAndSaveDrawingRecording,
  readSavedRecordingAsset,
} from './extension-critical-simplify-recording.helpers';
import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { dragSimplify, waitForSimplify } from './extension-critical-simplify-pixels.helpers';

declare global {
  interface Window {
    __cleanupCompute?: (message: unknown) => Promise<unknown>;
  }
}

async function countInk(png: Buffer) {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4)
    if (
      Math.max(
        Math.abs(pixels[i]! - 244),
        Math.abs(pixels[i + 1]! - 247),
        Math.abs(pixels[i + 2]! - 250)
      ) > 4
    )
      count++;
  return count;
}

async function waitForAcceptedCleanup(page: Page) {
  await waitForSimplify(page);
  await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).not.toHaveAttribute(
    'data-simplify-pending',
    'true',
    { timeout: 45_000 }
  );
  await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toHaveCSS(
    'backdrop-filter',
    'none'
  );
}

async function prepareCleanupSource(
  page: Page,
  mode: 'drawing' | 'crop' | 'video-recording',
  markers = false
) {
  await prepareNativeSimplifySource(page, mode, async () => {
    await page.evaluate((markers) => {
      const host = document.getElementById('simplify-source-proof')!;
      host.textContent = '';
      const c = document.createElement('canvas');
      c.width = 340;
      c.height = 160;
      const x = c.getContext('2d')!;
      x.fillStyle = '#f4f7fa';
      x.fillRect(0, 0, 340, 160);
      x.fillStyle = '#173b63';
      x.font = '20px Arial';
      x.fillText('Private account', 8, 28);
      const g = x.createLinearGradient(200, 40, 300, 94);
      g.addColorStop(0, '#4b91be');
      g.addColorStop(1, '#c7a342');
      x.fillStyle = g;
      x.fillRect(200, 40, 100, 54);
      x.fillStyle = '#245f47';
      x.beginPath();
      x.moveTo(200, 94);
      x.lineTo(230, 46);
      x.lineTo(260, 83);
      x.lineTo(290, 55);
      x.lineTo(300, 94);
      x.fill();
      x.fillStyle = '#8090a0';
      x.fillRect(4, 100, 320, 1);
      if (markers) {
        x.fillStyle = '#ff00ff';
        x.fillRect(0, 152, 8, 8);
        x.fillRect(332, 152, 8, 8);
      }
      host.append(c);
    }, markers);
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`cleanup editor round-trip uses product Worker ${name}`, async ({
    context,
    hostOrigin,
    extensionId,
  }, info) => {
    const owner = await context.newPage();
    await owner.setViewportSize(size);
    await owner.goto(`chrome-extension://${extensionId}/apps/extension/src/editor/index.html`);
    const page = await context.newPage();
    await page.setViewportSize(size);
    let holdReply = false;
    let releaseReply: (() => void) | undefined;
    let replyReady = false;
    let replyDelivered = false;
    await page.exposeFunction('__cleanupCompute', async (message: unknown) => {
      const reply: unknown = await owner.evaluate(
        (request) => chrome.runtime.sendMessage(request),
        message
      );
      if (
        holdReply &&
        typeof message === 'object' &&
        message !== null &&
        'operation' in message &&
        message.operation === 'render'
      ) {
        expect(reply).toMatchObject({
          success: true,
          dataUrl: expect.stringMatching(/^data:image\/png;base64,/u),
        });
        replyReady = true;
        await new Promise<void>((resolve) => {
          releaseReply = resolve;
        });
        replyDelivered = true;
      }
      return reply;
    });
    try {
      const dataUrl = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 800;
        c.height = 400;
        const x = c.getContext('2d')!;
        x.fillStyle = '#f4f7fa';
        x.fillRect(0, 0, 800, 400);
        x.fillStyle = '#223344';
        x.font = '24px Arial';
        x.fillText('Private account', 80, 100);
        x.fillText('Contact information', 80, 150);
        x.fillRect(40, 190, 700, 1);
        const g = x.createLinearGradient(420, 220, 640, 330);
        g.addColorStop(0, '#4b91be');
        g.addColorStop(1, '#c7a342');
        x.fillStyle = g;
        x.fillRect(420, 220, 220, 110);
        x.fillStyle = '#245f47';
        x.beginPath();
        x.moveTo(420, 330);
        x.lineTo(490, 230);
        x.lineTo(560, 310);
        x.lineTo(610, 250);
        x.lineTo(640, 330);
        x.fill();
        return c.toDataURL();
      });
      await applyHarnessBootstrap(page, {
        editorBootstrapPayload: { dataUrl, title: 'Cleanup proof' },
      });
      await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
        )
        .toBe(true);
      await page.evaluate((type) => {
        window.__sniptaleHarness?.setRuntimeResponse(
          type,
          (request) =>
            window.__cleanupCompute?.(request) ??
            Promise.reject(new Error('Missing compute binding'))
        );
      }, MessageType.SIMPLIFY_COMMAND);
      const initial = await page.evaluate(
        () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
      );
      await page.locator('[data-ui="editor.floating.tool-rail.blur"]').click();
      const clean = page.locator('[data-ui="content.toolbar.drawing-options.blur.clean"]');
      await clean.click();
      const box = (await page
        .locator('[data-ui="editor.canvas.document-boundary"]')
        .boundingBox())!;
      await dragSimplify(
        page,
        { x: box.x + box.width * 0.05, y: box.y + box.height * 0.1 },
        { x: box.x + box.width * 0.9, y: box.y + box.height * 0.9 }
      );
      const accepted = () =>
        page.evaluate(() =>
          window
            .__sniptaleEditorHarness!.getCanvasObjects()
            .find((o) => o['sniptaleType'] === 'blur' && typeof o['src'] === 'string')
        );
      await expect.poll(accepted).toBeTruthy();
      const first = (await accepted())!;
      await expect(clean).toHaveAttribute('aria-pressed', 'true');
      const rendered = await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage());
      const counts = await page.evaluate(async (url) => {
        const b = await createImageBitmap(await (await fetch(url)).blob());
        const c = document.createElement('canvas');
        c.width = b.width;
        c.height = b.height;
        const x = c.getContext('2d')!;
        x.drawImage(b, 0, 0);
        b.close();
        return {
          text: [...x.getImageData(100, 90, 1, 1).data],
          media: [...x.getImageData(520, 270, 1, 1).data],
          line: [...x.getImageData(100, 190, 1, 1).data],
        };
      }, rendered);
      expect(counts).toEqual({
        text: [244, 247, 250, 255],
        media: [244, 247, 250, 255],
        line: [34, 51, 68, 255],
      });
      await page.locator('[data-ui="content.toolbar.drawing-options.blur.amount-6"]').click();
      await expect.poll(accepted).toBeFalsy();
      await clean.click();
      await expect.poll(accepted).toBeTruthy();
      expect((await accepted())!['sniptaleId']).toBe(first['sniptaleId']);
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
        )
        .toBe(initial + 3);
      const final = await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage());
      await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
      await expect.poll(accepted).toBeFalsy();
      await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
      await expect.poll(accepted).toBeTruthy();
      expect(await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage())).toBe(final);
      await page.screenshot({ path: info.outputPath('cleanup-editor.png'), fullPage: false });
      const beforeCancel = await page.evaluate(async () => ({
        image: await window.__sniptaleEditorHarness!.renderImage(),
        objects: window.__sniptaleEditorHarness!.getCanvasObjects(),
        history: window.__sniptaleEditorHarness!.getInteractionState().historyIndex,
      }));
      await page.keyboard.press('Escape');
      await page.locator('[data-ui="editor.floating.tool-rail.blur"]').click();
      if ((await clean.getAttribute('aria-pressed')) !== 'true') await clean.click();
      holdReply = true;
      await dragSimplify(
        page,
        { x: box.x + box.width * 0.1, y: box.y + box.height * 0.75 },
        { x: box.x + box.width * 0.4, y: box.y + box.height * 0.95 }
      );
      await expect.poll(() => replyReady).toBe(true);
      await expect(page.locator('[data-ui="editor.simplify.pending"]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-ui="editor.simplify.pending"]')).toHaveCount(0);
      releaseReply?.();
      await expect.poll(() => replyDelivered).toBe(true);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      expect(
        await page.evaluate(async () => ({
          image: await window.__sniptaleEditorHarness!.renderImage(),
          objects: window.__sniptaleEditorHarness!.getCanvasObjects(),
          history: window.__sniptaleEditorHarness!.getInteractionState().historyIndex,
        }))
      ).toEqual(beforeCancel);
      await page.screenshot({
        path: info.outputPath('cleanup-cancelled-late-reply.png'),
        fullPage: false,
      });
    } finally {
      releaseReply?.();
      await page.close();
      await owner.close();
    }
  });

  for (const mode of ['drawing', 'crop', 'video-recording'] as const) {
    test(`cleanup ${mode} uses native capture and preserves lines ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(120_000);
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      try {
        await grantNativeSimplifyCapture(popup);
        await prepareCleanupSource(page, mode);
        const sourceBefore = await page
          .locator('#simplify-source-proof canvas')
          .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
        const scope =
          mode === 'crop'
            ? page.locator('[data-ui="content.crop.drawing-slot"]')
            : page.locator('[data-ui="content.toolbar.root"]');
        await scope.locator('[data-ui="content.toolbar.drawing.blur"]').click();
        const clean = page.locator('[data-ui="content.toolbar.drawing-options.blur.clean"]');
        await clean.click();
        const photo = { x: 680, y: 245, width: 50, height: 30 };
        expect(
          await countInk(await page.screenshot({ clip: photo, fullPage: false }))
        ).toBeGreaterThan(100);
        const line = { x: 480, y: 296, width: 150, height: 1 };
        const originalLine = await page.screenshot({ clip: line, fullPage: false });
        await dragSimplify(page, { x: 460, y: 190 }, { x: 780, y: 310 });
        await waitForAcceptedCleanup(page);
        await page.mouse.move(900, 430);
        expect(
          await countInk(
            await page.screenshot({ clip: photo, animations: 'disabled', fullPage: false })
          )
        ).toBe(0);
        expect(
          await page.screenshot({ clip: line, animations: 'disabled', fullPage: false })
        ).toEqual(originalLine);
        await scope.locator('[data-ui="content.toolbar.drawing.select"]').click();
        await page.mouse.click(600, 240);
        await page.locator('[data-ui="content.toolbar.drawing-options.blur.amount-6"]').click();
        await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toHaveCount(0);
        await clean.click();
        if (mode === 'video-recording') {
          await expect(page.locator('[data-ui="content.drawing.simplify-feedback"]')).toBeVisible();
          await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toHaveCount(0);
          await expect(page.locator('[data-ui="content.drawing.simplify-pending"]')).toHaveCount(0);
          await page.screenshot({
            path: info.outputPath('cleanup-recording-preserves-blur.png'),
            fullPage: false,
          });
          return;
        }
        await waitForAcceptedCleanup(page);
        const second = await page.screenshot({
          path: info.outputPath('cleanup-second-region.png'),
          clip: photo,
          animations: 'disabled',
          fullPage: false,
        });
        await page.screenshot({
          path: info.outputPath('cleanup-second-state.png'),
          fullPage: false,
        });
        expect(await countInk(second)).toBe(0);
        if (mode === 'crop') await page.locator('[data-ui="content.crop.undo"]').click();
        else await page.keyboard.press('Control+z');
        await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toHaveCount(0);
        if (mode === 'crop') await page.locator('[data-ui="content.crop.redo"]').click();
        else await page.keyboard.press('Control+Shift+z');
        await waitForAcceptedCleanup(page);
        expect(
          await countInk(
            await page.screenshot({ clip: photo, animations: 'disabled', fullPage: false })
          )
        ).toBe(0);
        await page.screenshot({ path: info.outputPath(`cleanup-${mode}.png`), fullPage: false });
        expect(
          await page
            .locator('#simplify-source-proof canvas')
            .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
        ).toBe(sourceBefore);
        const editor = await captureSimplifyToEditor(context, page, mode);
        try {
          await editor.setViewportSize(size);
          await expect(editor.locator('[data-ui="editor.page.root"]')).toBeVisible();
          await expect(editor.locator('[data-ui="editor.page.open-loading"]')).toBeHidden();
          await expect(
            editor.locator('[data-ui="editor.canvas.layer"] canvas.lower-canvas')
          ).toBeVisible();
          const zoom = editor.locator('[data-ui="editor.floating.view-controls.zoom"]');
          if ((await zoom.innerText()) !== '100%') await zoom.click();
          await expect(zoom).toHaveText('100%');
          const pixels = await editor
            .locator('[data-ui="editor.canvas.layer"] canvas.lower-canvas')
            .evaluate((canvas: HTMLCanvasElement) => {
              const data = canvas
                .getContext('2d')!
                .getImageData(0, 0, canvas.width, canvas.height).data;
              let clean = 0,
                line = 0,
                dirtyMedia = 0,
                dirtyText = 0;
              for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] !== 255) continue;
                if (data[i] === 244 && data[i + 1] === 247 && data[i + 2] === 250) clean++;
                if (
                  Math.max(
                    Math.abs(data[i]! - 128),
                    Math.abs(data[i + 1]! - 144),
                    Math.abs(data[i + 2]! - 160)
                  ) < 16
                )
                  line++;
                if (data[i] === 36 && data[i + 1] === 95 && data[i + 2] === 71) dirtyMedia++;
                if (data[i] === 23 && data[i + 1] === 59 && data[i + 2] === 99) dirtyText++;
              }
              return { clean, line, dirtyMedia, dirtyText };
            });
          await editor.screenshot({
            path: info.outputPath(`cleanup-${mode}-captured-editor.png`),
            fullPage: false,
          });
          await writeFile(
            info.outputPath(`cleanup-${mode}-captured-metrics.json`),
            JSON.stringify(pixels, null, 2)
          );
          expect(pixels.clean).toBeGreaterThan(10_000);
          expect(pixels.line).toBeGreaterThan(150);
          expect(pixels.dirtyMedia).toBe(0);
          expect(pixels.dirtyText).toBe(0);
        } finally {
          await editor.close();
        }
        expect(
          await page
            .locator('#simplify-source-proof canvas')
            .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
        ).toBe(sourceBefore);
      } finally {
        await page.close();
        await popup.close();
      }
    });
  }
}

async function inspectCleanupRecording(popup: Page, recordingId: string) {
  const asset = await readSavedRecordingAsset(popup, recordingId);
  const proof = await popup.evaluate(async ({ bytes, mimeType }) => {
    const video = document.createElement('video');
    video.muted = true;
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeType }));
    const canvas = document.createElement('canvas');
    const frames: { noise: number; photoError: number; lineContrast: number; cleaned: boolean }[] =
      [];
    let framePng: string | null = null;
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Saved cleanup recording cannot decode'));
        video.src = url;
      });
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Cleanup frame canvas unavailable');
      await new Promise<void>((resolve, reject) => {
        video.onended = () => resolve();
        video.onerror = () => reject(new Error('Saved cleanup recording playback failed'));
        const inspect = () => {
          context.drawImage(video, 0, 0);
          const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let left = canvas.width,
            top = canvas.height,
            right = -1;
          for (let y = 0; y < canvas.height; y++)
            for (let x = 0; x < canvas.width; x++) {
              const i = (y * canvas.width + x) * 4;
              if (data[i]! > 200 && data[i + 1]! < 70 && data[i + 2]! > 200) {
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x);
              }
            }
          if (right > left) {
            // Two retained bottom markers locate the source canvas independently of video scaling.
            const scale = (right - left + 1) / 340;
            const originY = top - 152 * scale;
            const error = (x: number, y: number) => {
              const px = Math.min(canvas.width - 1, Math.max(0, Math.round(left + x * scale)));
              const py = Math.min(canvas.height - 1, Math.max(0, Math.round(originY + y * scale)));
              const i = (py * canvas.width + px) * 4;
              return Math.max(
                Math.abs(data[i]! - 244),
                Math.abs(data[i + 1]! - 247),
                Math.abs(data[i + 2]! - 250)
              );
            };
            const percentile = (values: number[]) =>
              values.sort((a, b) => a - b)[Math.floor((values.length - 1) * 0.95)]!;
            const background: number[] = [],
              photo: number[] = [],
              line: number[] = [];
            for (let y = 128; y < 140; y++)
              for (let x = 20; x < 120; x++) background.push(error(x, y));
            for (let y = 49; y < 79; y++) for (let x = 216; x < 266; x++) photo.push(error(x, y));
            for (let x = 20; x < 170; x++)
              line.push(Math.max(...[98, 99, 100, 101, 102].map((y) => error(x, y))));
            // Measure flat-region codec noise in each frame. Four byte levels allow quantization
            // variation between two flat regions; line contrast must exceed that measured budget.
            const noise = percentile(background),
              photoError = percentile(photo),
              lineContrast = percentile(line);
            const cleaned = photoError <= noise + 4 && lineContrast > noise + 12;
            frames.push({ noise, photoError, lineContrast, cleaned });
            if (cleaned) framePng = canvas.toDataURL('image/png');
          }
          if (!video.ended) video.requestVideoFrameCallback(inspect);
        };
        video.requestVideoFrameCallback(inspect);
        void video.play().catch(reject);
      });
      return { frames, framePng, width: canvas.width, height: canvas.height };
    } finally {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
  }, asset);
  return { ...proof, bytes: new Uint8Array(asset.bytes) };
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`cleanup active TAB recording saves cleaned pixels and protected line ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(150_000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await grantNativeSimplifyCapture(popup);
      await prepareCleanupSource(page, 'video-recording', true);
      const sourceBefore = await page
        .locator('#simplify-source-proof canvas')
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
      await startSimplifyRecording(context, extensionId, page);
      await page.locator('[data-ui="content.toolbar.drawing.blur"]').click();
      await page.locator('[data-ui="content.toolbar.drawing-options.blur.clean"]').click();
      await dragSimplify(page, { x: 460, y: 190 }, { x: 780, y: 310 });
      await waitForAcceptedCleanup(page);
      await page.mouse.move(900, 430);
      await page.screenshot({
        path: info.outputPath('cleanup-active-recording.png'),
        fullPage: false,
      });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            let remaining = 18;
            const paint = () => {
              if (--remaining === 0) resolve();
              else requestAnimationFrame(paint);
            };
            requestAnimationFrame(paint);
          })
      );
      expect(
        await page
          .locator('#simplify-source-proof canvas')
          .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
      ).toBe(sourceBefore);
      const recordingId = await stopAndSaveDrawingRecording(page, popup);
      const proof = await inspectCleanupRecording(popup, recordingId);
      await writeFile(info.outputPath('cleanup-saved-recording.webm'), proof.bytes);
      await writeFile(
        info.outputPath('cleanup-frame-metrics.json'),
        JSON.stringify({ frames: proof.frames, width: proof.width, height: proof.height }, null, 2)
      );
      expect(proof.frames.length).toBeGreaterThan(1);
      expect(
        proof.frames.some((frame) => frame.photoError > frame.noise + 30),
        'Decoded recording must include the original media before cleanup'
      ).toBe(true);
      expect(
        proof.frames.some((frame) => frame.cleaned),
        'Decoded recording must contain cleaned media pixels while retaining the protected line'
      ).toBe(true);
      expect(proof.framePng).not.toBeNull();
      await writeFile(
        info.outputPath('cleanup-recorded-frame.png'),
        Buffer.from(proof.framePng!.split(',')[1]!, 'base64')
      );
      await info.attach('cleanup-codec-noise', {
        body: JSON.stringify({ frames: proof.frames, width: proof.width, height: proof.height }),
        contentType: 'application/json',
      });
    } finally {
      await popup.close();
      await page.close();
    }
  });
}
