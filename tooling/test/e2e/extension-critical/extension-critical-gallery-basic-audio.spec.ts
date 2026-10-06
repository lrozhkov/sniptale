import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo, clickReviewExport } from '../support/quick-editor-media-fixture';

const bundle = () =>
  build({
    entryPoints: ['tooling/test/e2e/support/basic-audio-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
  });

test('Basic gain, cuts, speed and fragment preserve video packet payloads and audio clock', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    const built = await bundle();
    const encoded = (
      await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url))
    ).toString('base64');
    const results = await page.evaluate(
      async ({ text, encoded }) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          return (await import(url)).probe(encoded);
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      { text: built.outputFiles[0]!.text, encoded }
    );
    await writeFile(info.outputPath('audio-copy-metrics.json'), JSON.stringify(results, null, 2));
    for (const result of results) {
      expect(result.identical, result.name).toBe(true);
      expect(result.timestampError, result.name).toBeLessThan(0.002);
      expect(result.receipt.audioReencoded).toBe(true);
      expect(result.receipt.videoReencoded).not.toBe(true);
      expect(Math.abs(result.audioDuration - result.expectedDuration)).toBeLessThan(0.05);
      for (const sample of result.samples)
        expect(Math.abs(sample.ratio - sample.expected), result.name).toBeLessThan(0.03);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

for (const variant of [
  { locale: 'en', theme: 'light' },
  { locale: 'ru', theme: 'dark' },
  { locale: 'en', theme: 'light', viewport: { width: 1200, height: 560 } },
] as const) {
  test(`Basic source volume and ranges stay editable (${variant.locale}${'viewport' in variant ? ', narrow' : ''})`, async ({
    page,
  }, info) => {
    if ('viewport' in variant) await page.setViewportSize(variant.viewport);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      const video = dialog.locator('[data-ui="gallery.videoReview.stage"] video');
      const master = dialog.getByRole('textbox', {
        name: label('gallery.videoReview.sourceAudioVolume'),
        exact: true,
      });
      const original = dialog.locator('[data-original-audio-lane]');
      await expect(original).toBeVisible();
      await expect(button('gallery.videoReview.advancedEditing')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      await expect(button('gallery.videoReview.scene')).toHaveCount(0);
      await master.fill('50');
      await master.press('Enter');
      await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.volume)).toBe(0.5);
      await button('gallery.videoReview.undo').click();
      await expect(master).toHaveValue('100');
      await button('gallery.videoReview.redo').click();
      await expect(master).toHaveValue('50');
      await button('gallery.videoReview.originalAudioRange').click();
      await original.scrollIntoViewIfNeeded();
      const rect = (await original.boundingBox())!;
      await page.mouse.move(rect.x + rect.width * 0.25, rect.y + 16);
      await page.mouse.down();
      await page.mouse.move(rect.x + rect.width * 0.4, rect.y + 16, { steps: 4 });
      await page.mouse.up();
      const range = original.locator('[data-ui="gallery.videoReview.originalAudioRange"]');
      await expect(range).toHaveCount(1);
      const volume = dialog.getByRole('textbox', {
        name: label('gallery.videoReview.volume'),
        exact: true,
      });
      await expect(volume).toBeVisible();
      await expect.poll(async () => (await persistedSourceAudio(page))?.ranges?.length).toBe(1);
      const initialRangeVolume = await volume.inputValue();
      await volume.fill('0');
      await volume.press('Enter');
      await expect(range).toHaveAttribute('aria-pressed', 'true');
      await expect(button('gallery.videoReview.advancedEditing')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      await page.screenshot({ path: info.outputPath('basic-audio-range.png'), fullPage: false });
      await button('gallery.videoReview.undo').click();
      await expect(volume).toHaveValue(initialRangeVolume);
      await button('gallery.videoReview.redo').click();
      await expect(volume).toHaveValue('0');
      const download = page.waitForEvent('download');
      await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
      const output = (await readFile(await (await download).path())).toString('base64');
      const source = (
        await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url))
      ).toString('base64');
      const built = await bundle();
      const comparison = await page.evaluate(
        async ({ text, source, output }) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          try {
            const mod = await import(url);
            return { source: await mod.inspect(source), output: await mod.inspect(output) };
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { text: built.outputFiles[0]!.text, source, output }
      );
      expect(comparison.output.packets).toEqual(comparison.source.packets);
      expect(comparison.output.rms / comparison.source.rms).toBeCloseTo(0.5, 1);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(master).toHaveValue('50');
      await expect(range).toHaveCount(1);
      await range.click();
      await expect(volume).toHaveValue('0');
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

async function persistedWorkspace(page: Page) {
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
  return parseVideoWorkspace(raw);
}

async function persistedSourceAudio(page: Page) {
  const workspace = await persistedWorkspace(page);
  const latest = workspace?.history
    .slice(0, workspace.cursor)
    .findLast((operation) => operation.target === 'advancedContent');
  return latest?.target === 'advancedContent' ? latest.after.audio.original : undefined;
}

test('Basic video without source audio has no audio lane and disables the Volume tool', async ({
  page,
}) => {
  const host = await startHostServer();
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-cut-vfr.webm', { width: 160, height: 90, duration: 6 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    const dialog = page.locator('dialog');
    await expect(
      dialog.getByRole('button', {
        name: translate('gallery.videoReview.originalAudioRange', 'en'),
        exact: true,
      })
    ).toBeDisabled();
    await expect(dialog.locator('[data-original-audio-lane]')).toHaveCount(0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
