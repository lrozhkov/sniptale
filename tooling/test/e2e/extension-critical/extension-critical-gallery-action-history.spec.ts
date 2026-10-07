import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { translate, formatNumber } from '../../../../apps/extension/src/platform/i18n';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'en', theme: 'light', narrow: false },
  { locale: 'ru', theme: 'dark', narrow: false },
  { locale: 'en', theme: 'light', narrow: true },
] as const) {
  test(`action history rows stay stable through zoom (${variant.locale}, narrow=${variant.narrow})`, async ({
    page,
  }, info) => {
    if (variant.narrow) await page.setViewportSize({ width: 1200, height: 560 });
    const server = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      await seedHistory(page);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const markers = dialog.locator(
        `button[aria-label^="${label('gallery.videoReview.telemetry')} ·"]`
      );
      await expect(markers).toHaveCount(8);
      const strip = markers.first().locator('..');
      const rows = () =>
        markers.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).top));
      const initialRows = await rows();
      const height = (await strip.boundingBox())!.height;
      expect(height).toBe(68);
      await markers.first().click();
      await expect(markers.first()).toHaveAttribute('aria-pressed', 'true');
      const zoom = dialog.getByRole('slider', {
        name: label('videoEditor.timeline.zoom'),
        exact: true,
      });
      for (const value of ['0.1', '6.7', '19.3', '25', '41.7', '75', '100', '37.1', '0']) {
        await zoom.fill(value);
        await zoom.dispatchEvent('input');
        await expect.poll(rows).toEqual(initialRows);
        expect((await strip.boundingBox())!.height).toBe(height);
        await expect(markers.first()).toHaveAttribute('aria-pressed', 'true');
      }
      await zoom.fill('50');
      await zoom.dispatchEvent('input');
      const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
      await viewport.evaluate((node) => {
        node.scrollLeft = node.scrollWidth / 2;
      });
      await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      await page.screenshot({ path: info.outputPath('zoomed-history.png'), fullPage: false });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.fit'), exact: true })
        .click();
      await expect.poll(rows).toEqual(initialRows);
      // Dense tail stays keyboard/click reachable within its own scroll owner.
      const tail = markers.filter({ hasText: label('gallery.videoReview.eventClick') }).last();
      await tail.focus();
      await tail.press('Enter');
      await expect(tail).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => strip.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await strip.evaluate((node) => {
        node.scrollTop = 0;
      });
      await page.screenshot({ path: info.outputPath('fit-history.png'), fullPage: false });
      await expect(
        dialog.getByRole('button', { name: label('gallery.videoReview.back'), exact: true })
      ).toBeInViewport();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
  test(`manual click history editing and filter (${variant.locale}, narrow=${variant.narrow})`, async ({
    page,
  }, info) => {
    if (variant.narrow) await page.setViewportSize({ width: 1200, height: 560 });
    const server = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      await seedHistory(page, true);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.historyOpen'), exact: true })
        .click();
      const history = dialog.locator('[data-ui="gallery.videoReview.actionHistory"]');
      await expect(history.locator('li')).toHaveCount(10);
      const configure = history.getByRole('button', {
        name: label('gallery.videoReview.historyConfigure'),
        exact: true,
      });
      await expect(configure).toBeDisabled();
      const search = history.getByRole('searchbox');
      await expect(search).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(28);
      await search.focus();
      expect(await search.evaluate((node) => getComputedStyle(node, '::placeholder').color)).toBe(
        'rgba(0, 0, 0, 0)'
      );
      await search.fill('not found');
      await expect(history.locator('li')).toHaveCount(0);
      await expect(history.getByRole('checkbox')).toBeDisabled();
      await history
        .getByRole('button', { name: label('gallery.videoReview.historySearchClear'), exact: true })
        .click();
      await expect(search).toBeFocused();
      await expect(history.locator('li')).toHaveCount(10);
      await history.locator('li input[type="checkbox"]').first().check();
      const master = history.getByRole('checkbox', {
        name: label('gallery.videoReview.historySelectAll'),
        exact: true,
      });
      await expect(master).toBeChecked({ indeterminate: true });
      await search.fill(label('gallery.videoReview.eventCursorIdle'));
      await expect(history.locator('li')).toHaveCount(2);
      await expect(history).toContainText(label('gallery.videoReview.historyHiddenSelected'));
      await configure.click();
      await expect(history.locator('ol')).toHaveCount(0);
      await history
        .getByRole('button', { name: label('gallery.videoReview.historyBack'), exact: true })
        .click();
      await expect(search).toHaveValue(label('gallery.videoReview.eventCursorIdle'));
      await expect(configure).toBeFocused();
      await history
        .getByRole('button', { name: label('gallery.videoReview.historySearchClear'), exact: true })
        .click();
      await page.screenshot({
        path: info.outputPath('history-list-selection.png'),
        fullPage: false,
      });
      const filters = history.locator('details').filter({
        has: page.getByText(label('gallery.videoReview.historyFilters'), { exact: true }),
      });
      await filters.locator('summary').click();
      const selectType = async (key: Parameters<typeof translate>[0]) => {
        await history
          .getByRole('button', { name: label('gallery.videoReview.historyType'), exact: true })
          .click();
        await page.getByRole('option', { name: label(key), exact: true }).click();
      };
      await selectType('gallery.videoReview.eventStatic');
      await expect(history.locator('li')).toHaveCount(1);
      const longer = history.getByRole('textbox', {
        name: label('gallery.videoReview.historyLonger'),
        exact: true,
      });
      await longer.fill('2');
      await longer.press('Enter');
      await expect(history.locator('li')).toHaveCount(0);
      await selectType('gallery.videoReview.eventTyping');
      await longer.fill('5');
      await longer.press('Enter');
      await expect(history.locator('li')).toHaveCount(1);
      await expect(history.locator('li')).toContainText('Search field');
      await expect(history.locator('li')).toContainText(
        label('gallery.videoReview.intervalSeconds').replace(
          '{value}',
          formatNumber(5.51, { maximumFractionDigits: 2 }, variant.locale)
        )
      );
      await history.locator('li').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('history-typing-filter.png'),
        fullPage: false,
      });
      await longer.fill('0');
      await longer.press('Enter');
      await selectType('gallery.videoReview.historyAll');
      await filters.locator('summary').click();
      await search.fill('Save recording');
      await expect(history.locator('li')).toHaveCount(6);
      await history
        .getByRole('button', { name: label('gallery.videoReview.historySearchClear'), exact: true })
        .click();
      await history
        .getByRole('checkbox', { name: label('gallery.videoReview.historySelectAll'), exact: true })
        .click();
      const listScroll = await history.evaluate((node) => {
        const scroll = node.closest('.review-inspector-scroll')!;
        scroll.scrollTop = 24;
        return scroll.scrollTop;
      });
      await configure.click();
      await history
        .getByRole('button', { name: label('gallery.videoReview.clickEffect'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.click_ripple'), exact: true })
        .click();
      await expect(history).toBeVisible();
      const animated = dialog.locator('button[data-animated="true"]');
      await expect(animated).toHaveCount(6);
      await verifyClickFields(history, page, info.outputPath('batch-click-fields.png'));
      await dialog
        .getByRole('button', {
          name: label('gallery.videoReview.historyAnimatedOnly'),
          exact: true,
        })
        .click();
      await expect(dialog.locator('button[data-animated]')).toHaveCount(6);
      await history
        .getByRole('button', { name: label('gallery.videoReview.clickReset'), exact: true })
        .click();
      await expect(animated).toHaveCount(0);
      await expect(
        dialog.getByRole('button', {
          name: label('gallery.videoReview.historyAnimatedOnly'),
          exact: true,
        })
      ).toBeVisible();
      await history
        .getByRole('button', { name: label('gallery.videoReview.clickEffect'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.click_press'), exact: true })
        .click();
      await expect(animated).toHaveCount(6);
      await history
        .getByRole('button', { name: label('gallery.videoReview.historyBack'), exact: true })
        .click();
      await expect
        .poll(() => history.evaluate((node) => node.closest('.review-inspector-scroll')!.scrollTop))
        .toBe(listScroll);
      await history
        .getByRole('button', { name: label('gallery.videoReview.historyClear'), exact: true })
        .click();
      await animated.first().click();
      const properties = dialog.locator('[data-ui="gallery.videoReview.actionProperties"]');
      await expect(properties.locator('[data-ui="gallery.videoReview.clickFields"]')).toBeVisible();
      await expect(
        properties.getByRole('button', {
          name: label('gallery.videoReview.actionFocus'),
          exact: true,
        })
      ).toHaveCount(0);
      await expect(dialog.locator('[data-ui="gallery.videoReview.clickAnimation"]')).toBeVisible();
      await verifyClickFields(properties, page, info.outputPath('click-properties.png'));
      if (variant.locale === 'en' && !variant.narrow)
        await verifyClickExport(page, info.outputPath('click-export.webm'));

      await properties
        .getByRole('button', { name: label('gallery.videoReview.historyOpen'), exact: true })
        .click();
      await page.screenshot({ path: info.outputPath('click-history.png'), fullPage: false });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.back'), exact: true })
        .click();
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(page.locator('button[data-animated="true"]')).toHaveCount(6);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

async function seedHistory(page: Page, detailed = false) {
  await page.evaluate(
    async ({ fixture, detailed }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(fixture.databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction('recording_telemetry', 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      transaction.objectStore('recording_telemetry').put({
        recordingId: fixture.records.recordings[0].id,
        captureMode: 'TAB',
        createdAt: 1,
        updatedAt: 1,
        viewport: null,
        cursorTrack: null,
        signals: [
          ...[
            [0.13, 3.27],
            [3.27, 6.41],
          ].map(([startTime, endTime], index) => ({
            id: `idle-${index}`,
            kind: 'cursor-idle',
            startTime,
            endTime,
            point: null,
            data: {},
          })),
          ...(detailed
            ? [
                {
                  id: 'static',
                  kind: 'static-frame',
                  startTime: 7,
                  endTime: 9,
                  point: null,
                  data: {},
                },
                {
                  id: 'typing',
                  kind: 'typing',
                  startTime: 6.5,
                  endTime: 12.01,
                  point: null,
                  data: { targetName: 'Search field' },
                },
              ]
            : []),
        ],
        actionEvents: Array.from({ length: 6 }, (_, index) => ({
          id: `click-${index}`,
          kind: 'CLICK',
          time: 1 + index * 0.01,
          duration: 0,
          point: { x: 40, y: 30 },
          recordingPoint: { x: 0.25, y: 0.33 },
          label: detailed ? 'Save recording' : '',
          data: {},
          preset: 'NONE',
        })),
      });
      await done;
      db.close();
    },
    { fixture: betaV1Fixture, detailed }
  );
}

async function verifyClickExport(page: Page, path: string) {
  const expected = await page.evaluate(() => {
    const overlay = document.querySelector<HTMLCanvasElement>(
      '[data-ui="gallery.videoReview.clickAnimation"]'
    )!;
    const video = document.querySelector<HTMLVideoElement>('dialog video')!;
    const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
    const context = canvas.getContext('2d')!;
    context.drawImage(video, 0, 0, 160, 90);
    context.drawImage(overlay, 0, 0, 160, 90);
    return Array.from(context.getImageData(40, 30, 1, 1).data);
  });
  const dialog = page.locator('dialog');
  await dialog
    .getByRole('button', {
      name: translate('gallery.videoReview.exportSection', 'en'),
      exact: true,
    })
    .click();
  const downloading = page.waitForEvent('download');
  await dialog
    .getByRole('button', {
      name: translate('gallery.videoReview.downloadVideo', 'en'),
      exact: true,
    })
    .click();
  const download = await downloading;
  await download.saveAs(path);
  const bytes = await readFile(path);
  const actual = await page.evaluate(async (base64) => {
    const video = document.createElement('video');
    video.src = `data:video/webm;base64,${base64}`;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('decode failed'));
    });
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = 1;
    });
    const canvas = Object.assign(document.createElement('canvas'), {
      width: video.videoWidth,
      height: video.videoHeight,
    });
    const context = canvas.getContext('2d')!;
    context.drawImage(video, 0, 0);
    return Array.from(
      context.getImageData(Math.floor(canvas.width * 0.25), Math.floor(canvas.height * 0.33), 1, 1)
        .data
    );
  }, bytes.toString('base64'));
  for (let channel = 0; channel < 3; channel++)
    expect(Math.abs(actual[channel]! - expected[channel]!)).toBeLessThan(25);
  await dialog.locator('button[data-animated="true"]').first().click();
}

/** Open the actual inspector disclosures; closed summaries cannot prove field design. */
async function verifyClickFields(owner: Locator, page: Page, screenshot: string) {
  const fields = owner.locator('[data-ui="gallery.videoReview.clickFields"]');
  for (const disclosure of await fields.locator('details').all()) {
    if (!(await disclosure.evaluate((node) => (node as HTMLDetailsElement).open)))
      await disclosure.locator('summary').click();
  }
  const rows = fields.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]');
  await expect(rows).toHaveCount(9);
  await rows.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshot, fullPage: false });
  for (const row of await rows.all()) {
    const metrics = await row.evaluate((node) => {
      const css = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      const input = node.querySelector('input')!.getBoundingClientRect();
      return {
        height: box.height,
        border: css.borderTopWidth,
        background: css.backgroundColor,
        contained: input.left >= box.left && input.right <= box.right,
      };
    });
    expect(metrics).toEqual({
      height: 36,
      border: '0px',
      background: 'rgba(0, 0, 0, 0)',
      contained: true,
    });
  }
  await expect(fields.locator('input[type="range"]')).toHaveCount(9);
  const radiusRow = rows.first();
  const radiusInput = radiusRow.getByRole('textbox');
  const originalRadius = await radiusInput.inputValue();
  await radiusRow.hover();
  const radiusRange = radiusRow.locator('input[type="range"]');
  await expect(radiusRange).toHaveAttribute('max', '80');
  const box = (await radiusRange.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(Number.parseFloat(await radiusInput.inputValue())).toBeGreaterThan(40);
  await radiusInput.click();
  await radiusInput.fill('150');
  await radiusInput.press('Enter');
  await expect(radiusInput).toHaveValue('150');
  const dialog = page.locator('dialog');
  await expect(dialog).toHaveAttribute('data-playback-focus', 'true');
  await expect(fields.locator('input:focus')).toHaveCount(0);
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog).not.toHaveAttribute('data-playback-focus');
  await radiusInput.click();
  await radiusInput.fill(originalRadius);
  await radiusInput.press('Enter');
  await radiusRow.hover();
  await page.screenshot({ path: screenshot.replace('.png', '-slider.png'), fullPage: false });
  const last = rows.last().getByRole('textbox');
  await last.scrollIntoViewIfNeeded();
  await last.focus();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await last.press('Escape');
  await rows.first().scrollIntoViewIfNeeded();
}
