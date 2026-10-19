import type { Locator, Page } from '@playwright/test';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { expect, test } from '../support/extension-fixture';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

const TEXT = 'A longer first line\nShort\nA final line';

async function backgroundPath(root: Locator) {
  const background = root.locator('path[data-ui="content.drawing.text-background"]');
  await expect(background).toHaveCount(1);
  const path = await background.getAttribute('d');
  expect(path).toBeTruthy();
  return path;
}

async function rotateContentText(page: Page, object: Locator, degrees: number) {
  const bounds = await object.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      x: parseFloat(style.left),
      y: parseFloat(style.top),
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      angle: Number(node.style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1] ?? 0),
    };
  });
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const distance = Math.hypot(bounds.width / 2, bounds.height / 2);
  const delta = {
    x: (bounds.width / 2) * (1 + 18 / distance),
    y: (-bounds.height / 2) * (1 + 18 / distance),
  };
  const point = (angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return {
      x: center.x + delta.x * Math.cos(radians) - delta.y * Math.sin(radians),
      y: center.y + delta.x * Math.sin(radians) + delta.y * Math.cos(radians),
    };
  };
  const start = point(bounds.angle);
  const end = point(degrees);
  await page.mouse.move(start.x, start.y);
  await page.keyboard.down('Control');
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect
    .poll(() =>
      object.evaluate((node) =>
        Number(node.style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1] ?? 0)
      )
    )
    .toBeCloseTo(degrees, 0);
  return center;
}

