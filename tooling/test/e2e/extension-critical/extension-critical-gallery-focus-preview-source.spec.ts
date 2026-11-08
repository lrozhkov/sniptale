import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { enableGpuPreviewProof, installCameraFrameObserver } from '../support/gpu-preview-proof';
import { expect, test, type Locator } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import {
  addReviewFocus,
  seedReviewVideo,
  persistedFocus,
} from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { translate } from '../../../../apps/extension/src/platform/i18n';

enableGpuPreviewProof();

/** Compare the visible interior against the painted source, where focus controls and masks do not cover it. */
async function expectVisibleSource(preview: Locator) {
  await expect(preview).toHaveAttribute('data-status', 'ready');
  const canvas = preview.locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  await expect
    .poll(
      async () => {
        const screenshot = await canvas.screenshot();
        return canvas.evaluate(async (source: HTMLCanvasElement, encoded) => {
          const image = new Image();
          image.src = `data:image/png;base64,${encoded}`;
          await image.decode();
          const visible = document.createElement('canvas');
          visible.width = image.width;
          visible.height = image.height;
          const context = visible.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const original = source.getContext('2d')!;
          let error = 0,
            chroma = 0;
          for (const [x, y] of [
            [0.44, 0.44],
            [0.56, 0.44],
            [0.44, 0.56],
            [0.56, 0.56],
          ]) {
            const expected = original.getImageData(
              Math.floor(source.width * x!),
              Math.floor(source.height * y!),
              1,
              1
            ).data;
            const actual = context.getImageData(
              Math.floor(image.width * x!),
              Math.floor(image.height * y!),
              1,
              1
            ).data;
            chroma += Math.max(...expected.slice(0, 3)) - Math.min(...expected.slice(0, 3));
            for (let channel = 0; channel < 3; channel++)
              error += Math.abs(expected[channel]! - actual[channel]!);
          }
          return { paintedSource: chroma > 100, visibleSource: error / 12 < 20 };
        }, screenshot.toString('base64'));
      },
      { message: 'The painted video must remain visible above the scene background' }
    )
    .toEqual({ paintedSource: true, visibleSource: true });
}

/** Read only native timestamps attached to the currently published single-job inspector bitmap. */
async function currentInspectorFrame(canvas: Locator) {
  return canvas.evaluate((node: HTMLCanvasElement) => {
    const read: unknown = Reflect.get(window, 'sniptaleCurrentInspectorFrame');
    if (typeof read !== 'function') throw new Error('Inspector source observer is unavailable.');
    const value: unknown = Reflect.apply(read, undefined, [node]);
    if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value)))
      throw new Error('Inspector source timestamp is invalid.');
    return value;
  });
}

/** Independent packet timestamps choose the reference for the saved source interval. */
function sourceReferenceInterval(fixture: URL, target: number) {
  const value: unknown = JSON.parse(
    execFileSync(
      '/usr/bin/ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_packets',
        '-show_entries',
        'packet=pts_time',
        '-of',
        'json',
        fileURLToPath(fixture),
      ],
      { encoding: 'utf8', timeout: 10_000, maxBuffer: 128 * 1024 }
    )
  );
  if (!value || typeof value !== 'object') throw new Error('Reference timestamps are unavailable.');
  const packets: unknown = Reflect.get(value, 'packets');
  if (!Array.isArray(packets)) throw new Error('Reference packets are unavailable.');
  const times = packets
    .map((packet: unknown) => {
      if (!packet || typeof packet !== 'object') throw new Error('Reference packet is invalid.');
      const text: unknown = Reflect.get(packet, 'pts_time');
      if (typeof text !== 'string' || !/^[-+.0-9eE]+$/.test(text))
        throw new Error('Reference timestamp is invalid.');
      const time = Number(text);
      if (!Number.isFinite(time)) throw new Error('Reference timestamp is not finite.');
      return time;
    })
    .sort((a, b) => a - b);
  const index = times.findLastIndex((time) => time <= target);
  const timestamp = times[index],
    nextTimestamp = times[index + 1];
  if (timestamp === undefined || nextTimestamp === undefined)
    throw new Error('Reference interval is unavailable.');
  expect(target).toBeGreaterThanOrEqual(timestamp);
  expect(target).toBeLessThan(nextTimestamp);
  return { timestamp, nextTimestamp };
}

