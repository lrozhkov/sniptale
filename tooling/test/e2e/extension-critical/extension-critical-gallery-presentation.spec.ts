import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { translate } from '../../../../apps/extension/src/platform/i18n';

type Message = Parameters<typeof translate>[0];
const variants = [
  { width: 1280, height: 560, locale: 'ru', theme: 'dark' },
  { width: 1920, height: 900, locale: 'en', theme: 'light' },
  { width: 960, height: 560, locale: 'en', theme: 'dark' },
] as const;

async function persistedPresentation(page: Page) {
  const raw = await page.evaluate(
    async ({ databaseName, aggregateId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const request = db
            .transaction('video_workspaces')
            .objectStore('video_workspaces')
            .get(aggregateId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    {
      databaseName: betaV1Fixture.databaseName,
      aggregateId: `recording:${betaV1Fixture.records.recordings[0].id}`,
    }
  );
  const workspace = parseVideoWorkspace(raw);
  if (!workspace) throw new Error('Expected a valid persisted workspace');
  const operation = workspace.history
    .slice(0, workspace.cursor)
    .findLast((item) => item.target === 'advancedContent');
  return operation?.target === 'advancedContent'
    ? operation.after.presentation
    : workspace.advanced.presentation;
}

async function thumbnailCenter(canvas: Locator) {
  return canvas.evaluate((node: HTMLCanvasElement) =>
    Array.from(
      node
        .getContext('2d')!
        .getImageData(Math.floor(node.width / 2), Math.floor(node.height / 2), 1, 1).data
    )
  );
}

async function inspectorBreakpoints(
  page: Page,
  inspector: Locator,
  preview: Locator,
  info: TestInfo
) {
  const scroll = inspector.locator('.review-inspector-scroll');
  const width = () =>
    scroll.evaluate((node) => {
      const css = getComputedStyle(node);
      return node.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    });
  const handle = inspector.locator('[data-review-panel-resize="inspector"]');
  for (const target of [523, 524, 525]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await width();
      if (Math.abs(current - target) < 0.5) break;
      const box = (await handle.boundingBox())!;
      const y = box.y + Math.min(20, box.height / 2);
      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + current - target, y, { steps: 4 });
      await page.mouse.up();
    }
    await expect.poll(width).toBe(target);
    await expect(
      inspector.locator('[data-ui="gallery.videoReview.inspectorSections"]:visible')
    ).toHaveCSS('display', target < 524 ? 'block' : 'grid');
    await preview.scrollIntoViewIfNeeded();
    await expect(preview).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: info.outputPath(`presentation-inspector-${target}.png`),
      fullPage: false,
    });
  }
  await handle.focus();
  await handle.press('Home');
}

