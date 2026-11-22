import { expect, test } from '@playwright/test';
import { evaluateInTarget } from '../support/recording-action';
import {
  CAMERA_ROUTE,
  capture,
  command,
  launchCamera,
  tr,
  withBrowser,
} from './camera-recorder-design.test-support';

for (const locale of ['ru', 'en'] as const) {
  test(`recording failure opens its result and recovery actions ${locale}`, async ({}, info) => {
    test.setTimeout(150_000);
    const composition = { locale, theme: locale === 'ru' ? 'light' : 'dark' } as const;
    await withBrowser(composition, info, async (context, extensionId, origin) => {
      const recorder = await launchCamera(context, extensionId, origin, composition);
      if (locale === 'en') {
        await command(recorder, composition, 'popup.video.teleprompterShow').click();
        await recorder
          .locator('textarea')
          .fill('Keep this private script after an encoder failure');
      }
      await expect.poll(() => recorder.getByRole('timer').textContent()).not.toBe('00:00');
      const browser = context.browser();
      if (!browser) throw new Error('Recording browser is unavailable');
      const session = await browser.newBrowserCDPSession();
      let offscreenId: string;
      try {
        const targets = await session.send('Target.getTargets');
        const offscreen = targets.targetInfos.find((target) =>
          target.url.includes('/offscreen/offscreen.html')
        );
        if (!offscreen) throw new Error('Recording offscreen document is unavailable');
        offscreenId = offscreen.targetId;
      } finally {
        await session.detach();
      }
      // Fail an actual encoder input. Production source cleanup and lifecycle delivery must open the result.
      const failure =
        locale === 'ru'
          ? 'Live audio buffer exceeded its bounded capacity.'
          : 'Injected native encoder failure';
      const reopened = locale === 'ru';
      if (reopened) await recorder.close();
      const encoder = locale === 'ru' ? 'AudioEncoder' : 'VideoEncoder';
      const throwOnEncode = `function () { throw new Error(${JSON.stringify(failure)}); }`;
      await evaluateInTarget(
        context,
        offscreenId,
        `${encoder}.prototype.encode = ${throwOnEncode}; true`
      );
      await expect
        .poll(() => context.pages().some((page) => new URL(page.url()).pathname === CAMERA_ROUTE))
        .toBe(true);
      const result = context.pages().find((page) => new URL(page.url()).pathname === CAMERA_ROUTE);
      if (!result) throw new Error('Failure result did not open');
      await expect(result.locator('[data-ui="camera-recorder.failure"]')).toBeVisible();
      if (!reopened) expect(result).toBe(recorder);
      await expect(
        result.getByRole('heading', {
          name: tr(composition, 'popup.video.recordingInterruptedTitle'),
        })
      ).toBeVisible();
      await expect(result.getByRole('alert')).toContainText(
        tr(
          composition,
          reopened
            ? 'popup.video.recordingInterruptedAudio'
            : 'popup.video.recordingInterruptedUnknown'
        )
      );
      await expect(result.locator('[data-ui="camera-recorder.live"]')).toBeHidden();
      if (!reopened) {
        await expect(result.locator('textarea')).toHaveValue(
          'Keep this private script after an encoder failure'
        );
        await result.evaluate(() => {
          location.hash = 'draft=1&teleprompter=1';
        });
        await expect(result.locator('textarea')).toBeVisible();
        await expect(result.locator('textarea')).toHaveValue(
          'Keep this private script after an encoder failure'
        );
        await result.evaluate(() => {
          location.hash = 'failure=unknown';
        });
        await expect(result.locator('[data-ui="camera-recorder.failure"]')).toBeVisible();
      }
      for (const viewport of [
        { width: 1280, height: 560 },
        { width: 1920, height: 900 },
        { width: 960, height: 720 },
        { width: 423, height: 400 },
        { width: 424, height: 400 },
        { width: 425, height: 400 },
        { width: 360, height: 320 },
      ]) {
        await result.setViewportSize(viewport);
        const close = command(result, composition, 'popup.video.postRecordClose');
        await close.scrollIntoViewIfNeeded();
        await expect(close).toBeVisible();
        expect(
          await result.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        ).toBe(true);
        if (viewport.width >= 960 || viewport.width === 360)
          await capture(result, info, `failure-${viewport.width}x${viewport.height}`);
      }
      await result.setViewportSize({ width: 1280, height: 560 });
      const libraryOpened = context.waitForEvent('page', { predicate: (page) => page !== result });
      await command(result, composition, 'popup.video.postRecordOpenGallery').click();
      const library = await libraryOpened;
      await expect(library).toHaveURL(/\/gallery\/index\.html/u);
      await expect.poll(() => result.isClosed()).toBe(true);
      await library.setViewportSize({ width: 1280, height: 560 });
      await expect(library.locator('[data-ui="gallery.recording-recovery"]')).toBeVisible();
      await capture(library, info, 'library-recovery');
      const closed = context.waitForEvent('page');
      await library.evaluate(async () => {
        await chrome.windows.create({
          url: chrome.runtime.getURL(
            'apps/extension/src/camera-recorder/index.html?failure=unknown'
          ),
          type: 'popup',
          width: 960,
          height: 720,
        });
      });
      const dismissible = await closed;
      await command(dismissible, composition, 'popup.video.postRecordClose').click();
      await expect.poll(() => dismissible.isClosed()).toBe(true);
    });
  });
}
