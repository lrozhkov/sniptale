import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('motion blur preserves overlapping layer occlusion in full editor preview and export', async ({
  page,
}, info) => {
  await page.route('https://motion-blur.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' })
  );
  await page.goto('https://motion-blur.test/');
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/motion-blur-probe.tsx'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.css': 'empty', '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const result = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    return (await import(url)).fullEditorOcclusion();
  }, bundle.outputFiles[0]!.text);
  await page.screenshot({ path: info.outputPath('layer-occlusion.png'), fullPage: false });
  for (const sample of result)
    expect.soft(sample.pixel, JSON.stringify(sample)).toEqual([255, 0, 0, 255]);
});

test('quick scene exposure changes only moving phases and preserves opacity with header, corners and shadow', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/motion-blur-probe.tsx'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.css': 'empty', '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const result = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    return (await import(url)).quickSceneExposure();
  }, bundle.outputFiles[0]!.text);
  for (const sample of result.results) {
    expect(sample.opacityLoss).toBe(0);
    if (sample.time === 2) expect(sample.changed).toBe(0);
    else if (sample.time < 3 || sample.time > 6)
      expect(sample.changed, JSON.stringify(sample)).toBeGreaterThan(0);
  }
  for (const follows of [false, true])
    expect(
      Math.max(
        ...result.results
          .filter(
            (sample: { follows: boolean; time: number }) =>
              sample.follows === follows && sample.time >= 3 && sample.time <= 6
          )
          .map((sample: { changed: number }) => sample.changed)
      )
    ).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('quick-exposure.png'), fullPage: false });
  await writeFile(info.outputPath('exposure-metrics.json'), JSON.stringify(result, null, 2));
  await info.attach('exposure-metrics', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  });
});

import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import {
  addReviewFocus,
  seedReviewVideo,
  persistedFocus,
} from '../support/quick-editor-media-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';

for (const variant of [
  { width: 1280, height: 560, locale: 'ru', theme: 'light' },
  { width: 1920, height: 900, locale: 'en', theme: 'dark' },
] as const)
  test(`quick motion blur phase controls persist (${variant.width}, ${variant.locale})`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await page.setViewportSize({ width: variant.width, height: variant.height });
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
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await addReviewFocus(page);
      const inspector = dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]');
      const enter = inspector.locator(
        '[data-ui="gallery.videoReview.motionBlurSettings"][data-phase="enter"]'
      );
      const exit = inspector.locator(
        '[data-ui="gallery.videoReview.motionBlurSettings"][data-phase="exit"]'
      );
      const assertPhaseBounds = async () => {
        for (const phase of [enter, exit]) {
          const frame = (await phase.locator('..').boundingBox())!;
          const toggle = (await phase.getByRole('switch').boundingBox())!;
          expect(toggle.x + toggle.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
        }
      };
      await assertPhaseBounds();
      await expect(enter.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
      await expect(exit.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
      await enter
        .getByRole('switch', { name: label('gallery.videoReview.motionBlur'), exact: true })
        .click();
      const strength = enter.getByRole('textbox', {
        name: label('gallery.videoReview.motionBlurStrength'),
        exact: true,
      });
      await strength.fill('20');
      await strength.press('Tab');
      await expect(strength).toHaveValue('20');
      await expect(exit.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
      await expect
        .poll(async () => (await persistedFocus(page))?.motionBlur?.enter?.strength)
        .toBe(0.2);
      await enter.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('blur-entrance.png'), fullPage: false });
      await exit.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('blur-exit.png'), fullPage: false });
      if (variant.width === 1920) {
        const scroll = dialog.locator('.review-inspector-scroll');
        const handle = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
        for (const width of [523, 524, 525]) {
          const contentWidth = () =>
            scroll.evaluate((node) => {
              const style = getComputedStyle(node);
              return (
                node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
              );
            });
          const currentWidth = await contentWidth();
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(
            box.x + box.width / 2 - (width - currentWidth),
            box.y + box.height / 2
          );
          await page.mouse.up();
          await expect.poll(contentWidth).toBe(width);
          await enter.scrollIntoViewIfNeeded();
          await expect(strength).toBeVisible();
          await assertPhaseBounds();
          await page.screenshot({
            path: info.outputPath(`blur-inspector-${width}.png`),
            fullPage: false,
          });
        }
      } else {
        await page.setViewportSize({ width: 1100, height: 560 });
        await enter.scrollIntoViewIfNeeded();
        await expect(strength).toBeVisible();
        await page.screenshot({ path: info.outputPath('blur-below-1280.png'), fullPage: false });
      }
      await page.reload();
      await expect(dialog).toBeVisible();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await expect(strength).toHaveValue('20');
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
