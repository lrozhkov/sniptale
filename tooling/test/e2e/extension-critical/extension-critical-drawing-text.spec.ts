import type { Locator, Page } from '@playwright/test';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { expect, test } from '../support/extension-fixture';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

const TEXT = 'A longer first line\nShort\nA final line';

async function backgroundGeometry(root: Locator) {
  return root.locator('[data-ui="content.drawing.text-background"]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        left: parseFloat(style.left),
        top: parseFloat(style.top),
        width: parseFloat(style.width),
        height: parseFloat(style.height),
      };
    })
  );
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
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(object).toHaveCSS(
    'transform',
    degrees === 45
      ? 'matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, 0)'
      : 'matrix(0, 1, -1, 0, 0, 0)'
  );
  return center;
}

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
        const baseline = await backgroundGeometry(object);
        expect(baseline).toHaveLength(3);
        for (const degrees of [45, 90]) {
          const center = await rotateContentText(page, object, degrees);
          expect.soft(await input.count(), 'rotation release must not create or edit text').toBe(0);
          if (await input.count()) await input.press('Escape');
          await page.mouse.click(center.x, center.y);
          await expect(input).toHaveValue(TEXT);
          const editor = page.locator('[data-ui="content.drawing.text-editor"]');
          const geometry = await backgroundGeometry(editor);
          expect(geometry).toHaveLength(baseline.length);
          geometry.forEach((rect, index) => {
            for (const dimension of ['left', 'top', 'width', 'height'] as const)
              expect(
                Math.abs(rect[dimension] - baseline[index]![dimension]),
                `${degrees} ${index} ${dimension}`
              ).toBeLessThanOrEqual(1);
          });
          const corners = await editor
            .locator('[data-ui="content.drawing.text-background"]')
            .evaluateAll((nodes) =>
              nodes.map((node) => {
                const style = getComputedStyle(node);
                return [style.borderTopLeftRadius, style.borderBottomLeftRadius];
              })
            );
          expect(corners).toEqual([
            ['3px', '0px'],
            ['0px', '0px'],
            ['0px', '3px'],
          ]);
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
    await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
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
