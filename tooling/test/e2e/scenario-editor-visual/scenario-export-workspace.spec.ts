import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { expect, type Page, type Locator } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { createPageIssueCollector, openVisualHarness } from './scenario-editor-visual.helpers';

test('guide HTML downloads directly and preserves reading settings for repeated export', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 560 });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Step by step', exact: true }).click();
  for (let attempt = 0; attempt < 2; attempt++) {
    const html = await downloadGuideHtml(page);
    expect(html).toContain('data-reading-mode="steps"');
    await expect(page.locator('main.guide-reader')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Step by step', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.locator('.guide-html-workbench')).toHaveCount(0);
  }
});

test('guide export opens the shared reader workspace on the first click', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'dark', 'ru', { width: 1280, height: 560 });
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const reader = page.locator('main.guide-export-workspace');
  await expect(reader).toBeVisible();
  await expect(page.locator('.guide-page-header')).toHaveCount(0);
  const stage = reader.locator('.guide-export-stage');
  await expect(stage.locator('.guide-reading-nav')).toBeVisible();
  await expect(stage.locator('.guide-read-document article')).toHaveCount(2);
  const inspector = reader.locator('.guide-export-inspector');
  await expect(inspector).toBeVisible();
  const inspectorBox = await inspector.boundingBox();
  expect(inspectorBox).not.toBeNull();
  expect(inspectorBox!.height).toBeGreaterThanOrEqual(560 - 16 - 1);
  await expect(
    inspector.getByRole('button', { name: 'Вернуться к редактированию', exact: true })
  ).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Документ', exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'По шагам', exact: true })).toBeVisible();
  await expect(
    inspector.getByRole('button', { name: 'Навигация по шагам', exact: true })
  ).toBeVisible();
  await expect(
    inspector.getByRole('button', { name: 'Сохранить автономный HTML', exact: true })
  ).toBeVisible();
  await expect(
    inspector.getByRole('button', { name: 'Сохранить Markdown с изображениями (ZIP)', exact: true })
  ).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Печать / PDF', exact: true })).toBeVisible();
  await testInfo.attach('guide-reader-workspace-ru-dark-minimum', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Экспорт', exact: true })).toBeFocused();
  issues.assertClean();
});

test('guide direct HTML export stays in the reader at minimum width', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'dark', 'ru', { width: 1280, height: 560 });
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const workspace = page.locator('main.guide-reader');
  const stage = workspace.locator('.guide-export-stage');
  const inspector = workspace.locator('.guide-export-inspector');
  const html = await downloadGuideHtml(page, 'ru');
  expect(html).toContain('data-guide-viewer');
  await expect(workspace).toBeVisible();
  await expect(inspector.locator('.guide-html-thumbnail')).toHaveCount(0);
  await expect(stage.locator('.guide-read-document article')).toHaveCount(2);
  expect((await stage.boundingBox())!.width).toBeGreaterThan(600);
  expect((await inspector.boundingBox())!.width).toBeGreaterThan(200);
  await expect(inspector.locator('.guide-export-actions')).toBeInViewport();
  await testInfo.attach('guide-direct-html-ru-dark-minimum', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(workspace).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Экспорт', exact: true })).toBeFocused();
  issues.assertClean();
});

test('tour HTML export prepares the sandboxed preview inside the shared workspace', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(
    page,
    hostOrigin,
    'light',
    'en',
    { width: 1280, height: 560 },
    'compare',
    { tourFixture: '1' }
  );
  await page.getByRole('button', { name: 'Interactive tour', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const workspace = page.locator('main.guide-export-workspace.tour-export');
  await expect(workspace).toBeVisible();
  await expect(workspace.locator('.guide-page-header')).toHaveCount(0);
  const stage = workspace.locator('.guide-export-stage');
  const inspector = workspace.locator('.guide-export-inspector');
  await expect(stage.locator('iframe')).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: 'Replay animation' })).toBeDisabled();
  await expect(
    stage.getByRole('button', { name: 'Prepare and preview', exact: true })
  ).toBeVisible();
  await testInfo.attach('tour-workspace-idle-en-light-minimum', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await stage.getByRole('button', { name: 'Prepare and preview', exact: true }).click();
  await expect(stage.locator('.tour-export-frame iframe')).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
  await expect(inspector.locator('.guide-export-heading output')).not.toBeEmpty();
  await expect(inspector.getByRole('button', { name: 'Replay animation' })).toBeEnabled();
  await testInfo.attach('tour-workspace-ready-en-light-minimum', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(workspace).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeFocused();
  issues.assertClean();
});

