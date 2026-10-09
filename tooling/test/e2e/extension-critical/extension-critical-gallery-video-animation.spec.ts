import { expect, test, type Locator } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import {
  addReviewFocus,
  seedReviewVideo,
  persistedFocus,
} from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

async function expectAlignedRange(range: Locator, value: number) {
  await expect.poll(async () => Number(await range.inputValue())).toBeCloseTo(value, 9);
  const geometry = await range.evaluate((node) => {
    if (!(node instanceof HTMLInputElement)) throw new Error('Expected native range');
    const shell = node.parentElement!;
    const track = shell.querySelector(
      '[data-ui="shared.ui.compact-inspector.numeric-range-track"]'
    )!;
    const bounds = node.getBoundingClientRect();
    const trackBounds = track.getBoundingClientRect();
    const thumb = Number.parseFloat(
      getComputedStyle(node).getPropertyValue('--sniptale-range-thumb-size')
    );
    const fill =
      Number.parseFloat(shell.style.getPropertyValue('--sniptale-range-fill-ratio')) / 100;
    const span = Number(node.max) - Number(node.min);
    const ratio = span > 0 ? (node.valueAsNumber - Number(node.min)) / span : 0;
    return {
      gap: Math.abs(
        trackBounds.x +
          trackBounds.width * fill -
          (bounds.x + thumb / 2 + (bounds.width - thumb) * ratio)
      ),
      fill,
      ratio,
    };
  });
  expect(geometry.fill).toBeCloseTo(geometry.ratio, 9);
  expect(geometry.gap).toBeLessThan(0.6);
}

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`coupled animation sliders stay aligned through edits and trim in ${variant.locale}/${variant.theme}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
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
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: translate(key, variant.locale), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await addReviewFocus(page);
      const phase = (side: 'In' | 'Out') =>
        dialog.getByRole('group', {
          name: translate(`gallery.videoReview.zoomTransition${side}`, variant.locale),
          exact: true,
        });
      const enter = phase('In').locator('input[type="text"]');
      const exit = phase('Out').locator('input[type="text"]');
      const enterRange = phase('In').locator('input[type="range"]');
      const exitRange = phase('Out').locator('input[type="range"]');
      await enter.fill('1.67');
      await enter.press('Enter');
      await phase('Out').locator('[data-ui="shared.ui.compact-inspector.numeric-row"]').hover();
      await exitRange.press('End');
      await expect(exit).toHaveValue('0.33');
      await expectAlignedRange(exitRange, 0.33);
      await exitRange.press('ArrowLeft');
      await expect(exit).toHaveValue('0.32');
      await expectAlignedRange(exitRange, 0.32);
      await page.screenshot({ path: info.outputPath('fractional-exit.png'), fullPage: false });
      await enter.fill('0.37');
      await enter.press('Enter');
      await expect
        .poll(async () => Number(await exitRange.getAttribute('max')))
        .toBeCloseTo(1.63, 9);
      await exitRange.press('End');
      await expectAlignedRange(exitRange, 1.63);
      await expect(enter).toHaveValue('0.37');
      await phase('In').locator('[data-ui="shared.ui.compact-inspector.numeric-row"]').hover();
      const box = (await enterRange.boundingBox())!;
      await page.mouse.move(box.x + 8, box.y + box.height / 2);
      await page.mouse.down();
      for (const ratio of [0.25, 0.5, 0.75, 1]) {
        await page.mouse.move(box.x + 8 + (box.width - 16) * ratio, box.y + box.height / 2, {
          steps: 3,
        });
        const value = Number(await enter.inputValue());
        await expectAlignedRange(enterRange, value);
        expect(value + Number(await exit.inputValue())).toBeLessThanOrEqual(2.000000001);
      }
      await page.mouse.move(box.x + box.width - 8, box.y + box.height + 40);
      await page.mouse.up();
      await page.mouse.move(0, 0);
      await expect(
        phase('In').locator('[data-ui="shared.ui.compact-inspector.numeric-row"]')
      ).toHaveAttribute('data-range-visible', 'false');
      await expect
        .poll(async () => (await persistedFocus(page))?.enter.duration)
        .toBeCloseTo(0.37, 9);
      const before = (await persistedFocus(page))!;
      const block = dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first();
      const end = (await block.locator('[data-zoom-edge="end"]').boundingBox())!;
      const blockBox = (await block.boundingBox())!;
      await page.keyboard.down('Shift');
      await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
      await page.mouse.down();
      await page.mouse.move(blockBox.x + blockBox.width * 0.63, end.y + end.height / 2, {
        steps: 8,
      });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await expect
        .poll(async () => (await persistedFocus(page))?.enter.duration)
        .toBeLessThan(before.enter.duration);
      const trimmed = (await persistedFocus(page))!;
      expect(trimmed.enter.duration / trimmed.exit.duration).toBeCloseTo(
        before.enter.duration / before.exit.duration,
        8
      );
      for (const [range, input, expected] of [
        [enterRange, enter, trimmed.enter.duration],
        [exitRange, exit, trimmed.exit.duration],
      ] as const) {
        await input.scrollIntoViewIfNeeded();
        await input.hover();
        await expect(input).toHaveValue(expected.toFixed(2).replace(/\.?0+$/, ''));
        await expectAlignedRange(range, expected);
        await range.focus();
        await input.focus();
      }
      await page.screenshot({ path: info.outputPath('fitted-phases.png'), fullPage: false });
      await exitRange.press('ArrowLeft');
      await expect
        .poll(async () => (await persistedFocus(page))?.exit.duration)
        .toBeLessThan(trimmed.exit.duration);
      const stepped = (await persistedFocus(page))!;
      expect(trimmed.exit.duration - stepped.exit.duration).toBeLessThanOrEqual(0.010000001);
      await expectAlignedRange(exitRange, stepped.exit.duration);
      await button('gallery.videoReview.undo').click();
      await expect.poll(() => persistedFocus(page)).toEqual(trimmed);
      await button('gallery.videoReview.undo').click();
      await expect.poll(() => persistedFocus(page)).toEqual(before);
      await button('gallery.videoReview.redo').click();
      await expect.poll(() => persistedFocus(page)).toEqual(trimmed);
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await block.click();
      await expectAlignedRange(exitRange, trimmed.exit.duration);
      await expect.poll(() => persistedFocus(page)).toEqual(trimmed);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