for (const variant of variants) {
  test(`presentation authoring and seam preview ${variant.width} ${variant.locale} ${variant.theme}`, async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: variant.width, height: variant.height });
    const host = await startHostServer();
    const label = (key: Message) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      const open = async () => {
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      };
      await open();
      const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
      const button = (key: Message) =>
        review.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      const inspector = review.locator('[data-ui="gallery.videoReview.inspector"]');
      const showScene = () =>
        inspector
          .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
          .click();
      await showScene();
      const fields = inspector.locator('[data-ui="gallery.videoReview.presentationInspector"]');
      const intro = fields.locator(
        `section[aria-label="${label('gallery.videoReview.presentationIntro')}"]`
      );
      const mode = (key: Message) => intro.getByRole('button', { name: label(key), exact: true });
      const settled = () => expect(fields).toHaveAttribute('aria-busy', 'false');
      const select = async (owner: Locator, field: Message, option: Message) => {
        await owner.getByRole('button', { name: label(field), exact: true }).click();
        await page.getByRole('option', { name: label(option), exact: true }).click();
        await settled();
      };
      await fields.scrollIntoViewIfNeeded();
      await select(
        fields,
        'gallery.videoReview.presentationFadeIn',
        'gallery.videoReview.presentationOn'
      );
      await select(
        fields,
        'gallery.videoReview.presentationFadeOut',
        'gallery.videoReview.presentationOn'
      );
      await expect.poll(async () => (await persistedPresentation(page))?.fadeIn.enabled).toBe(true);
      const edgeDuration = fields
        .getByRole('textbox', {
          name: label('gallery.videoReview.presentationDuration'),
          exact: true,
        })
        .first();
      await edgeDuration.fill('0.6');
      await edgeDuration.press('Enter');
      await expect.poll(async () => (await persistedPresentation(page))?.fadeIn.duration).toBe(0.6);
      await mode('gallery.videoReview.presentationImage').click();
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 100;
        const context = canvas.getContext('2d')!;
        ['#ff0000', '#00ff00', '#0000ff'].forEach((color, index) => {
          context.fillStyle = color;
          context.fillRect(index * 100, 0, 100, 100);
        });
        return canvas.toDataURL('image/png').split(',')[1]!;
      });
      const chooser = page.waitForEvent('filechooser');
      await mode('gallery.videoReview.presentationComputer').click();
      await (
        await chooser
      ).setFiles({
        name: 'presentation-color-bands.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
      });
      await expect.poll(async () => (await persistedPresentation(page))?.intro.mode).toBe('image');
      await settled();
      const saved = (await persistedPresentation(page))!.intro.image!;
      const canvas = intro.locator('canvas');
      await expect(canvas).toBeVisible();
      await expect.poll(() => thumbnailCenter(canvas)).toEqual([0, 255, 0, 255]);
      await expect
        .poll(() =>
          canvas.evaluate((node: HTMLCanvasElement) =>
            Array.from(node.getContext('2d')!.getImageData(0, 0, 1, 1).data)
          )
        )
        .toEqual([0, 0, 0, 255]);
      await mode('gallery.videoReview.presentationNone').click();
      await settled();
      await expect(canvas).toHaveCount(0);
      expect((await persistedPresentation(page))?.intro.image?.assetId).toBe(saved.assetId);
      await mode('gallery.videoReview.presentationImage').click();
      await settled();
      await expect(canvas).toBeVisible();
      expect((await persistedPresentation(page))?.intro.image?.assetId).toBe(saved.assetId);
      await select(
        intro,
        'gallery.videoReview.presentationFit',
        'gallery.videoReview.presentationCover'
      );
      const pan = intro.getByRole('textbox', {
        name: label('gallery.videoReview.presentationPanX'),
        exact: true,
      });
      await pan.fill('-100');
      await pan.press('Enter');
      await expect.poll(() => thumbnailCenter(canvas)).toEqual([255, 0, 0, 255]);
      await pan.fill('100');
      await pan.press('Enter');
      await expect.poll(() => thumbnailCenter(canvas)).toEqual([0, 0, 255, 255]);
      await canvas.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('presentation-thumbnail-fill.png'),
        fullPage: false,
      });
      if (variant.width === 1920) await inspectorBreakpoints(page, inspector, canvas, info);
      const reset = fields.getByRole('button', {
        name: label('gallery.videoReview.presentationReset'),
        exact: true,
      });
      await reset.scrollIntoViewIfNeeded();
      await expect(reset).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: info.outputPath('presentation-footer.png'), fullPage: false });
      if (variant.width === 960) {
        const scroll = review.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        expect(await scroll.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        expect(await scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      }
      const mainVideo = review.locator('video').first();
      const trigger = mode('gallery.videoReview.presentationPreview');
      await trigger.click();
      const modal = page.locator('[data-ui="gallery.videoReview.presentationPreview"]');
      await expect(modal).toBeVisible();
      const selectedWindow = modal.locator(
        '[data-ui="shared.ui.compact-inspector.segmented-row"] > button[aria-pressed="true"]'
      );
      await expect(selectedWindow).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await expect(selectedWindow).toHaveCSS('box-shadow', 'none');
      await expect(modal.getByRole('status')).toBeVisible();
      await page.screenshot({
        path: info.outputPath('presentation-seam-pending.png'),
        fullPage: false,
      });
      const clip = modal.locator('video');
      await expect(clip).toBeVisible({ timeout: 45_000 });
      await expect
        .poll(() => clip.evaluate((node: HTMLVideoElement) => node.readyState))
        .toBeGreaterThanOrEqual(2);
      await expect
        .poll(() => mainVideo.evaluate((node: HTMLVideoElement) => node.paused))
        .toBe(true);
      if (variant.width === 1920) {
        const joinUrl = await clip.getAttribute('src');
        await modal
          .getByRole('button', {
            name: label('gallery.videoReview.presentationWindowStart'),
            exact: true,
          })
          .click();
        await expect(clip).toBeVisible({ timeout: 45_000 });
        await expect(clip).not.toHaveAttribute('src', joinUrl!);
        await expect
          .poll(() => clip.evaluate((node: HTMLVideoElement) => node.readyState))
          .toBeGreaterThanOrEqual(2);
        await expect
          .poll(() => clip.evaluate((node: HTMLVideoElement) => node.duration))
          .toBeLessThanOrEqual(4.001);
        await modal
          .getByRole('button', {
            name: label('gallery.videoReview.presentationWindowJoin'),
            exact: true,
          })
          .click();
        await expect(clip).toBeVisible({ timeout: 45_000 });
        await expect
          .poll(() => clip.evaluate((node: HTMLVideoElement) => node.readyState))
          .toBeGreaterThanOrEqual(2);
        expect(await mainVideo.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
      }
      await modal.focus();
      await page.keyboard.press('Space');
      await expect.poll(() => clip.evaluate((node: HTMLVideoElement) => node.paused)).toBe(false);
      expect(await mainVideo.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
      await page.keyboard.press('Space');
      await expect.poll(() => clip.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
      await page.screenshot({
        path: info.outputPath('presentation-seam-ready.png'),
        fullPage: false,
      });
      const close = modal
        .getByRole('button', { name: label('common.actions.close'), exact: true })
        .last();
      await expect(close).toBeInViewport({ ratio: 1 });
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await mainVideo.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
      await button('gallery.videoReview.back').click();
      await page.reload();
      await open();
      await showScene();
      await expect
        .poll(async () => (await persistedPresentation(page))?.intro.image?.assetId)
        .toBe(saved.assetId);
      await expect.poll(() => thumbnailCenter(canvas)).toEqual([0, 0, 255, 255]);
      await canvas.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('presentation-reopened.png'),
        fullPage: false,
      });
      if (variant.width === 1920) {
        const outro = fields.locator(
          `section[aria-label="${label('gallery.videoReview.presentationOutro')}"]`
        );
        await outro
          .getByRole('button', {
            name: label('gallery.videoReview.presentationVideo'),
            exact: true,
          })
          .click();
        const uploadVideo = async (filename: string) => {
          const choose = page.waitForEvent('filechooser');
          await outro
            .getByRole('button', {
              name: label('gallery.videoReview.presentationComputer'),
              exact: true,
            })
            .click();
          await (
            await choose
          ).setFiles({
            name: filename,
            mimeType: 'video/webm',
            buffer: await readFile(new URL(`../fixtures/${filename}`, import.meta.url)),
          });
          await settled();
          await expect(outro.locator('canvas')).toBeVisible();
        };
        await uploadVideo('review-vp8-opus.webm');
        await expect(
          outro.getByRole('button', {
            name: label('gallery.videoReview.presentationSound'),
            exact: true,
          })
        ).toBeVisible();
        await expect(
          outro.getByRole('textbox', {
            name: label('gallery.videoReview.presentationVolume'),
            exact: true,
          })
        ).toBeVisible();
        await uploadVideo('review-webcam-clock.webm');
        await expect(
          outro.getByRole('button', {
            name: label('gallery.videoReview.presentationSound'),
            exact: true,
          })
        ).toHaveCount(0);
        await expect(
          outro.getByRole('textbox', {
            name: label('gallery.videoReview.presentationVolume'),
            exact: true,
          })
        ).toHaveCount(0);
        const edit = async (key: Message, value: string) => {
          const input = outro.getByRole('textbox', { name: label(key), exact: true });
          await input.fill(value);
          await input.press('Enter');
          await settled();
        };
        await edit('gallery.videoReview.presentationTrimStart', '1');
        await edit('gallery.videoReview.presentationTrimEnd', '2');
        await expect
          .poll(async () => (await persistedPresentation(page))?.outro.video?.trim)
          .toEqual({ start: 1, end: 2 });
        await expect(outro.locator('canvas')).toBeVisible();
        const beforeSeek = await thumbnailCenter(outro.locator('canvas'));
        await edit('gallery.videoReview.presentationMediaPosition', '2');
        await expect.poll(() => thumbnailCenter(outro.locator('canvas'))).not.toEqual(beforeSeek);
        await expect(outro.locator('canvas')).toBeVisible();
        await expect(outro.getByRole('alert')).toHaveCount(0);
        expect((await persistedPresentation(page))?.outro.video?.trim).toEqual({
          start: 1,
          end: 2,
        });
        expect(await mainVideo.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
        await outro.locator('canvas').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('presentation-video-trim-preview.png'),
          fullPage: false,
        });
      }
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