test('tour preview paints the selected slide in the browser', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(
    page,
    hostOrigin,
    'light',
    'en',
    { width: 1280, height: 900 },
    'compare',
    { tourFixture: '1' }
  );
  await page.getByRole('button', { name: 'Interactive tour', exact: true }).click();
  const slide = page.locator('.tour-slide-select:has(img)').nth(1);
  await expect(slide).toBeVisible();
  await slide.click();
  const controls = page.locator('.tour-header-controls');
  await controls.getByRole('button', { name: 'Preview', exact: true }).click();
  const stage = page.locator('.tour-stage-host');
  await expect(stage).toHaveAttribute('data-view', 'preview');
  const readPaint = () =>
    page.evaluate(() => {
      const host = document.querySelector('.tour-stage-host');
      const root = host?.shadowRoot;
      if (!root) return { missing: true } as const;
      const scene = root.querySelector<HTMLElement>('[data-tour-scene]');
      const plane = root.querySelector<HTMLElement>('[data-tour-stage]');
      const image = root.querySelector<HTMLImageElement>('img.tour-image');
      if (!scene || !plane) return { missing: true } as const;
      const sceneRect = scene.getBoundingClientRect();
      const planeRect = plane.getBoundingClientRect();
      const imageRect = image?.getBoundingClientRect();
      return {
        missing: false as const,
        motion: plane.dataset.motion ?? null,
        inert: scene.inert,
        opacity: getComputedStyle(scene).opacity,
        stage: { width: planeRect.width, height: planeRect.height },
        scene: { width: sceneRect.width, height: sceneRect.height },
        image: image
          ? {
              width: imageRect!.width,
              height: imageRect!.height,
              complete: image.complete,
              naturalWidth: image.naturalWidth,
              src: image.src.slice(0, 40),
            }
          : null,
      };
    });
  const painted = async () => {
    const paint = await readPaint();
    if (paint.missing || !paint.image) return false;
    return (
      paint.image.complete &&
      paint.image.naturalWidth > 0 &&
      paint.image.width > 0 &&
      paint.image.height > 0 &&
      paint.scene.width > 0 &&
      paint.scene.height > 0 &&
      paint.stage.width > 0 &&
      paint.stage.height > 0 &&
      paint.opacity === '1' &&
      !paint.inert
    );
  };
  await expect.poll(painted, { message: 'preview paints a decoded visible image' }).toBe(true);
  await expect(stage.locator('.tour-toolbar')).toBeVisible();
  await expect(stage.locator('[data-tour-play]')).toHaveAttribute('aria-pressed', 'true');
  await expect(stage.locator('[data-tour-counter]')).toHaveText('2 / 2');
  await stage.locator('[data-tour-contents]').click();
  await expect(stage.locator('[data-tour-navigation]')).toBeVisible();
  await stage.locator('.tour-contents-list button').first().click();
  await expect(stage.locator('[data-tour-counter]')).toHaveText('1 / 2');
  await stage.locator('[data-tour-next]').click();
  await expect.poll(painted).toBe(true);
  await stage.locator('[data-tour-previous]').click();
  await expect(stage.locator('[data-tour-counter]')).toHaveText('1 / 2');
  await stage.locator('[data-tour-next]').click();
  await expect(stage.locator('[data-tour-counter]')).toHaveText('2 / 2');
  await expect.poll(painted).toBe(true);
  await testInfo.attach('full-editor-tour-player', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const paint = await readPaint();
  expect(paint.missing).toBe(false);
  await expect(page.locator('.tour-preview-status')).toHaveCount(0);
  await controls.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(stage).toHaveAttribute('data-view', 'preview');
  await expect
    .poll(painted, { message: 'replayed preview paints a decoded visible image' })
    .toBe(true);
  await controls.getByRole('button', { name: 'Return to editing', exact: true }).click();
  await expect(stage).toHaveAttribute('data-view', 'edit');
  await expect(controls.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
  issues.assertClean();
});

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`output inspector presentation ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await openVisualHarness(page, hostOrigin, theme, locale, { width: 1280, height: 560 });
      const editingSelect = page
        .locator('.guide-inspector-panel [data-ui="shared.ui.compact-select"] > button')
        .first();
      await expect(editingSelect).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await page
        .getByRole('button', { name: locale === 'ru' ? 'Экспорт' : 'Export', exact: true })
        .click();
      const inspector = page.locator('.guide-export-inspector');
      const selected = inspector.locator('[role="group"] button[aria-pressed="true"]').first();
      await expect(selected).toHaveCSS('font-size', '12px');
      await selected.hover();
      await expect(selected).toHaveCSS('box-shadow', 'none');
      await expect(
        inspector.locator('[data-ui="shared.ui.compact-select"] > button').first()
      ).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await downloadGuideHtml(page, locale);
      const heading = inspector.locator('.guide-export-heading');
      const top = (await heading.boundingBox())!.y;
      const body = inspector.locator('.guide-export-inspector-body');
      await body.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      expect((await heading.boundingBox())!.y).toBeCloseTo(top, 0);
      await expect
        .poll(() => body.evaluate((node) => node.scrollWidth - node.clientWidth))
        .toBeLessThanOrEqual(1);
      await expect(inspector.locator('.guide-export-actions')).toBeInViewport();
      await info.attach('output-inspector', {
        body: await inspector.screenshot(),
        contentType: 'image/png',
      });
      await inspector
        .getByRole('button', {
          name: locale === 'ru' ? 'Печать / PDF' : 'Print / PDF',
          exact: true,
        })
        .click();
      const print = page.locator('.guide-print-settings');
      await expect(print).toBeVisible();
      for (const button of await print.locator('[aria-pressed="true"]').all()) {
        await expect(button).toHaveCSS('font-size', '12px');
        await expect(button).toHaveCSS('box-shadow', 'none');
      }
      await page.keyboard.press('Escape');
      await expect(inspector).toBeVisible();
    });
  }
}

for (const locale of ['en', 'ru'] as const) {
  test(`guide export groups output settings and keeps actions reachable in ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const ru = locale === 'ru';
    const words = ru
      ? {
          export: 'Экспорт',
          format: 'Формат экспорта',
          html: 'Сохранить автономный HTML',
          print: 'Печать / PDF',
          back: 'Вернуться к экспорту',
          title: 'Экспорт HTML',
          settings: 'Настройки изображений',
          preview: 'Сохранённое изображение',
          landscape: 'Альбомная',
        }
      : {
          export: 'Export',
          format: 'Export format',
          html: 'Save standalone HTML',
          print: 'Print / PDF',
          back: 'Back to export',
          title: 'Export HTML',
          settings: 'Image settings',
          preview: 'Saved image preview',
          landscape: 'Landscape',
        };
    await openVisualHarness(page, hostOrigin, ru ? 'light' : 'dark', locale, {
      width: 1280,
      height: 560,
    });
    await page.getByRole('button', { name: words.export, exact: true }).click();
    const formats = page.getByRole('group', { name: words.format, exact: true });
    await expect(formats).toBeInViewport();
    const print = formats.getByRole('button', { name: words.print, exact: true });
    expect((await print.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    const html = await downloadGuideHtml(page, locale);
    expect(html).toContain('data-guide-viewer');
    const inspector = page.locator('.guide-export-inspector');
    await expect(page.locator('main.guide-reader')).toBeVisible();
    await expect(inspector.locator('.guide-export-formats')).toBeInViewport();
    await expect(inspector.locator('.guide-html-fields')).toHaveCount(0);
    await info.attach(`html-composition-${locale}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await print.click();
    const paper = page.locator('.guide-print');
    await paper.getByRole('button', { name: words.landscape, exact: true }).click();
    const action = paper.getByRole('button', { name: words.print, exact: true });
    const returnButton = paper.getByRole('button', { name: words.back, exact: true });
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    expect((await returnButton.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await expect(action).toBeInViewport();
    await info.attach(`print-composition-${locale}`, {
      body: await page.screenshot({ path: `.tmp/backlog6-w22-print-${locale}.png` }),
      contentType: 'image/png',
    });
    await returnButton.click();
    await print.click();
    await expect(paper.getByRole('button', { name: words.landscape, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
}

async function downloadGuideHtml(page: Page, locale: 'en' | 'ru' = 'en') {
  await page.evaluate(() => {
    const chunks: Uint8Array[] = [];
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => ({
        createWritable: async () =>
          new WritableStream<Uint8Array>({
            write: (chunk) => {
              chunks.push(chunk);
            },
          }),
      }),
    });
    Object.defineProperty(window, 'workspaceExportHtml', {
      configurable: true,
      get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
    });
  });
  await page
    .getByRole('button', {
      name: locale === 'ru' ? 'Сохранить автономный HTML' : 'Save standalone HTML',
      exact: true,
    })
    .click();
  await expect(page.locator('.guide-html-export [role="status"]')).toHaveText(
    locale === 'ru' ? 'HTML сохранён' : 'HTML saved'
  );
  return page.evaluate(() => {
    const html: unknown = Reflect.get(window, 'workspaceExportHtml');
    if (typeof html !== 'string' || !html.includes('<!doctype html>'))
      throw new Error('Missing downloaded HTML');
    return html;
  });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`top flow titles ellipsize without losing navigation at ${viewport.width}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const theme = viewport.width === 1280 ? 'light' : 'dark';
    await openVisualHarness(page, hostOrigin, theme, 'en', viewport);
    const sectionTitle = 'UnbrokenNavigationTitle'.repeat(5);
    const titles = [
      'A long Latin step title that must remain complete in the document and downloaded file',
      'Длинный заголовок шага на русском языке сохраняется целиком при просмотре и экспорте',
    ];
    await page.getByRole('textbox', { name: 'Section title', exact: true }).fill(sectionTitle);
    const fields = page.getByRole('textbox', { name: 'Step title', exact: true });
    for (let index = 0; index < titles.length; index++)
      await fields.nth(index).fill(titles[index]!);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const layout = page.locator('.guide-reader-body');
    await expect(layout).toHaveAttribute('data-reading-mode', 'flow');
    await expect(layout).toHaveAttribute('data-navigation', 'top');
    await inspectNavigationTitles(layout.locator('.guide-reading-nav'), page);
    for (const title of titles)
      await expect(layout.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Step navigation', exact: true }).click();
    await page.getByRole('option', { name: 'On the left', exact: true }).click();
    await expect(layout.locator('.guide-reading-title').first()).toHaveCSS('white-space', 'normal');
    await page.getByRole('button', { name: 'Step navigation', exact: true }).click();
    await page.getByRole('option', { name: 'At the top', exact: true }).click();
    await page.getByRole('button', { name: 'Step by step', exact: true }).click();
    await expect(layout.locator('.guide-reading-title').first()).toBeHidden();
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    const before = await layout
      .locator('.guide-document-scroll')
      .evaluate((node) => node.scrollTop);
    const html = await downloadGuideHtml(page);
    expect(await layout.locator('.guide-document-scroll').evaluate((node) => node.scrollTop)).toBe(
      before
    );
    await info.attach(`reader-title-ellipsis-${viewport.width}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    const filename = info.outputPath('long-titles.html');
    await writeFile(filename, html);
    await page.goto(pathToFileURL(filename).href);
    await page.evaluate(() => document.fonts.ready);
    await inspectNavigationTitles(page.locator('.guide-reading-nav'), page);
    await expect(page.getByRole('heading', { name: sectionTitle, exact: true })).toHaveText(
      sectionTitle
    );
    for (const title of titles)
      await expect(page.getByRole('heading', { name: title, exact: true })).toHaveText(title);
    await info.attach(`standalone-title-ellipsis-${viewport.width}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

async function inspectNavigationTitles(nav: Locator, page: Page) {
  const links = nav.locator('a');
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) {
    const title = link.locator('.guide-reading-title');
    const full = await title.textContent();
    await expect(link).toHaveAttribute('title', full!);
    expect(await link.getAttribute('aria-label')).toContain(full);
    const geometry = await link.evaluate((node) => {
      const label = node.querySelector<HTMLElement>('.guide-reading-title')!;
      const badge = node.querySelector<HTMLElement>('.guide-reading-badge')!;
      const box = node.getBoundingClientRect();
      const mark = badge.getBoundingClientRect();
      return {
        clipped: label.scrollWidth > label.clientWidth,
        width: label.getBoundingClientRect().width,
        cap: Number.parseFloat(getComputedStyle(label).maxWidth),
        badgeVisible: mark.width >= 16 && mark.left >= box.left && mark.right <= box.right,
        fits: box.width <= node.parentElement!.clientWidth,
      };
    });
    expect(geometry.clipped).toBe(true);
    expect(geometry.width).toBeLessThanOrEqual(geometry.cap + 1);
    expect(geometry.badgeVisible).toBe(true);
    expect(geometry.fits).toBe(true);
    await expect(title).toHaveCSS('text-overflow', 'ellipsis');
    await link.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(link).toBeFocused();
    await expect.poll(() => link.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
    await expect(link).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    const target = await link.getAttribute('data-guide-target');
    await expect(page.locator(`[id="${target}"]`)).toBeVisible();
  }
}

test('direct HTML cancellation keeps the reader available for retry', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 560 });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Step by step', exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: () =>
        new Promise((_, reject) => {
          Reflect.set(window, 'cancelWorkspacePicker', () =>
            reject(new DOMException('Cancelled', 'AbortError'))
          );
        }),
    });
  });
  const html = page.getByRole('button', { name: 'Save standalone HTML', exact: true });
  await html.click();
  await expect(html).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Save Markdown with images (ZIP)', exact: true })
  ).toBeDisabled();
  await expect(page.locator('main.guide-reader')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => {
    const cancel: unknown = Reflect.get(window, 'cancelWorkspacePicker');
    if (typeof cancel !== 'function') throw new Error('Picker did not open');
    cancel();
  });
  await expect(html).toBeEnabled();
  await expect(page.locator('.guide-html-export [role="status"]')).toHaveCount(0);
  const artifact = await downloadGuideHtml(page);
  expect(artifact).toContain('data-reading-mode="steps"');
  await expect(page.getByRole('button', { name: 'Step by step', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});
