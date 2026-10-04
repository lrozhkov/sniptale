import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`HTML preserves grouped steps and offline navigation in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'en',
      theme === 'light' ? { width: 1280, height: 560 } : { width: 1920, height: 900 }
    );
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'Step by step', exact: true }).click();
    const reader = page.locator('.guide-reader');
    await expect(reader.locator('.guide-read-document > section')).toHaveCount(1);
    await expect(reader.locator('.guide-read-document > article')).toHaveCount(1);
    await expect(reader.locator('.guide-reading-nav a')).toHaveCount(2);
    await expect(reader.locator('.guide-reader-pagination')).toContainText('1 / 2');
    const intro = await reader.locator('.guide-read-document > section').boundingBox();
    const scroll = await reader.locator('.guide-document-scroll').boundingBox();
    expect(intro!.y).toBeGreaterThanOrEqual(scroll!.y);
    if (theme === 'dark') {
      await page.getByRole('button', { name: 'Step navigation', exact: true }).click();
      await page.getByRole('option', { name: 'On the left', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Save standalone HTML', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Step by step', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
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
      Object.defineProperty(window, 'readingExportHtml', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Step by step', exact: true }).click();
    await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
    await page.getByRole('button', { name: 'Save HTML', exact: true }).click();
    await expect(page.locator('.guide-export-status')).toHaveText('HTML saved');
    const html = await page.evaluate(() => {
      const value: unknown = Reflect.get(window, 'readingExportHtml');
      if (typeof value !== 'string') throw new Error('Missing HTML');
      return value;
    });
    const filename = testInfo.outputPath('guide.html');
    await writeFile(filename, html);
    const network: string[] = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) network.push(request.url());
    });
    await page.goto(pathToFileURL(filename).href);
    await expect(page.locator('[data-guide-progress]')).toHaveText('1 / 2');
    await expect(page.locator('.guide-reading-layout')).toHaveAttribute(
      'data-navigation',
      theme === 'dark' ? 'side' : 'top'
    );
    await expect(page.locator('.guide-read-document > section')).toBeVisible();
    await expect(page.locator('.guide-read-document > article:visible')).toHaveCount(1);
    await inspectStandaloneViewer(page, testInfo, theme);
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await expect(page.locator('[data-guide-progress]')).toHaveText('2 / 2');
    await expect(page.locator('.guide-read-document > section')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Next step', exact: true })).toBeDisabled();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-guide-progress]')).toHaveText('1 / 2');
    await page.locator('[data-guide-target]').last().click();
    await page.reload();
    await expect(page.locator('[data-guide-progress]')).toHaveText('2 / 2');
    await page.evaluate(() => {
      location.hash = '%E0%A4%A';
    });
    await expect(page.locator('[data-guide-progress]')).toHaveText('2 / 2');
    await page.evaluate(() => {
      location.hash = 'guide-item-intro';
    });
    await expect(page.locator('[data-guide-progress]')).toHaveText('1 / 2');
    await page.setViewportSize({ width: 640, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.evaluate(() => document.fonts.ready);
    await testInfo.attach(`html-${theme}`, {
      body: await page.screenshot({ path: `tasks/scenario-html-steps/html-${theme}.png` }),
      contentType: 'image/png',
    });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.guide-read-document > article:visible')).toHaveCount(2);
    await expect(page.locator('[data-guide-open]').first()).toBeHidden();
    await expect(page.locator('[data-guide-viewer]')).toBeHidden();
    expect(network).toEqual([]);
    issues.assertClean();
    const touch = await page
      .context()
      .browser()!
      .newContext({
        viewport: { width: 390, height: 640 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
      });
    try {
      const mobile = await touch.newPage();
      await mobile.goto(pathToFileURL(filename).href);
      const trigger = mobile.locator('[data-guide-open]').first();
      await expect(trigger).toHaveCSS('opacity', '1');
      await trigger.tap();
      await expect(mobile.locator('[data-close]')).toBeInViewport();
      await expectFittedImage(mobile);
      await mobile.locator('dialog [data-zoom]').tap();
      await expect(mobile.locator('dialog')).toHaveAttribute('data-zoom', 'full');
      await testInfo.attach(`html-viewer-touch-${theme}`, {
        body: await mobile.screenshot(),
        contentType: 'image/png',
      });
      await mobile.locator('[data-close]').tap();
      await expect(trigger).toBeFocused();
    } finally {
      await touch.close();
    }
    const noScript = await page.context().browser()!.newContext({ javaScriptEnabled: false });
    try {
      const fallback = await noScript.newPage();
      await fallback.goto(pathToFileURL(filename).href);
      await expect(fallback.locator('.guide-read-document > article:visible')).toHaveCount(2);
      await expect(fallback.locator('.guide-read-document > section')).toBeVisible();
      await expect(fallback.locator('[data-guide-pagination]')).toBeHidden();
    } finally {
      await noScript.close();
    }
  });
}

async function chooseHtmlOption(page: Page, fields: Locator, name: string, option: string) {
  await fields.getByRole('button', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function expectFrameFields(fields: Locator) {
  await expect(
    fields.getByRole('switch', { name: 'Click to view', exact: true })
  ).not.toBeChecked();
  await expect(fields.getByRole('switch', { name: 'Click to view', exact: true })).toBeDisabled();
  await expect(fields.getByRole('switch', { name: 'Optimize size', exact: true })).toBeChecked();
  await expect(fields.getByRole('switch', { name: 'Optimize size', exact: true })).toBeDisabled();
  await expect(fields.getByRole('button', { name: 'Maximum edge', exact: true })).toBeDisabled();
  await expect(fields.getByRole('button', { name: 'WebP quality', exact: true })).toBeEnabled();
}

for (const theme of ['light', 'dark'] as const) {
  test(`guide HTML defaults preserve image overrides and frame dependencies in ${theme}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'en',
      theme === 'light' ? { width: 1280, height: 560 } : { width: 1920, height: 900 }
    );
    const reopen = new URL(page.url());
    reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
    reopen.searchParams.set('theme', theme);
    reopen.searchParams.set('locale', 'en');
    const openDefaults = () =>
      page
        .locator('.guide-page-header')
        .getByRole('button', { name: 'Appearance', exact: true })
        .click();
    await openDefaults();
    const defaults = page.locator('.guide-default-appearance .guide-html-fields');
    await defaults.scrollIntoViewIfNeeded();
    await expect(
      defaults.getByRole('switch', { name: 'Click to view', exact: true })
    ).toBeChecked();
    await defaults.getByRole('switch', { name: 'Optimize size', exact: true }).check();
    await chooseHtmlOption(page, defaults, 'Maximum edge', '1280 px');
    await chooseHtmlOption(page, defaults, 'Saved content', 'Visible frame');
    await expectFrameFields(defaults);
    await chooseHtmlOption(page, defaults, 'WebP quality', '75%');
    await chooseHtmlOption(page, defaults, 'Saved content', 'Full image');
    await expect(
      defaults.getByRole('switch', { name: 'Click to view', exact: true })
    ).toBeChecked();
    await expect(defaults.getByRole('button', { name: 'Maximum edge', exact: true })).toContainText(
      '1280'
    );
    await expect(defaults.getByRole('button', { name: 'WebP quality', exact: true })).toContainText(
      '75%'
    );
    await defaults.getByRole('switch', { name: 'Optimize size', exact: true }).uncheck();
    await chooseHtmlOption(page, defaults, 'Saved content', 'Visible frame');
    await expectFrameFields(defaults);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
      defaults.getByRole('switch', { name: 'Optimize size', exact: true })
    ).not.toBeChecked();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expectFrameFields(defaults);
    await page.locator('[data-block-id="before"] img').click();
    const imageInspector = page.locator('.guide-image-inspector');
    await imageInspector
      .locator('nav')
      .getByRole('button', { name: 'HTML images', exact: true })
      .click();
    const individual = imageInspector.locator('.guide-html-fields');
    await imageInspector.getByRole('switch', { name: 'Guide defaults', exact: true }).uncheck();
    await chooseHtmlOption(page, individual, 'Saved content', 'Full image');
    await expect(
      individual.getByRole('switch', { name: 'Click to view', exact: true })
    ).toBeChecked();
    await openDefaults();
    await chooseHtmlOption(page, defaults, 'WebP quality', '95%');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.goto(reopen.toString());
    await openDefaults();
    await expectFrameFields(defaults);
    await expect(defaults.getByRole('button', { name: 'WebP quality', exact: true })).toContainText(
      '95%'
    );
    await defaults.scrollIntoViewIfNeeded();
    await info.attach(`html-defaults-${theme}`, {
      body: await page.screenshot({
        path: `.tmp/backlog7/b19-defaults-${theme}.png`,
        fullPage: false,
      }),
      contentType: 'image/png',
    });
    await page.locator('[data-block-id="before"] img').click();
    await imageInspector
      .locator('nav')
      .getByRole('button', { name: 'HTML images', exact: true })
      .click();
    await expect(
      individual.getByRole('button', { name: 'Saved content', exact: true })
    ).toContainText('Full image');
    await imageInspector.getByRole('switch', { name: 'Guide defaults', exact: true }).check();
    await expect(
      individual.getByRole('button', { name: 'Saved content', exact: true })
    ).toContainText('Visible frame');
    await expect(
      individual.getByRole('button', { name: 'WebP quality', exact: true })
    ).toContainText('95%');
    await imageInspector.getByRole('switch', { name: 'Guide defaults', exact: true }).uncheck();
    await chooseHtmlOption(page, individual, 'Saved content', 'Full image');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'Save standalone HTML', exact: true }).click();
    const workbench = page.locator('.guide-html-fields');
    await expectFrameFields(workbench);
    await page.getByRole('button', { name: 'Select image 1', exact: true }).click();
    await expect(
      workbench.getByRole('button', { name: 'Saved content', exact: true })
    ).toContainText('Full image');
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
      Object.defineProperty(window, 'defaultsExportHtml', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save HTML', exact: true }).click();
    await expect(page.locator('.guide-export-status')).toHaveText('HTML saved');
    const html = await page.evaluate(() => {
      const result: unknown = Reflect.get(window, 'defaultsExportHtml');
      if (typeof result !== 'string') throw new Error('Missing saved HTML');
      return result;
    });
    const filename = info.outputPath('defaults.html');
    await writeFile(filename, html);
    await page.goto(pathToFileURL(filename).href);
    await expect(page.locator('[data-block-id="before"] [data-guide-open]')).toHaveCount(1);
    await expect(page.locator('[data-block-id="after"] [data-guide-open]')).toHaveCount(0);
    await expect(page.locator('defs image')).toHaveCount(2);
    await page.setViewportSize({ width: 1280, height: 560 });
    reopen.searchParams.set('locale', 'ru');
    await page.goto(reopen.toString());
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Оформление', exact: true })
      .click();
    await defaults.scrollIntoViewIfNeeded();
    await expect(
      defaults.getByRole('button', { name: 'Качество WebP', exact: true })
    ).toBeInViewport();
    await info.attach(`html-defaults-ru-${theme}`, {
      body: await page.screenshot({
        path: `.tmp/backlog7/b19-defaults-ru-${theme}.png`,
        fullPage: false,
      }),
      contentType: 'image/png',
    });
  });
}

