import { chooseInspectorValue } from '../support/inspector-utilities';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';

type Message = Parameters<typeof translate>[0];
const variants = [
  { width: 1280, height: 560, locale: 'ru', theme: 'dark' },
  { width: 1920, height: 900, locale: 'en', theme: 'light' },
  { width: 960, height: 560, locale: 'en', theme: 'dark' },
] as const;

async function persistedPresentation(page: Page) {
  const workspace = await readNativeReviewWorkspace(
    page,
    `recording:${betaV1Fixture.records.recordings[0].id}`
  );
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
        await page
          .locator(`[data-gallery-keyboard-id="${betaV1Fixture.records.media_library[0].id}"]`)
          .getByRole('button', { name: 'beta-v1.webm', exact: true })
          .first()
          .click();
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
        await chooseInspectorValue(page, owner, label(field), label(option));
        await settled();
      };
      await fields.scrollIntoViewIfNeeded();
      await mode('gallery.videoReview.presentationFadeIn').click();
      await settled();
      await expect
        .poll(async () => (await persistedPresentation(page))?.introControl?.mode)
        .toBe('fade');
      const edgeDuration = fields
        .getByRole('textbox', {
          name: label('gallery.videoReview.presentationDuration'),
          exact: true,
        })
        .first();
      await edgeDuration.fill('0.6');
      await edgeDuration.press('Enter');
      await expect
        .poll(async () => (await persistedPresentation(page))?.introControl?.plain.duration)
        .toBe(0.6);
      // Real drag must survive parent preview feedback before the pointer is released.
      const edgeSlider = fields
        .getByRole('slider', {
          name: `${label('gallery.videoReview.presentationDuration')} range`,
          exact: true,
        })
        .first();
      await edgeDuration.hover();
      const sliderBox = (await edgeSlider.boundingBox())!;
      await page.mouse.move(
        sliderBox.x + sliderBox.width * 0.2,
        sliderBox.y + sliderBox.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        sliderBox.x + sliderBox.width * 0.55,
        sliderBox.y + sliderBox.height / 2,
        { steps: 8 }
      );
      const draggedDuration = Number(await edgeSlider.inputValue());
      expect(draggedDuration).toBeGreaterThan(0.6);
      await expect
        .poll(async () => (await persistedPresentation(page))?.introControl?.plain.duration)
        .toBe(0.6);
      await page.mouse.up();
      await settled();
      await expect
        .poll(async () => (await persistedPresentation(page))?.introControl?.plain.duration)
        .toBe(draggedDuration);
      await expect(edgeSlider).toHaveValue(String(draggedDuration));
      await edgeDuration.fill('0.6');
      await edgeDuration.press('Enter');
      await settled();

      await mode('gallery.videoReview.presentationBookend').click();
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
      await mode('gallery.videoReview.presentationNoEffect').click();
      await settled();
      await expect(canvas).toHaveCount(0);
      expect((await persistedPresentation(page))?.intro.image?.assetId).toBe(saved.assetId);
      await mode('gallery.videoReview.presentationBookend').click();
      await settled();
      await expect(canvas).toBeVisible();
      expect((await persistedPresentation(page))?.intro.image?.assetId).toBe(saved.assetId);
      await intro
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.presentationFraming') })
        .click();
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
      const reset = intro.getByRole('button', {
        name: label('gallery.videoReview.presentationResetIntro'),
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
      await select(
        intro,
        'gallery.videoReview.presentationJoinIntro',
        'gallery.videoReview.cutDissolve'
      );
      await intro
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.presentationJoinTiming') })
        .click();
      const joinBefore = intro.getByRole('textbox', {
        name: label('gallery.videoReview.presentationJoinBefore'),
        exact: true,
      });
      await joinBefore.fill('0.4');
      await joinBefore.press('Enter');
      await settled();
      await expect
        .poll(async () => (await persistedPresentation(page))?.introTransition?.before)
        .toBe(0.4);
      await joinBefore.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('presentation-join-controls.png'),
        fullPage: false,
      });
      if (variant.width === 1920) {
        // Exercise the complete native seam pipeline with both retained source edges trimmed.
        await button('gallery.videoReview.cutMode').click();
        const source = review.locator('[data-ui="gallery.videoReview.sourceLane"]');
        for (const [from, to, start, end] of [
          [0.01, 0.07, '0', '1.0001'],
          [0.91, 0.98, '11.0001', '12.01'],
        ] as const) {
          const box = (await source.boundingBox())!;
          await page.mouse.move(box.x + box.width * from, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * to, box.y + box.height / 2, { steps: 5 });
          await page.mouse.up();
          const cut = review.getByRole('button', { name: /^Cut ·/ }).last();
          await cut.click();
          for (const [key, value] of [
            ['rangeStart', start],
            ['rangeEnd', end],
          ] as const) {
            const input = inspector.getByRole('textbox', {
              name: label(`gallery.videoReview.${key}`),
              exact: true,
            });
            await input.fill(value);
            await input.press('Enter');
          }
        }
        await showScene();
      }
      const mainVideo = review.locator('video').first();
      const trigger = mode('gallery.videoReview.presentationPreviewJoinIntro');
      await trigger.click();
      const modal = page.locator('[data-ui="gallery.videoReview.presentationPreview"]');
      await expect(modal).toBeVisible();
      await expect(modal.getByRole('status')).toBeVisible();
      await page.screenshot({
        path: info.outputPath('presentation-seam-pending.png'),
        fullPage: false,
      });
      const clip = modal.locator('video');
      await expect(clip).toBeVisible({ timeout: 45_000 });
      await expect
        .poll(() => clip.evaluate((node: HTMLVideoElement) => node.readyState))
        .toBeGreaterThanOrEqual(4);
      await expect
        .poll(() => mainVideo.evaluate((node: HTMLVideoElement) => node.paused))
        .toBe(true);
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
      await button('common.actions.close').click();
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
            name: label('gallery.videoReview.presentationBookend'),
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
        const outroPreview = outro.getByRole('button', {
          name: label('gallery.videoReview.presentationPreviewJoinOutro'),
          exact: true,
        });
        await outroPreview.click();
        const outroModal = page.locator('[data-ui="gallery.videoReview.presentationPreview"]');
        await expect(outroModal.locator('video')).toBeVisible({ timeout: 45_000 });
        await expect
          .poll(() =>
            outroModal.locator('video').evaluate((node: HTMLVideoElement) => node.readyState)
          )
          .toBeGreaterThanOrEqual(4);
        await page.screenshot({
          path: info.outputPath('presentation-tail-cut-seam-ready.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await expect(outroModal).toHaveCount(0);

        await expect(
          outro.getByRole('switch', {
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
          outro.getByRole('switch', {
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
        await outro
          .locator('summary')
          .filter({ hasText: label('gallery.videoReview.presentationTrim') })
          .click();
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
