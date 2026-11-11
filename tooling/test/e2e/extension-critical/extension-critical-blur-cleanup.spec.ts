import { loadImage, createCanvas } from 'canvas';
import { test, expect } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import {
  grantNativeSimplifyCapture,
  prepareNativeSimplifySource,
} from './extension-critical-simplify-native.helpers';
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
    await page.exposeFunction('__cleanupCompute', (message: unknown) =>
      owner.evaluate((request) => chrome.runtime.sendMessage(request), message)
    );
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
    } finally {
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
        await prepareNativeSimplifySource(page, mode, async () => {
          await page.evaluate(() => {
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
            host.append(c);
          });
        });
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
        await waitForSimplify(page);
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
        await waitForSimplify(page);
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
        await waitForSimplify(page);
        await page.screenshot({ path: info.outputPath(`cleanup-${mode}.png`), fullPage: false });
      } finally {
        await page.close();
        await popup.close();
      }
    });
  }
}