async function expectFittedImage(page: Page) {
  const viewport = page.locator('[data-viewport]');
  const image = viewport.locator('img');
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
    .toBe(true);
  const bounds = await viewport.boundingBox();
  const pixels = await image.boundingBox();
  expect(pixels!.width).toBeGreaterThan(0);
  expect(pixels!.height).toBeGreaterThan(0);
  expect(pixels!.width).toBeLessThanOrEqual(bounds!.width + 1);
  expect(pixels!.height).toBeLessThanOrEqual(bounds!.height + 1);
}

async function inspectStandaloneViewer(page: Page, info: TestInfo, theme: string) {
  const trigger = page.locator('[data-guide-open]').first();
  await trigger.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(trigger).toHaveCSS('opacity', '0');
  await trigger.locator('..').hover();
  await expect(trigger).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0);
  await trigger.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveCSS('opacity', '1');
  const readingScroll = () =>
    page.locator('.guide-html-content').evaluate((node) => node.scrollTop);
  const position = await readingScroll();
  await page.keyboard.press('Enter');
  const dialog = page.locator('[data-guide-viewer]');
  const close = dialog.locator('[data-close]');
  const fit = dialog.locator('[data-fit]');
  const full = dialog.locator('[data-zoom]');
  const viewport = dialog.locator('[data-viewport]');
  await expect(close).toBeFocused();
  await expect(fit).toHaveAttribute('aria-pressed', 'true');
  await expect(full).toHaveAttribute('aria-pressed', 'false');
  await expectFittedImage(page);
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await viewport.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-guide-progress]')).toHaveText('1 / 2');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(await readingScroll()).toBe(position);

  // Synthetic landscape/portrait pixels exercise extremes inside the actual generated CSP document.
  // The original exported source was exercised above; runtime and markup remain unchanged here.
  for (const [width, height, caption] of [
    [2400, 1600, 'Long caption '.repeat(80)],
    [1200, 2400, ''],
  ] as const) {
    await trigger.evaluate(
      (button, media) => {
        const canvas = document.createElement('canvas');
        canvas.width = media.width;
        canvas.height = media.height;
        canvas.getContext('2d')!.fillRect(0, 0, media.width, media.height);
        const source = document.getElementById((button as HTMLElement).dataset['guideOpen']!)!;
        source.setAttribute('href', canvas.toDataURL('image/png'));
        (button as HTMLElement).dataset['caption'] = media.caption;
      },
      { width, height, caption }
    );
    await trigger.click();
    await expectFittedImage(page);
    await expect(close).toBeInViewport();
    await expect(dialog.locator('figcaption')).toHaveText(caption.trim());
    await full.click();
    await expect(full).toHaveAttribute('aria-pressed', 'true');
    await expect(fit).toHaveAttribute('aria-pressed', 'false');
    const image = await viewport.locator('img').boundingBox();
    expect(image!.width).toBe(width);
    expect(image!.height).toBe(height);
    await viewport.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('[data-guide-progress]')).toHaveText('1 / 2');
    await close.click();
    await expect(trigger).toBeFocused();
    expect(await readingScroll()).toBe(position);
    await trigger.click();
    await expect(dialog).toHaveAttribute('data-zoom', 'fit');
    expect(await viewport.evaluate((node) => node.scrollTop + node.scrollLeft)).toBe(0);
    await full.click();
    await fit.click();
    await expectFittedImage(page);
    await info.attach(`html-viewer-${theme}-${width}x${height}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await close.click();
  }
}
