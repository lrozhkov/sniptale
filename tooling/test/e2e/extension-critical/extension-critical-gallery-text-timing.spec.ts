import { expect, test, type Page } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { startHostServer } from '../support/host-server';
import { persistedReviewContent } from '../support/voiceover-speech-fixture';

async function gesture(page: Page, start: number, end?: number) {
  const plane = page.locator('[data-ui="gallery.videoReview.timePlane"]');
  const lane = plane.locator(
    end === undefined
      ? '[data-ui="gallery.videoReview.ruler"]'
      : '[data-ui="gallery.videoReview.sourceLane"]'
  );
  const box = (await lane.boundingBox())!;
  const duration = Number(await plane.getAttribute('aria-valuemax'));
  const x = (time: number) => box.x + (box.width * time) / duration;
  await page.mouse.move(x(start), box.y + 12);
  if (end === undefined) await page.mouse.click(x(start), box.y + 12);
  else {
    await page.mouse.down();
    await page.mouse.move(x(end), box.y + 12, { steps: 8 });
    await page.mouse.up();
  }
}

for (const { size: viewport } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`text source placement survives Cut, Speed, history and reopen ${viewport.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'dark' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      const open = async () => {
        await page.reload();
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      };
      await open();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.textTrackOpen').click();
      await button('gallery.videoReview.textViewCards').click();
      const document = dialog.locator('[data-ui="gallery.videoReview.textDocument"]');
      for (const [time, text] of [
        [5, 'Affected phrase'],
        [9, 'Later phrase'],
      ] as const) {
        await gesture(page, time);
        await document
          .getByRole('button', { name: label('gallery.videoReview.textFragmentAdd'), exact: true })
          .click();
        await document
          .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
          .fill(text);
        await page.keyboard.press('Tab');
        await expect
          .poll(async () => (await persistedReviewContent(page))?.text?.fragments.at(-1)?.text)
          .toBe(text);
      }
      const before = (await persistedReviewContent(page))!.text!;
      const track = dialog.locator('[data-ui="gallery.videoReview.textTrack"]');
      const positions = async () =>
        track.locator('[data-text-id]').evaluateAll((nodes) =>
          nodes.map((node) => ({
            id: node.getAttribute('data-text-id'),
            left: (node as HTMLElement).style.left,
            width: (node as HTMLElement).style.width,
          }))
        );
      const initial = await positions();
      await button('gallery.videoReview.cutMode').click();
      await gesture(page, 1, 3);
      await expect
        .poll(async () =>
          (await persistedReviewContent(page))?.text?.fragments.every(
            (fragment) => !!fragment.sourceAnchor
          )
        )
        .toBe(true);
      await expect.poll(positions).toEqual(initial);
      await button('gallery.videoReview.undo').click();
      await expect.poll(async () => (await persistedReviewContent(page))?.text).toEqual(before);
      await button('gallery.videoReview.redo').click();
      await expect.poll(positions).toEqual(initial);
      await button('gallery.videoReview.pointerTool').click();
      await button('gallery.videoReview.speedMode').click();
      await button('gallery.videoReview.speedRate').click();
      await page.getByRole('option', { name: '2×', exact: true }).click();
      await gesture(page, 5, 7);
      await expect.poll(async () => (await positions())[0]?.width).not.toBe(initial[0]!.width);
      expect((await positions())[1]).toEqual(initial[1]);
      const current = (await persistedReviewContent(page))!.text!;
      expect(current.fragments[0]!.sourceAnchor!.duration).toBeCloseTo(
        before.fragments[0]!.end - before.fragments[0]!.start,
        7
      );
      expect(current.fragments[0]!.end - current.fragments[0]!.start).toBeCloseTo(
        before.fragments[0]!.end - before.fragments[0]!.start,
        7
      );
      const after = await positions();
      await track.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('text-speed-source-placement.png'),
        fullPage: false,
      });
      await page.reload();
      await expect(track).toBeVisible();
      await expect.poll(async () => (await persistedReviewContent(page))?.text).toEqual(current);
      await expect.poll(positions).toEqual(after);
      await button('gallery.videoReview.undo').click();
      await expect.poll(positions).toEqual(initial);
      await button('gallery.videoReview.redo').click();
      await expect.poll(positions).toEqual(after);
      await track.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('text-placement-reopened.png'),
        fullPage: false,
      });
      const later = track.locator('[data-text-id]').nth(1);
      const box = (await later.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await expect
        .poll(async () => (await persistedReviewContent(page))?.text?.fragments[1]?.timingRevision)
        .toBe(1);
      expect(
        (await persistedReviewContent(page))!.text!.fragments[1]!.sourceAnchor
      ).toBeUndefined();
      expect((await positions())[0]).toEqual(after[0]);
      await button('gallery.videoReview.undo').click();
      await expect.poll(positions).toEqual(after);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