test('rotated text backgrounds have continuous raster coverage at line joins', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  try {
    await page.evaluate(() => {
      document.body.style.background = '#808080';
    });
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
    await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
    await page.locator('[data-ui="content.toolbar.drawing-options.text.font-sans"]').click();
    const fill = page.locator('[data-ui="content.toolbar.drawing-options.text.background-none"]');
    if ((await fill.getAttribute('aria-pressed')) !== 'true') await fill.click();
    await page
      .locator(
        '[data-ui="content.toolbar.drawing-options.text.background-colors"] button[title="#f97316"]'
      )
      .click();
    await page.keyboard.press('Escape');
    await page.mouse.click(300, 230);
    const input = page.locator('[data-ui="content.drawing.text-input"]');
    await input.fill(TEXT);
    await input.press('Enter');
    const object = page.locator('[data-ui="content.drawing.text-object"]');
    await expect(object).toHaveCount(1);
    for (const degrees of [0, 5, 10, 45]) {
      if (degrees) await rotateContentText(page, object, degrees);
      const geometry = await object.evaluate((node) => {
        const style = getComputedStyle(node);
        const content = node.querySelector('span:last-child')!;
        return {
          left: parseFloat(style.left),
          top: parseFloat(style.top),
          width: parseFloat(style.width),
          height: parseFloat(style.height),
          lineHeight: parseFloat(getComputedStyle(content).lineHeight),
          angle: Number(node.style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1] ?? 0),
        };
      });
      const screenshot = await page.screenshot({
        path: info.outputPath(`text-join-${degrees}.png`),
        fullPage: false,
      });
      const metrics = await page.evaluate(
        async ({ encoded, geometry }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${encoded}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const drawing = canvas.getContext('2d')!;
          drawing.drawImage(image, 0, 0);
          const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height).data;
          const radians = (geometry.angle * Math.PI) / 180;
          const cosine = Math.cos(radians);
          const sine = Math.sin(radians);
          const centerX = geometry.left + geometry.width / 2;
          const centerY = geometry.top + geometry.height / 2;
          const errors: number[] = [];
          let worst = { column: 0, row: 0, localX: 0, localY: 0, rgb: [] as number[], error: 0 };
          for (let row = 0; row < canvas.height; row += 1) {
            for (let column = 0; column < canvas.width; column += 1) {
              const deltaX = column + 0.5 - centerX;
              const deltaY = row + 0.5 - centerY;
              const localX = deltaX * cosine + deltaY * sine + geometry.width / 2;
              const localY = -deltaX * sine + deltaY * cosine + geometry.height / 2;
              if (localX < 3 || localX > 35) continue;
              if (
                ![1, 2].some((line) => Math.abs(localY - (2 + line * geometry.lineHeight)) <= 0.65)
              )
                continue;
              const offset = (row * canvas.width + column) * 4;
              errors.push(
                Math.max(
                  Math.abs(pixels[offset]! - 249),
                  Math.abs(pixels[offset + 1]! - 115),
                  Math.abs(pixels[offset + 2]! - 22)
                )
              );
              const error = errors[errors.length - 1]!;
              if (error > worst.error)
                worst = {
                  column,
                  row,
                  localX,
                  localY,
                  rgb: Array.from(pixels.slice(offset, offset + 3)),
                  error,
                };
            }
          }
          return { count: errors.length, maximumError: Math.max(...errors), worst, geometry };
        },
        { encoded: screenshot.toString('base64'), geometry }
      );
      expect(metrics.count, `${degrees} degree join samples`).toBeGreaterThan(40);
      expect
        .soft(metrics.maximumError, `${degrees} degree join RGB error ${JSON.stringify(metrics)}`)
        .toBeLessThanOrEqual(2);
    }
  } finally {
    await page.close();
    await popup.close();
  }
});

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  for (const mode of ['drawing', 'video-recording'] as const) {
    test(`Text rotation, backgrounds, and editing ${mode} ${viewport.width}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(120_000);
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
      try {
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
        if (mode === 'video-recording') {
          const cdp = await context.browser()!.newBrowserCDPSession();
          try {
            const targets = await cdp.send('Target.getTargets', {
              filter: [{ type: 'tab', exclude: false }, { exclude: true }],
            });
            const tab = targets.targetInfos.find((candidate) => candidate.url === page.url());
            if (!tab) throw new Error('Recording tab unavailable');
            await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
          } finally {
            await cdp.detach();
          }
          await page.bringToFront();
          await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
          await expect(
            page.locator('[data-ui="content.toolbar.video-recording.pause"]')
          ).toBeVisible({ timeout: 30_000 });
        }
        await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
        await page.locator('[data-ui="content.toolbar.drawing-options.text.font-sans"]').click();
        const fill = page.locator(
          '[data-ui="content.toolbar.drawing-options.text.background-none"]'
        );
        if ((await fill.getAttribute('aria-pressed')) !== 'true') await fill.click();
        await page
          .locator(
            '[data-ui="content.toolbar.drawing-options.text.background-colors"] button[title^="#"]'
          )
          .first()
          .click();
        await page.keyboard.press('Escape');
        await page.mouse.click(200, 280);
        const input = page.locator('[data-ui="content.drawing.text-input"]');
        await input.fill(TEXT);
        await input.press('Enter');
        const object = page.locator('[data-ui="content.drawing.text-object"]');
        await expect(object).toHaveCount(1);
        const baseline = await backgroundPath(object);
        for (const degrees of [45, 90]) {
          const center = await rotateContentText(page, object, degrees);
          expect.soft(await input.count(), 'rotation release must not create or edit text').toBe(0);
          if (await input.count()) await input.press('Escape');
          await page.mouse.click(center.x, center.y);
          await expect(input).toHaveValue(TEXT);
          const editor = page.locator('[data-ui="content.drawing.text-editor"]');
          expect(await backgroundPath(editor)).toBe(baseline);
          await page.screenshot({ path: info.outputPath(`text-${degrees}.png`), fullPage: false });
          await input.press('Enter');
          await expect(input).toHaveCount(0);
        }
        await page.mouse.click(700, 400);
        await expect(input).toHaveValue('');
        await input.press('Escape');
        await expect(object).toHaveCount(1);
        if (mode === 'video-recording') {
          await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
          await expect(
            page.locator('[data-ui="content.toolbar.video-recording.pause"]')
          ).toHaveCount(0, { timeout: 30_000 });
          await expect
            .poll(
              () =>
                popup.evaluate(
                  async () =>
                    (
                      await chrome.runtime.sendMessage({
                        type: 'GET_RECORDING_STATE',
                        __sniptaleRuntimeFreshness: {
                          issuedAtEpochMs: Date.now(),
                          nonce: crypto.randomUUID(),
                        },
                      })
                    ).state.status
                ),
              { timeout: 30_000 }
            )
            .toBe(VideoRecordingStatus.IDLE);
          const recordingId = await popup.evaluate(async () => {
            const result = await chrome.runtime.sendMessage({
              type: 'GET_RECORDING_STATE',
              __sniptaleRuntimeFreshness: {
                issuedAtEpochMs: Date.now(),
                nonce: crypto.randomUUID(),
              },
            });
            if (typeof result.postRecordResult?.recordingId !== 'string')
              throw new Error('Saved recording identity unavailable');
            return result.postRecordResult.recordingId;
          });
          expect(
            await popup.evaluate(
              async (recordingId) =>
                chrome.runtime.sendMessage({
                  type: 'ACKNOWLEDGE_POST_RECORD_RESULT',
                  recordingId,
                  __sniptaleRuntimeFreshness: {
                    issuedAtEpochMs: Date.now(),
                    nonce: crypto.randomUUID(),
                  },
                }),
              recordingId
            )
          ).toMatchObject({ success: true, result: 'acknowledged' });
        }
      } catch (error) {
        await page.screenshot({
          path: info.outputPath('failure-before-cleanup.png'),
          fullPage: false,
        });
        throw error;
      } finally {
        await page.close();
        await popup.close();
      }
    });
  }

  test(`editor Text rotation does not enter editing ${viewport.width}`, async ({
    context,
    hostOrigin,
  }, info) => {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await applyHarnessBootstrap(page, {});
    await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
    await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window
            .__sniptaleEditorHarness!.getCanvasObjects()
            .some((object) => object['type'] === 'image')
        )
      )
      .toBe(true);
    await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
    await expect(page.locator('[data-ui="editor.floating.view-controls.zoom"]')).toHaveText('100%');
    await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
    const fill = page.locator('[data-ui="content.toolbar.drawing-options.text.background-none"]');
    if ((await fill.getAttribute('aria-pressed')) !== 'true') await fill.click();
    await page.keyboard.press('Escape');
    const canvas = page.locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas');
    const box = (await canvas.boundingBox())!;
    const start = { x: box.x + box.width / 2 - 80, y: box.y + box.height / 2 };
    await page.mouse.click(start.x, start.y);
    await page.keyboard.insertText(TEXT);
    await page.keyboard.press('Escape');
    const objects = await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects());
    const text = objects.find((object) => object['sniptaleType'] === 'text')!;
    expect(text).toBeDefined();
    const width = Number(text['width']);
    const height = Number(text['height']);
    const handle = { x: start.x + width + 20, y: start.y - 20 };
    await page.mouse.move(handle.x, handle.y);
    await expect(canvas).toHaveCSS('cursor', 'grab');
    await page.mouse.down();
    await page.mouse.move(handle.x + 30, handle.y + height + 80, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('textarea[data-fabric="textarea"]:focus')).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects().length)
    ).toBe(objects.length);
    await page.screenshot({ path: info.outputPath('editor-text-rotation.png'), fullPage: false });
    await page.mouse.click(start.x + width / 2, start.y + height / 2);
    await expect(page.locator('textarea[data-fabric="textarea"]:focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.close();
  });
}
