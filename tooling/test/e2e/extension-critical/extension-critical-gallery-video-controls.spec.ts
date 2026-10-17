import { expect, test, type Locator, type Page } from '@playwright/test';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';

const label = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
const gallery = '/apps/extension/src/gallery/index.html';

async function openReview(page: Page, extensionId: string, theme: 'light' | 'dark') {
  await page.goto(`chrome-extension://${extensionId}${gallery}`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toMatch(/^(ru|en)$/);
  await page.evaluate(async (theme) => {
    localStorage.setItem('sniptale-locale-preference', 'ru');
    await chrome.storage.local.set({
      'sniptale-locale-preference': 'ru',
      'sniptale-theme-preference': theme,
    });
  }, theme);
  await seedReviewVideo(
    page,
    'review-vp8-opus.webm',
    { width: 160, height: 90, duration: 12 },
    false,
    true
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
  await page.locator('[data-ui="gallery.videoReview.enter"]').click();
  const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
  const mode = review.getByRole('button', {
    name: label('gallery.videoReview.advancedEditing'),
    exact: true,
  });
  if ((await mode.getAttribute('aria-pressed')) !== 'true') await mode.click();
  await page.evaluate(() => document.fonts.ready);
  return review;
}

async function range(page: Page, lane: Locator, start: number, end: number) {
  await lane.scrollIntoViewIfNeeded();
  const box = (await lane.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * start, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end, y, { steps: 5 });
  await page.mouse.up();
}

for (const size of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
])
  for (const theme of ['light', 'dark'] as const) {
    test(`native video control geometry ${size.width} ${theme}`, async ({}, info) => {
      test.setTimeout(90_000);
      const launched = await launchExtensionBrowser({ viewport: size });
      const page = await launched.context.newPage();
      page.setDefaultTimeout(10_000);
      try {
        const review = await openReview(page, launched.extensionId, theme);
        const command = (key: Parameters<typeof translate>[0]) =>
          review.getByRole('button', { name: label(key), exact: true });
        const source = review.locator('[data-ui="gallery.videoReview.sourceLane"]');
        const ruler = review.locator('[data-ui="gallery.videoReview.ruler"]');
        await command('gallery.videoReview.speedMode').click();
        await range(page, source, 0.4, 0.6);
        const block = source.locator('[data-ui="gallery.videoReview.editBlock"]');
        await expect(block).toHaveCount(1);
        await command('gallery.videoReview.pointerTool').click();
        await range(page, ruler, 0.3, 0.7);
        const selected = review.locator('[data-ui="gallery.videoReview.playbackRangeOverlay"]');
        await expect(selected).toBeVisible();
        const boundary = (await selected.boundingBox())!;
        const edge = (await block.locator('[data-edge="start"]').boundingBox())!;
        await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
        await page.mouse.down();
        await expect(selected).toBeVisible();
        await page.mouse.move(boundary.x + 4, edge.y + edge.height / 2, { steps: 5 });
        expect(Math.abs((await block.boundingBox())!.x - boundary.x)).toBeLessThanOrEqual(1);
        await page.mouse.up();
        await expect(command('gallery.videoReview.pointerTool')).toBeEnabled();
        await expect
          .poll(async () => Math.abs((await block.boundingBox())!.x - boundary.x))
          .toBeLessThanOrEqual(1);
        const rulerBox = (await ruler.boundingBox())!;
        const pointerX = rulerBox.x + rulerBox.width * 0.7;
        await ruler.hover({ position: { x: rulerBox.width * 0.7, y: 10 } });
        const time = review.locator('[data-ui="gallery.videoReview.hoverTime"] > span');
        await expect(time).toBeVisible();
        const timeBox = (await time.boundingBox())!;
        expect(timeBox.x + timeBox.width).toBeLessThanOrEqual(pointerX - 4);
        await page.screenshot({
          path: info.outputPath('range-magnet-and-time-label.png'),
          fullPage: false,
        });

        await command('gallery.videoReview.scene').click();
        const header = review.locator('[data-ui="window-header-settings"]');
        const browser = header.getByRole('button', {
          name: label('windowHeader.browser'),
          exact: true,
        });
        if (await browser.count()) await browser.click();
        else {
          await header
            .getByRole('button', { name: label('windowHeader.type'), exact: true })
            .click();
          await page
            .getByRole('option', { name: label('windowHeader.browser'), exact: true })
            .click();
        }
        await header
          .getByRole('textbox', { name: label('windowHeader.tabTitle'), exact: true })
          .fill('Проверка шапки');
        await review.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
        const panel = review.locator('[data-ui="gallery.videoReview.previewInspector"]');
        const actual = panel.locator('output[aria-label]');
        await expect(actual).toBeVisible();
        const actualRow = actual.locator('..').locator('..');
        await expect(actualRow.locator('[aria-haspopup]')).toHaveCount(0);
        const toggle = panel.getByRole('switch', {
          name: label('gallery.videoReview.previewShowFrameRate'),
          exact: true,
        });
        const thumb = toggle.locator('.sniptale-glass-switch-thumb');
        const toggleBox = (await toggle.boundingBox())!;
        const thumbBox = (await thumb.boundingBox())!;
        expect(
          Math.abs(toggleBox.y + toggleBox.height / 2 - thumbBox.y - thumbBox.height / 2)
        ).toBeLessThanOrEqual(0.5);
        await panel
          .getByRole('button', { name: label('gallery.videoReview.previewPaused'), exact: true })
          .click();
        await page
          .getByRole('option', {
            name: label('gallery.videoReview.previewPausedDetailed'),
            exact: true,
          })
          .click();
        await expect(
          review.locator('[data-ui="gallery.videoReview.manualPreview"] canvas')
        ).toBeVisible();
        await expect(actual).toContainText('×');
        await command('gallery.videoReview.play').click();
        const frames = await review
          .locator('[data-ui="gallery.videoReview.stage"]')
          .evaluate(async (stage) => {
            const frames = [];
            for (let index = 0; index < 8; index++) {
              await new Promise(requestAnimationFrame);
              const image = stage.querySelector<HTMLImageElement>('img[src^="data:image/svg+xml"]');
              frames.push(Boolean(image?.complete && image.naturalWidth));
            }
            return frames;
          });
        expect(frames).toEqual(Array.from({ length: 8 }, () => true));
        await command('gallery.videoReview.pause').click();
        await expect(
          review.locator('[data-ui="gallery.videoReview.manualPreview"] canvas')
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath('preview-readonly-raster-and-detailed-header.png'),
          fullPage: false,
        });
      } catch (error) {
        await page.screenshot({ path: info.outputPath('control-failure.png'), fullPage: false });
        throw error;
      } finally {
        await closeExtensionBrowser(launched);
      }
    });
  }
