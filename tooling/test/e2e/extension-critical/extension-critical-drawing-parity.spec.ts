import type { Locator, Page } from '@playwright/test';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { expect, test } from '../support/extension-fixture';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

async function pixels(canvas: Locator): Promise<string> {
  return canvas.evaluate(async (element) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Drawing canvas unavailable');
    return element.toDataURL();
  });
}

async function stroke(page: Page, canvas: Locator, y: number, long: boolean) {
  await page.mouse.move(100, y);
  await page.mouse.down();
  for (let index = 1; index <= (long ? 90 : 12); index++) {
    await page.mouse.move(100 + index * (long ? 10 : 15), y + Math.sin(index / 3) * 35);
  }
  const live = await pixels(canvas);
  await page.mouse.up();
  expect(await pixels(canvas)).toBe(live);
  await page.mouse.move(1100, 600);
  expect(await pixels(canvas)).toBe(live);
  return live;
}

for (const locale of ['en', 'ru'] as const) {
  for (const mode of ['drawing', 'video-recording'] as const) {
    test(`${mode} ${locale} follows image-editor strokes and Shift-only arrows at HD`, async ({
      context,
      extensionId,
      hostOrigin,
    }, testInfo) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
      const previousLocale = await popup.evaluate(async () => {
        const value = (await chrome.storage.local.get('sniptale-locale-preference'))[
          'sniptale-locale-preference'
        ];
        return typeof value === 'string' ? value : null;
      });
      await popup.evaluate(
        async (locale) => chrome.storage.local.set({ 'sniptale-locale-preference': locale }),
        locale
      );
      await page.bringToFront();
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
      if (mode === 'video-recording') {
        const browser = context.browser();
        if (!browser) throw new Error('Native extension browser unavailable');
        const cdp = await browser.newBrowserCDPSession();
        try {
          const targets = await cdp.send('Target.getTargets', {
            filter: [{ type: 'tab', exclude: false }, { exclude: true }],
          });
          const tab = targets.targetInfos.find((candidate) => candidate.url === page.url());
          if (!tab) throw new Error('Native drawing tab unavailable');
          await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
        } finally {
          await cdp.detach();
        }
        await page.bringToFront();
        await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toBeVisible(
          { timeout: 30_000 }
        );
      }
      const canvas = page.locator(
        '[data-ui="content.drawing.surface"] canvas.sniptale-drawing-canvas[tabindex="0"]'
      );
      for (const [tool, y] of [
        ['pencil', 320],
        ['marker', 440],
      ] as const) {
        await page.locator(`[data-ui="content.toolbar.drawing.${tool}"]`).click();
        await expect(canvas).toHaveCSS('pointer-events', 'auto');
        await stroke(page, canvas, y, false);
        const committed = await stroke(page, canvas, y + 70, true);
        await page.mouse.move(100, 600);
        await page.mouse.down();
        await page.mouse.move(300, 650);
        await canvas.evaluate((element) =>
          element.dispatchEvent(
            new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse' })
          )
        );
        await page.mouse.up();
        expect(await pixels(canvas)).toBe(committed);
        await stroke(page, canvas, y + 100, false);
      }
      const arrow = page.locator('[data-ui="content.toolbar.drawing.arrow"]');
      await expect(arrow).toHaveAccessibleDescription(
        locale === 'ru' ? 'Свободный угол; Shift — шаг 15°' : 'Free angle; Shift — 15° steps'
      );
      await arrow.click();
      await page.mouse.move(100, 250);
      await page.mouse.down();
      await page.mouse.move(400, 264);
      const free = await pixels(canvas);
      await page.keyboard.down('Shift');
      await page.mouse.move(401, 264);
      const snapped = await pixels(canvas);
      expect(snapped).not.toBe(free);
      await page.keyboard.up('Shift');
      await page.mouse.move(400, 264);
      expect(await pixels(canvas)).toBe(free);
      await page.mouse.up();
      expect(await pixels(canvas)).toBe(free);
      await page.screenshot({ path: testInfo.outputPath(`${mode}-drawing-HD.png`) });
      if (mode === 'video-recording') {
        await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toHaveCount(
          0,
          { timeout: 30_000 }
        );
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
          const response = await chrome.runtime.sendMessage({
            type: 'GET_RECORDING_STATE',
            __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
          });
          if (typeof response.postRecordResult?.recordingId !== 'string')
            throw new Error('Saved recording identity unavailable');
          return response.postRecordResult.recordingId;
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
      await popup.evaluate(async (previous) => {
        if (previous === null) await chrome.storage.local.remove('sniptale-locale-preference');
        else await chrome.storage.local.set({ 'sniptale-locale-preference': previous });
      }, previousLocale);
      await popup.close();
      await page.close();
    });
  }
}
