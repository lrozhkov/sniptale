import { readFile } from 'node:fs/promises';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { translate, formatNumber } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import {
  seedReviewVideo,
  seedReviewHistory as seedHistory,
  expectAnimatedReviewHistory as expectAnimatedHistory,
} from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`single recorded signal fills the inspector ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
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
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      const signal = dialog
        .getByRole('button', {
          name: new RegExp(label('gallery.videoReview.eventCursorIdle')),
        })
        .first();
      await signal.focus();
      await signal.press('Enter');
      const properties = dialog.locator('[data-ui="gallery.videoReview.actionProperties"]');
      await expect(properties).toBeVisible();
      const all = dialog.getByRole('button', {
        name: label('scenario.editor.inspectorShowAll'),
        exact: true,
      });
      if (await all.isVisible()) await all.click();
      const scroll = dialog.locator('.review-inspector-scroll');
      const resize = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
      const width = () =>
        scroll.evaluate((node) => {
          const css = getComputedStyle(node);
          return node.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
        });
      for (const target of [523, 524, 525]) {
        const current = await width();
        const handle = (await resize.boundingBox())!;
        await page.mouse.move(handle.x + handle.width / 2, handle.y + 12);
        await page.mouse.down();
        await page.mouse.move(handle.x + handle.width / 2 + current - target, handle.y + 12);
        await page.mouse.up();
        await expect.poll(width).toBe(target);
        const sections = properties.locator('[data-ui="gallery.videoReview.inspectorSections"]');
        const facts = sections.locator('[data-section="information"]');
        const actions = sections.locator('[data-section="actions"]');
        await expect(facts).toHaveCount(1);
        await expect(actions).toHaveCount(1);
        const owner = (await sections.boundingBox())!;
        const first = (await facts.boundingBox())!;
        const last = (await actions.boundingBox())!;
        expect(
          Math.abs(first.width - owner.width),
          'one parameter group must use the full width'
        ).toBeLessThanOrEqual(0.5);
        expect(Math.abs(last.x - first.x)).toBeLessThanOrEqual(0.5);
        expect(last.y).toBeGreaterThanOrEqual(first.y + first.height);
      }
      await scroll.evaluate((node) => {
        node.scrollTop = 0;
      });
      await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBe(0);
      await page.screenshot({ path: info.outputPath('recorded-signal-top.png'), fullPage: false });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { locale: 'en', theme: 'light', narrow: false },
  { locale: 'ru', theme: 'dark', narrow: false },
  { locale: 'en', theme: 'light', narrow: true },
] as const) {
  test(`action history rows stay stable through zoom (${variant.locale}, narrow=${variant.narrow})`, async ({
    page,
  }, info) => {
    await page.setViewportSize(
      variant.narrow
        ? { width: 1200, height: 560 }
        : variant.locale === 'ru'
          ? { width: 1280, height: 560 }
          : { width: 1920, height: 900 }
    );
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
      await seedReadableKeyboardHistory(page);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const markers = dialog.locator(
        `button[aria-label^="${label('gallery.videoReview.telemetry')} ·"]`
      );
      const strip = dialog.locator('[data-ui="gallery.videoReview.historyStrip"]');
      const cluster = strip.locator(
        '[data-history-family="mouse"] [data-ui="gallery.videoReview.historyCluster"] button'
      );
      const keyboardCluster = strip.locator(
        '[data-history-family="keyboard"] [data-ui="gallery.videoReview.historyCluster"] button'
      );
      await expect(keyboardCluster).toHaveCount(1);
      await revealHistoryRows(dialog);
      await keyboardCluster.click();
      await expect(page.getByRole('option')).toHaveCount(2);
      await page.getByRole('option').last().click();
      await expect(keyboardCluster).toHaveAttribute('aria-pressed', 'true');
      await expect(cluster).toHaveCount(1);
      const height = (await strip.boundingBox())!.height;
      expect(height).toBe(68);
      await cluster.click();
      const options = page.getByRole('listbox').getByRole('option');
      await expect(options).toHaveCount(6);
      await options.last().click();
      await expect(cluster).toHaveAttribute('aria-pressed', 'true');
      await revealHistoryRows(dialog);
      await page.screenshot({ path: info.outputPath('fit-history.png'), fullPage: false });
      const zoom = dialog.getByRole('slider', {
        name: label('videoEditor.timeline.zoom'),
        exact: true,
      });
      await zoom.fill('100');
      await zoom.dispatchEvent('input');
      await expect(cluster).toHaveCount(0);
      await expect(markers).toHaveCount(13);
      const command = strip
        .locator('[data-history-family="keyboard"] > button')
        .filter({ hasText: 'Ctrl+K' });
      await command.focus();
      await command.press('Enter');
      await expect(command).toHaveAttribute('aria-pressed', 'true');
      await expect(command.locator('[data-label-part="value"]')).toBeVisible();
      expect((await strip.boundingBox())!.height).toBe(height);
      expect(await strip.evaluate((node) => node.scrollHeight)).toBe(68);
      const tail = markers.filter({ hasText: label('gallery.videoReview.eventClick') }).last();
      await tail.focus();
      await tail.press('Enter');
      await expect(tail).toHaveAttribute('aria-pressed', 'true');
      await revealHistoryRows(dialog);
      await page.screenshot({ path: info.outputPath('zoomed-history.png'), fullPage: false });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.fit'), exact: true })
        .click();
      await expect(cluster).toHaveCount(1);
      expect((await strip.boundingBox())!.height).toBe(height);
      await expect(cluster).toHaveAttribute('aria-pressed', 'true');
      await cluster.focus();
      await cluster.press('Enter');
      await expect(page.getByRole('option')).toHaveCount(6);
      await revealHistoryRows(dialog);
      await page.screenshot({ path: info.outputPath('history-group-menu.png'), fullPage: false });
      await page.keyboard.press('Escape');
      if (variant.narrow) {
        const horizontal = dialog.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        expect(await horizontal.evaluate((node) => node.scrollWidth)).toBeGreaterThan(
          await horizontal.evaluate((node) => node.clientWidth)
        );
        await horizontal.evaluate((node) => {
          node.scrollLeft = node.scrollWidth - node.clientWidth;
        });
        await expect.poll(() => horizontal.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('history-horizontal-scroll.png'),
          fullPage: false,
        });
      }
      await expect(
        dialog.getByRole('button', { name: label('common.actions.close'), exact: true })
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
    await page.setViewportSize(
      variant.narrow
        ? { width: 1200, height: 560 }
        : variant.locale === 'ru'
          ? { width: 1280, height: 560 }
          : { width: 1920, height: 900 }
    );
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
      const { configure, search } = await verifyHistorySearchSelection(
        history,
        page,
        variant.locale,
        info.outputPath('history-list-selection.png')
      );
      const filters = history.getByRole('button', {
        name: label('gallery.videoReview.historyFilters'),
        exact: true,
      });
      await filters.click();
      const selectType = async (key: Parameters<typeof translate>[0]) => {
        await history
          .getByRole('button', { name: label('gallery.videoReview.historyType'), exact: true })
          .click();
        await page.getByRole('option', { name: label(key), exact: true }).click();
      };
      await selectType('gallery.videoReview.eventTyping');
      const longer = history.getByRole('textbox', {
        name: label('gallery.videoReview.historyLonger'),
        exact: true,
      });
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
      await filters.click();
      await search.fill('Save recording');
      await expect(history.locator('li')).toHaveCount(6);
      await history
        .getByRole('button', { name: label('gallery.videoReview.historySearchClear'), exact: true })
        .click();
      await history
        .getByRole('checkbox', { name: label('gallery.videoReview.historySelectAll'), exact: true })
        .click();
      const toolbarY = (await search.boundingBox())!.y;
      const listScroll = await history.evaluate((node) => {
        const scroll = node.querySelector('[data-ui="gallery.videoReview.historyResults"]')!;
        scroll.scrollTop = 24;
        return scroll.scrollTop;
      });
      expect((await search.boundingBox())!.y).toBe(toolbarY);
      await configure.click();
      await history
        .getByRole('button', { name: label('gallery.videoReview.clickEffect'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.click_ripple'), exact: true })
        .click();
      await expect(history).toBeVisible();
      const animated = dialog.locator('button[data-animated="true"]');
      await expectAnimatedHistory(page, 6);
      await verifyClickFields(history, page, info.outputPath('batch-click-fields.png'));
      await dialog
        .getByRole('button', {
          name: label('gallery.videoReview.historyAnimatedOnly'),
          exact: true,
        })
        .click();
      await expectAnimatedHistory(page, 6);
      expect(await dialog.locator('button[data-animated]').count()).toBeLessThanOrEqual(3);
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
      await expectAnimatedHistory(page, 6);
      await history
        .getByRole('button', { name: label('gallery.videoReview.historyBack'), exact: true })
        .click();
      await expect
        .poll(() =>
          history.evaluate(
            (node) =>
              node.querySelector('[data-ui="gallery.videoReview.historyResults"]')!.scrollTop
          )
        )
        .toBe(listScroll);
      await history
        .getByRole('button', { name: label('gallery.videoReview.historyClear'), exact: true })
        .click();
      await animated.first().click();
      const cluster = page.getByRole('listbox');
      if (await cluster.isVisible()) await cluster.getByRole('option').first().click();
      const properties = dialog.locator('[data-ui="gallery.videoReview.actionProperties"]');
      await expect(properties.locator('[data-ui="gallery.videoReview.clickFields"]')).toBeVisible();
      await verifyActionSections(
        dialog,
        properties,
        page,
        variant.locale,
        info.outputPath('action-sections.png'),
        !variant.narrow
      );
      await expect(
        properties.getByRole('button', {
          name: label('gallery.videoReview.actionFocus'),
          exact: true,
        })
      ).toHaveCount(0);
      await expect(dialog.locator('[data-ui="gallery.videoReview.clickAnimation"]')).toBeVisible();
      await page.screenshot({ path: info.outputPath('click-properties-top.png'), fullPage: false });
      await verifyClickFields(properties, page, info.outputPath('click-properties.png'));
      if (variant.locale === 'en' && !variant.narrow)
        await verifyClickExport(page, info.outputPath('click-export.webm'));

      await verifyClickTiming(page, dialog, properties, variant.locale);
      await expect(
        properties.getByRole('button', {
          name: label('gallery.videoReview.historyBack'),
          exact: true,
        })
      ).toHaveCount(0);
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.historyOpen'), exact: true })
        .click();
      await history.getByRole('searchbox').fill('Save recording');
      const savedQuery = await history.getByRole('searchbox').inputValue();
      await history.locator('li button').first().click();
      await properties
        .getByRole('button', { name: label('gallery.videoReview.historyBack'), exact: true })
        .click();
      await expect(history.getByRole('searchbox')).toHaveValue(savedQuery);
      await expect(history.locator('li')).toHaveCount(6);
      await page.screenshot({ path: info.outputPath('click-history.png'), fullPage: false });
      await dialog
        .getByRole('button', { name: label('common.actions.close'), exact: true })
        .click();
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expectAnimatedHistory(page, 6);
      await seedHistory(page, true, 60);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.historyOpen'), exact: true })
        .click();
      await history.getByRole('searchbox').fill('Save recording');
      await expect(history.locator('li')).toHaveCount(50);
      await history
        .getByRole('button', { name: label('gallery.videoReview.historyMore'), exact: true })
        .click();
      await expect(history.locator('li')).toHaveCount(60);
      const results = history.locator('[data-ui="gallery.videoReview.historyResults"]');
      await history.locator('li button').nth(55).scrollIntoViewIfNeeded();
      const savedScroll = await results.evaluate((node) => node.scrollTop);
      expect(savedScroll).toBeGreaterThan(0);
      await history.locator('li button').nth(55).click();
      await properties
        .getByRole('button', { name: label('gallery.videoReview.historyBack'), exact: true })
        .click();
      await expect(history.getByRole('searchbox')).toHaveValue('Save recording');
      await expect(history.locator('li')).toHaveCount(60);
      await expect.poll(() => results.evaluate((node) => node.scrollTop)).toBe(savedScroll);
      await page.screenshot({ path: info.outputPath('history-restored.png'), fullPage: false });
      if (variant.locale === 'en' && !variant.narrow) {
        const inspector = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
        const resize = inspector.getByRole('separator');
        const contentWidth = () =>
          inspector.evaluate((node) => {
            const style = getComputedStyle(node);
            return (
              node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            );
          });
        for (const width of [523, 524, 525]) {
          const current = await contentWidth();
          const handle = (await resize.boundingBox())!;
          const x = handle.x + handle.width / 2,
            y = handle.y + handle.height / 2;
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + current - width, y);
          await page.mouse.up();
          await expect.poll(contentWidth).toBe(width);
          await expect(history.getByRole('searchbox')).toBeInViewport();
          expect((await results.boundingBox())!.height).toBeGreaterThan(50);
          await page.screenshot({
            path: info.outputPath(`history-width-${width}.png`),
            fullPage: false,
          });
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

/** Count represented animated identities, including members behind a compact group. */
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
  const cluster = page.getByRole('listbox');
  if (await cluster.isVisible()) await cluster.getByRole('option').first().click();
}

/** Search, empty recovery, hidden selection and return navigation use the persistent list owner. */
async function verifyHistorySearchSelection(
  history: Locator,
  page: Page,
  locale: 'en' | 'ru',
  screenshot: string
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  await expect(history.locator('li')).toHaveCount(9);
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
  await expect(history.locator('li')).toHaveCount(9);
  const filterToggle = history.getByRole('button', {
    name: label('gallery.videoReview.historyFilters'),
    exact: true,
  });
  await expect(filterToggle).not.toHaveAttribute('data-active', 'true');
  await expect(filterToggle.locator('.review-history-filter-dot')).toHaveCount(0);
  await filterToggle.click();
  await expect(filterToggle).toHaveAttribute('data-active', 'true');
  await expect(filterToggle.locator('.review-history-filter-dot')).toHaveCount(0);
  await history
    .getByRole('button', { name: label('gallery.videoReview.historyStatus'), exact: true })
    .click();
  await page
    .getByRole('option', {
      name: label('gallery.videoReview.historySelectedOnly'),
      exact: true,
    })
    .click();
  await expect(history.locator('li')).toHaveCount(0);
  await expect(filterToggle).toHaveAttribute('data-active', 'true');
  await expect(filterToggle.locator('.review-history-filter-dot')).toBeVisible();
  await filterToggle.click();
  await expect(filterToggle).not.toHaveAttribute('data-active', 'true');
  await expect(filterToggle.locator('.review-history-filter-dot')).toBeVisible();
  await filterToggle.click();
  await expect(search).toBeVisible();
  await history
    .getByRole('button', { name: label('gallery.videoReview.historyStatus'), exact: true })
    .click();
  await page
    .getByRole('option', { name: label('gallery.videoReview.historyAll'), exact: true })
    .click();
  await expect(history.locator('li')).toHaveCount(9);
  await expect(filterToggle).toHaveAttribute('data-active', 'true');
  await expect(filterToggle.locator('.review-history-filter-dot')).toHaveCount(0);
  await filterToggle.click();
  await history.locator('li input[type="checkbox"]').first().check();
  const master = history.getByRole('checkbox', {
    name: label('gallery.videoReview.historySelectAll'),
    exact: true,
  });
  await expect(master).toBeChecked({ indeterminate: true });
  await search.fill(label('gallery.videoReview.eventCursorIdle'));
  await expect(filterToggle.locator('.review-history-filter-dot')).toBeVisible();
  await expect(filterToggle).not.toHaveAttribute('data-active', 'true');
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
    path: screenshot,
    fullPage: false,
  });
  return { configure, search };
}

/** Exercise the actual inspector owner, immutable facts and adaptive section width. */
async function verifyActionSections(
  dialog: Locator,
  owner: Locator,
  page: Page,
  locale: 'en' | 'ru',
  screenshot: string,
  expand: boolean
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const sections = owner.locator('[data-ui="gallery.videoReview.inspectorSections"]');
  const info = owner.locator('[data-section="information"]');
  await expect(info.locator('dl')).toBeVisible();
  await expect(info.locator('input,select,textarea')).toHaveCount(0);
  await dialog
    .getByRole('button', { name: label('scenario.editor.inspectorShowSections'), exact: true })
    .click();
  await expect(sections).toHaveAttribute('data-presentation', 'sections');
  await expect(info.locator('dl')).toBeVisible();
  await expect(owner.locator('[data-ui="gallery.videoReview.inspectorCategories"]')).toHaveCount(1);
  await page.screenshot({ path: screenshot, fullPage: false });
  await dialog
    .getByRole('button', { name: label('scenario.editor.inspectorShowAll'), exact: true })
    .click();
  if (expand) {
    const handle = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
    const scroll = dialog.locator('.review-inspector-scroll');
    const width = () =>
      scroll.evaluate((node) => {
        const css = getComputedStyle(node);
        return node.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      });
    for (const target of [523, 524, 525]) {
      for (let attempt = 0; attempt < 3 && Math.abs((await width()) - target) > 0.5; attempt++) {
        const current = await width();
        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + current - target, box.y + 20, { steps: 4 });
        await page.mouse.up();
      }
      await expect.poll(width).toBe(target);
      await expect(sections).toHaveCSS('display', target < 524 ? 'block' : 'grid');
      expect(
        await owner.evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: screenshot.replace('.png', `-${target}.png`),
        fullPage: false,
      });
    }
  }
}

/** Open the actual inspector disclosures; closed summaries cannot prove field design. */
async function verifyClickFields(owner: Locator, page: Page, screenshot: string) {
  const fields = owner.locator('[data-ui="gallery.videoReview.clickFields"]');
  for (const disclosure of await fields.locator('details').all()) {
    if (!(await disclosure.evaluate((node) => (node as HTMLDetailsElement).open)))
      await disclosure.locator('summary').click();
  }
  const numericRows = fields.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]');
  const rows = numericRows.filter({ has: page.locator('input[type="range"]') });
  const expectedRows = (await fields
    .getByRole('textbox', { name: /Stroke|Толщина/, exact: false })
    .count())
    ? 8
    : 7;
  await expect(rows).toHaveCount(expectedRows);
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
  await expect(fields.locator('input[type="range"]')).toHaveCount(expectedRows);
  const radiusRow = rows.first();
  const radiusInput = radiusRow.getByRole('textbox');
  const originalRadius = await radiusInput.inputValue();
  const radiusRange = radiusRow.locator('input[type="range"]');
  await radiusRange.scrollIntoViewIfNeeded();
  await radiusRow.hover();
  await expect(radiusRange).toHaveAttribute('max', '80');
  const box = (await radiusRange.boundingBox())!;
  expect(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('type'), {
      x: box.x + box.width * 0.4,
      y: box.y + box.height / 2,
    })
  ).toBe('range');
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
  const last = numericRows.last().getByRole('textbox');
  await last.scrollIntoViewIfNeeded();
  await last.focus();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await last.press('Escape');
  await rows.first().scrollIntoViewIfNeeded();
}

for (const variant of [
  { locale: 'en', theme: 'light', width: 1920, height: 900 },
  { locale: 'ru', theme: 'dark', width: 1280, height: 560 },
  { locale: 'en', theme: 'light', width: 1200, height: 560 },
] as const) {
  test(`history element facets and active row (${variant.locale}/${variant.width})`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      await seedHistory(page, true, 60);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.historyOpen'), exact: true })
        .click();
      const history = dialog.locator('[data-ui="gallery.videoReview.actionHistory"]');
      const filter = history.getByRole('button', {
        name: label('gallery.videoReview.historyFilters'),
        exact: true,
      });
      await filter.click();
      const select = async (key: Parameters<typeof translate>[0], option: string) => {
        await history.getByRole('button', { name: label(key), exact: true }).click();
        await page.getByRole('option', { name: option, exact: true }).click();
      };
      await select('gallery.videoReview.historyElement', 'Save recording');
      await expect(
        history.getByRole('textbox', {
          name: label('gallery.videoReview.historyLonger'),
          exact: true,
        })
      ).toHaveCount(0);
      await expect(filter).toHaveAttribute('data-active', 'true');
      await select('gallery.videoReview.historyElement', label('gallery.videoReview.targetAll'));
      await expect(
        history.getByRole('textbox', {
          name: label('gallery.videoReview.historyLonger'),
          exact: true,
        })
      ).toBeVisible();
      await filter.click();
      await history.getByRole('searchbox').fill('Save recording');
      const more = history.getByRole('button', {
        name: label('gallery.videoReview.historyMore'),
        exact: true,
      });
      await more.scrollIntoViewIfNeeded();
      await more.hover();
      await expect(more).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await more.click();
      await expect(history.locator('li')).toHaveCount(60);
      const row = history.locator('li').nth(55);
      await row.scrollIntoViewIfNeeded();
      await page.mouse.move(5, 5);
      const resting = await row.evaluate((node) => getComputedStyle(node).backgroundColor);
      await row.hover();
      expect(await row.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(
        resting
      );
      const target = row.locator('.review-history-target');
      const normalColor = await target.evaluate((node) => getComputedStyle(node).color);
      const results = history.locator('[data-ui="gallery.videoReview.historyResults"]');
      const top = await results.evaluate((node) => node.scrollTop);
      await row.locator('button').click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.historyBack'), exact: true })
        .click();
      await expect(row).toHaveAttribute('data-active', 'true');
      expect(await target.evaluate((node) => getComputedStyle(node).color)).toBe(normalColor);
      await page.mouse.move(5, 5);
      const activeSurface = await row.evaluate((node) => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--sniptale-color-surface-hover)';
        node.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { expected, actual: getComputedStyle(node).backgroundColor };
      });
      expect(activeSurface.actual).toBe(activeSurface.expected);
      await expect(row.getByRole('checkbox')).not.toBeChecked();
      await expect.poll(() => results.evaluate((node) => node.scrollTop)).toBe(top);
      await page.screenshot({
        path: info.outputPath('history-active-return.png'),
        fullPage: false,
      });
      if (variant.width === 1920) {
        const scroll = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
        const width = () =>
          scroll.evaluate((node) => {
            const style = getComputedStyle(node);
            return (
              node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            );
          });
        const handle = scroll.getByRole('separator');
        for (const desired of [523, 524, 525]) {
          const current = await width();
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + 20);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + current - desired, box.y + 20, {
            steps: 4,
          });
          await page.mouse.up();
          await expect.poll(width).toBe(desired);
          await filter.click();
          await expect(
            history.getByRole('button', {
              name: label('gallery.videoReview.historyElement'),
              exact: true,
            })
          ).toBeInViewport();
          await page.screenshot({
            path: info.outputPath(`history-elements-${desired}.png`),
            fullPage: false,
          });
          await filter.click();
        }
      }
      await dialog
        .getByRole('button', { name: label('common.actions.close'), exact: true })
        .click();
    } finally {
      await new Promise<void>((resolve) => server.server.close(() => resolve()));
    }
  });
}

/** Reveal all history rows through their real scroll owner at the short-height budget. */
async function revealHistoryRows(dialog: Locator) {
  const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
  const strip = dialog.locator('[data-ui="gallery.videoReview.historyStrip"]');
  await viewport.evaluate((node) => {
    const strip = node.querySelector<HTMLElement>('[data-ui="gallery.videoReview.historyStrip"]')!;
    const parent = node.getBoundingClientRect(),
      child = strip.getBoundingClientRect();
    node.scrollTop += Math.max(0, child.bottom - parent.bottom);
  });
  const owner = (await viewport.boundingBox())!,
    stack = (await strip.boundingBox())!;
  const ruler = (await dialog.locator('[data-ui="gallery.videoReview.rulerRow"]').boundingBox())!;
  expect(stack.y).toBeGreaterThanOrEqual(ruler.y + ruler.height - 0.5);
  expect(stack.y + stack.height).toBeLessThanOrEqual(owner.y + owner.height + 0.5);
  await expect(strip).toHaveCSS('padding-bottom', '0px');
  await expect(strip).toHaveCSS('margin-bottom', '0px');
  for (const family of ['keyboard', 'mouse'])
    await expect(
      strip.locator(`[data-history-family=${family}] > span[aria-hidden=true]`)
    ).toHaveCSS('border-bottom-width', '0px');
  expect(
    await strip
      .locator('[data-history-family=keyboard]')
      .evaluate(
        (node) => document.getElementById(node.getAttribute('aria-describedby') ?? '')?.textContent
      )
  ).toMatch(/only keys delivered|только клавиши, переданные/);
  expect(
    await strip
      .locator('[data-history-family]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-history-family')))
  ).toEqual(['keyboard', 'mouse', 'cursor']);
}

async function verifyClickTiming(
  page: Page,
  dialog: Locator,
  properties: Locator,
  locale: 'en' | 'ru'
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const setTiming = async (key: Parameters<typeof translate>[0], value: string) => {
    const input = properties.getByRole('textbox', { name: label(key), exact: true });
    await input.fill(value);
    await input.press('Enter');
  };
  const seek = async (time: number) => {
    await dialog
      .locator('video')
      .first()
      .evaluate((video: HTMLVideoElement, time) => {
        video.currentTime = time;
      }, time);
  };
  const overlay = dialog.locator('[data-ui="gallery.videoReview.clickAnimation"]');
  await setTiming('gallery.videoReview.clickBefore', '400');
  await setTiming('gallery.videoReview.clickAfter', '1500');
  await setTiming('gallery.videoReview.clickOffset', '-200');
  await seek(0.5);
  await expect(overlay).toBeVisible();
  await setTiming('gallery.videoReview.clickBefore', '0');
  await expect(overlay).toHaveCount(0);
  await seek(2);
  await expect(overlay).toBeVisible();
  await setTiming('gallery.videoReview.clickAfter', '600');
  await expect(overlay).toHaveCount(0);
  await setTiming('gallery.videoReview.clickOffset', '500');
  await expect(overlay).toBeVisible();
  await seek(2.2);
  await expect(overlay).toHaveCount(0);
}

async function seedReadableKeyboardHistory(page: Page) {
  await page.evaluate(async (fixture) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(fixture.databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('recording_telemetry', 'readwrite');
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    tx.objectStore('recording_telemetry').put({
      recordingId: fixture.records.recordings[0]!.id,
      captureMode: 'TAB',
      createdAt: 1,
      updatedAt: 1,
      viewport: null,
      cursorTrack: null,
      signals: [
        { id: 'short-typing', kind: 'typing', startTime: 2, endTime: 2.02, point: null, data: {} },
        {
          id: 'idle-0',
          kind: 'cursor-idle',
          startTime: 0.13,
          endTime: 3.27,
          point: null,
          data: {},
        },
        {
          id: 'idle-1',
          kind: 'cursor-idle',
          startTime: 3.27,
          endTime: 6.41,
          point: null,
          data: {},
        },
        { id: 'typing', kind: 'typing', startTime: 6.5, endTime: 12.01, point: null, data: {} },
      ],
      actionEvents: [
        {
          id: 'covered-command',
          kind: 'KEY',
          time: 2,
          duration: 0,
          point: null,
          label: 'Ctrl+A',
          data: {},
          preset: 'NONE',
        },
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `click-${index}`,
          kind: 'CLICK',
          time: 1 + index * 0.03,
          duration: 0,
          point: { x: 40, y: 30 },
          recordingPoint: { x: 0.25, y: 0.33 },
          label: '',
          data: {},
          preset: 'NONE',
        })),
        ...['Ctrl+K', 'Ctrl+S', 'Alt+Shift'].map((label, index) => ({
          id: `command-${index}`,
          kind: 'KEY',
          time: 7 + index,
          duration: 0,
          point: null,
          label,
          data: {},
          preset: 'NONE',
        })),
      ],
    });
    await done;
    db.close();
  }, betaV1Fixture);
}