for (const theme of ['light', 'dark'] as const) {
  test(`Focus inspector source stays visible (${theme})`, async ({ page }, info) => {
    await page.addInitScript(installCameraFrameObserver);
    const host = await startHostServer();
    const dialog = page.locator('dialog');
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': theme },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await addReviewFocus(page);
      const preview = dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]');
      const types = dialog.locator('[data-ui="gallery.videoReview.focusType"]');
      for (const background of ['none', 'gradient'] as const) {
        if (background === 'gradient') {
          await button('gallery.videoReview.scene').click();
          await button('gallery.videoReview.backgroundSolid').click();
          const gradient = dialog
            .locator('[data-ui="gallery.videoReview.gradientPresets"] button[style*="gradient"]')
            .first();
          if (!(await gradient.isVisible()))
            await button('settings.editor.backgrounds.showMore').click();
          await gradient.click();
          await expect(gradient).toHaveAttribute('aria-pressed', 'true');
          const padding = dialog.getByRole('textbox', {
            name: label('gallery.videoReview.backgroundPadding'),
            exact: true,
          });
          await padding.fill('8');
          await padding.press('Enter');
          await dialog
            .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
            .first()
            .click();
        }
        for (const kind of ['zoomRegionLabel', 'focusBorder', 'focusSpotlight'] as const) {
          await types
            .getByRole('button', { name: label(`gallery.videoReview.${kind}`), exact: true })
            .click();
          await expectVisibleSource(preview);
          let pausedReference: number[][] | null = null;
          if (theme === 'light' && background === 'none' && kind === 'zoomRegionLabel') {
            const selected = await persistedFocus(page);
            if (!selected) throw new Error('Paused focus source selection was not saved.');
            const requestedSourceTime = (selected.start + selected.end) / 2;
            const fixture = new URL('../fixtures/review-vp8-opus.webm', import.meta.url);
            const interval = sourceReferenceInterval(fixture, requestedSourceTime);
            const decoded = execFileSync(
              '/usr/bin/ffmpeg',
              [
                '-v',
                'error',
                '-ss',
                String(interval.timestamp),
                '-i',
                fileURLToPath(fixture),
                '-frames:v',
                '1',
                '-f',
                'rawvideo',
                '-pix_fmt',
                'rgb24',
                'pipe:1',
              ],
              { timeout: 10_000, maxBuffer: 128 * 1024 }
            );
            expect(decoded.byteLength).toBe(160 * 90 * 3);
            const points = [
              [20, 70],
              [70, 80],
              [40, 82],
            ] as const;
            const expected = points.map(([x, y]) => [
              ...decoded.subarray((y * 160 + x) * 3, (y * 160 + x) * 3 + 3),
            ]);
            const canvas = preview.locator('canvas[data-review-camera-area]');
            const actual = await canvas.evaluate((node: HTMLCanvasElement, points) => {
              const context = node.getContext('2d');
              if (!context) throw new Error('Paused source readback is unavailable.');
              return {
                raster: { width: node.width, height: node.height },
                colors: points.map(([x, y]) =>
                  [
                    ...context.getImageData(
                      Math.floor((x / 160) * node.width),
                      Math.floor((y / 90) * node.height),
                      1,
                      1
                    ).data,
                  ].slice(0, 3)
                ),
              };
            }, points);
            pausedReference = expected;
            expect(
              Math.max(
                ...expected.flatMap((color, index) =>
                  color.map((value, channel) => Math.abs(value - actual.colors[index]![channel]!))
                )
              )
            ).toBeLessThan(4);
            await writeFile(
              info.outputPath('paused-focus-source-reference.json'),
              JSON.stringify(
                {
                  viewport: page.viewportSize(),
                  sourceSHA256: createHash('sha256')
                    .update(await readFile(fixture))
                    .digest('hex'),
                  requestedSourceTime,
                  sourceDimensions: { width: 160, height: 90 },
                  reference:
                    'Independent FFmpeg RGB decode at the packet PTS covering saved source time.',
                  referenceInterval: interval,
                  expected,
                  actual,
                  ptsEvidence:
                    'Controlled canonical provider/loader tests; browser checks corresponding source pixels.',
                },
                null,
                2
              )
            );
          }
          if (theme === 'light' && background === 'none' && kind === 'zoomRegionLabel') {
            const sourceCanvas = preview.locator('canvas').first();
            await button('gallery.videoReview.play').click();
            await button('gallery.videoReview.pause').waitFor();
            await dialog
              .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
              .first()
              .click();
            await expect(preview).toHaveAttribute('data-playing', 'true');
            const published = new Set<number>();
            await expect
              .poll(
                async () => {
                  const timestamp = await currentInspectorFrame(sourceCanvas);
                  if (typeof timestamp === 'number') published.add(timestamp);
                  return published.size;
                },
                {
                  message:
                    'Live focus inspector must publish distinct admitted native source frames',
                }
              )
              .toBeGreaterThan(1);
            await button('gallery.videoReview.pause').click();
            await dialog
              .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
              .first()
              .click();
            await expectVisibleSource(preview);
            await expect.poll(() => currentInspectorFrame(sourceCanvas)).toBe(null);
            if (!pausedReference) throw new Error('Paused reference colors are unavailable.');
            const reference = pausedReference;
            await expect
              .poll(
                async () => {
                  const colors = await sourceCanvas.evaluate((node: HTMLCanvasElement) => {
                    const context = node.getContext('2d');
                    if (!context) throw new Error('Restored source readback is unavailable.');
                    return [
                      [20, 70],
                      [70, 80],
                      [40, 82],
                    ].map(([x, y]) =>
                      [
                        ...context.getImageData(
                          Math.floor((x! / 160) * node.width),
                          Math.floor((y! / 90) * node.height),
                          1,
                          1
                        ).data,
                      ].slice(0, 3)
                    );
                  });
                  return Math.max(
                    ...reference.flatMap((color, index) =>
                      color.map((value, channel) => Math.abs(value - colors[index]![channel]!))
                    )
                  );
                },
                { message: 'Pause must restore the independently decoded selected source image' }
              )
              .toBeLessThan(4);

            await writeFile(
              info.outputPath('live-focus-native-source.json'),
              JSON.stringify(
                {
                  viewport: page.viewportSize(),
                  raster: await sourceCanvas.evaluate((node: HTMLCanvasElement) => ({
                    width: node.width,
                    height: node.height,
                  })),
                  publishedNativePTS: [...published],
                  pausedNativePTS: await currentInspectorFrame(sourceCanvas),
                  limitation:
                    'Single active inspector device. Native PTS prove content publication. Controlled consumer tests prove provider selection and source/result mapping. Canvas-only fallback is outside this observer.',
                },
                null,
                2
              )
            );
          }
          if (kind !== 'zoomRegionLabel') {
            await button('gallery.videoReview.play').click();
            await button('gallery.videoReview.pause').click();
            await dialog
              .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
              .first()
              .click();
            await expectVisibleSource(preview);
          }
          await page.screenshot({
            path: info.outputPath(`${background}-${kind}.png`),
            fullPage: false,
          });
        }
      }
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

// The short viewport checks interaction only; source/color coverage stays in the primary case.
test('Focus source restoration keeps gestures and Undo at 1280x560', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const host = await startHostServer();
  const dialog = page.locator('dialog');
  const button = (key: Parameters<typeof translate>[0]) =>
    dialog.getByRole('button', { name: translate(key, 'en'), exact: true });
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await button('gallery.videoReview.advancedEditing').click();
    await addReviewFocus(page);
    const preview = dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]');
    await expectVisibleSource(preview);
    await button('gallery.videoReview.play').click();
    await button('gallery.videoReview.pause').click();
    await dialog
      .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
      .first()
      .click();
    await expectVisibleSource(preview);
    const before = (await persistedFocus(page))!.transform;
    const frame = preview.locator('[data-focus-frame]');
    await frame.hover();
    const grip = frame.locator('[data-resize="se"]');
    const box = (await grip.boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 8, y - 5, { steps: 3 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect.poll(async () => (await persistedFocus(page))?.transform).toEqual(before);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 8, y - 5, { steps: 3 });
    await page.mouse.up();
    await expect
      .poll(async () => (await persistedFocus(page))?.transform.scale)
      .toBeGreaterThan(before.scale);
    await button('gallery.videoReview.undo').click();
    await expect.poll(async () => (await persistedFocus(page))?.transform).toEqual(before);
    await preview.locator('canvas').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await persistedFocus(page))?.transform.centerX)
      .toBeGreaterThan(before.centerX);
    await button('gallery.videoReview.undo').click();
    await expect.poll(async () => (await persistedFocus(page))?.transform).toEqual(before);
    await page.screenshot({
      path: info.outputPath('focus-restored-gestures-1280x560.png'),
      fullPage: false,
    });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

/** Read source interiors without requesting a context from the publication canvas. */
async function mainSourceColors(canvas: Locator) {
  return canvas.evaluate((node: HTMLCanvasElement) => {
    const copy = document.createElement('canvas');
    copy.width = node.width;
    copy.height = node.height;
    const context = copy.getContext('2d');
    if (!context) throw new Error('Main source readback is unavailable.');
    context.drawImage(node, 0, 0);
    return {
      raster: { width: node.width, height: node.height },
      colors: [
        [20, 70],
        [70, 80],
        [40, 82],
      ].map(([x, y]) =>
        [
          ...context.getImageData(
            Math.floor((x! / 160) * node.width),
            Math.floor((y! / 90) * node.height),
            1,
            1
          ).data,
        ].slice(0, 3)
      ),
    };
  });
}

test('Gallery Standard main keeps canonical source pixels across renderer and seek', async ({
  page,
}, info) => {
  const host = await startHostServer();
  const dialog = page.locator('dialog');
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
      .click();
    const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
    const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
    const clock = async () => Number(await plane.getAttribute('aria-valuenow'));
    const seek = async (time: number) => {
      const box = await ruler.boundingBox();
      if (!box) throw new Error('Source ruler is unavailable.');
      const duration = Number(await plane.getAttribute('aria-valuemax'));
      if (!Number.isFinite(duration) || duration <= 0)
        throw new Error('Source duration is invalid.');
      await ruler.click({ position: { x: (box.width * time) / duration, y: 8 } });
    };
    await seek(1.02);
    await expect.poll(clock).toBeGreaterThan(1);
    await expect.poll(clock).toBeLessThan(1.1);
    const target = await clock();
    const fixture = new URL('../fixtures/review-vp8-opus.webm', import.meta.url);
    const interval = sourceReferenceInterval(fixture, target);
    const reference = execFileSync(
      '/usr/bin/ffmpeg',
      [
        '-v',
        'error',
        '-ss',
        String(interval.timestamp),
        '-i',
        fileURLToPath(fixture),
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        'pipe:1',
      ],
      { timeout: 10_000, maxBuffer: 160 * 90 * 4 + 1024 }
    );
    expect(reference.length).toBe(160 * 90 * 4);
    const expected = [
      [20, 70],
      [70, 80],
      [40, 82],
    ].map(([x, y]) => [...reference.subarray((y! * 160 + x!) * 4, (y! * 160 + x!) * 4 + 3)]);
    const error = (colors: number[][]) =>
      Math.max(
        ...expected.flatMap((color, index) =>
          color.map((value, channel) => Math.abs(value - colors[index]![channel]!))
        )
      );
    const front = dialog.locator(
      '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
    );
    await expect.poll(async () => error((await mainSourceColors(front)).colors)).toBeLessThan(4);
    const gpu = await mainSourceColors(front);
    await seek(2.02);
    await expect.poll(clock).toBeGreaterThan(2);
    await expect
      .poll(async () => error((await mainSourceColors(front)).colors), {
        message:
          'A different source frame must replace the GPU reference before Standard is selected',
      })
      .toBeGreaterThan(4);
    await dialog.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
    const panel = dialog.locator('[data-ui="gallery.videoReview.previewInspector"]');
    await panel
      .getByRole('button', { name: label('editor.scene.previewRenderer'), exact: true })
      .click();
    await page
      .getByRole('option', { name: label('editor.scene.previewRendererLegacy'), exact: true })
      .click();
    await seek(1.02);
    await expect.poll(clock).toBeGreaterThan(1);
    await expect.poll(clock).toBeLessThan(1.1);
    await expect
      .poll(async () => error((await mainSourceColors(front)).colors), {
        message: 'Standard main must restore the independently decoded source image',
      })
      .toBeLessThan(4);
    const standard = await mainSourceColors(front);
    expect(standard.raster).toEqual(gpu.raster);
    await writeFile(
      info.outputPath('standard-main-source-reference.json'),
      JSON.stringify(
        {
          viewport: page.viewportSize(),
          source: { width: 160, height: 90 },
          sourceSHA256: createHash('sha256')
            .update(await readFile(fixture))
            .digest('hex'),
          requestedTime: target,
          standardRequestedTime: await clock(),
          referenceInterval: interval,
          reference:
            'Independent FFmpeg RGB at verified predecessor PTS, using established flat interior points.',
          expected,
          gpu,
          standard,
          maxRGBDifference: error(standard.colors),
        },
        null,
        2
      )
    );
    await page.screenshot({ path: info.outputPath('standard-main-source.png'), fullPage: false });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
