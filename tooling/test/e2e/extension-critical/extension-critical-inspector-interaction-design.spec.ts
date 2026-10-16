import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  translate,
  type AppLocale,
  type TranslationKey,
} from '../../../../apps/extension/src/platform/i18n';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';

type Composition = { locale: AppLocale; theme: 'light' | 'dark' };
const sizes = [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
];
const ui = (page: Page, id: string) => page.locator(`[data-ui="${id}"]`);
const tr = (c: Composition, key: TranslationKey) => translate(key, c.locale);
const named = (owner: Page | Locator, c: Composition, key: TranslationKey) =>
  owner.getByRole('button', { name: tr(c, key), exact: true });
test.use({ actionTimeout: 10_000 });
test.setTimeout(120_000);

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished)
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

async function open(page: Page, extensionId: string, c: Composition) {
  await page.setViewportSize(sizes[0]!);
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
  await expect(ui(page, 'gallery.page.root')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toMatch(/^(ru|en)$/u);
  await page.evaluate(async ({ locale, theme }) => {
    localStorage.setItem('sniptale-locale-preference', locale);
    await chrome.storage.local.set({
      'sniptale-locale-preference': locale,
      'sniptale-theme-preference': theme,
    });
  }, c);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', c.locale);
  await expect(page.locator('html')).toHaveAttribute('data-theme', c.theme);
  await page
    .locator('input[type="file"][multiple]')
    .setInputFiles('tooling/test/e2e/fixtures/review-vp8-opus.webm');
  const material = page.getByRole('button', { name: 'review-vp8-opus.webm', exact: true }).first();
  await expect(material).toBeVisible({ timeout: 20_000 });
  await ui(page, 'gallery.import-progress').getByRole('button').click();
  await material.click();
  await ui(page, 'gallery.videoReview.enter').click();
  await named(page, c, 'gallery.videoReview.advancedEditing').click();
  const inspector = ui(page, 'gallery.videoReview.inspector');
  await named(inspector, c, 'gallery.videoReview.scene').click();
  return inspector;
}

async function choose(
  page: Page,
  owner: Locator,
  c: Composition,
  option: TranslationKey,
  field: TranslationKey
) {
  const direct = named(owner, c, option);
  if (await direct.count()) await direct.click();
  else {
    await named(owner, c, field).click();
    await page.getByRole('option', { name: tr(c, option), exact: true }).click();
  }
}

async function titleHover(page: Page, row: Locator, control: Locator) {
  await row.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const idle = await control.evaluate((node) => getComputedStyle(node).backgroundColor);
  const name = row.locator('.sniptale-parameter-name');
  await name.hover();
  await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(control).toHaveCSS('background-color', idle);
  await control.hover();
  await expect
    .poll(() => control.evaluate((node) => getComputedStyle(node).backgroundColor))
    .not.toBe(idle);
}

async function canvasControls(page: Page, c: Composition, info: TestInfo, suffix: string) {
  const canvas = ui(page, 'gallery.videoReview.canvasSettings');
  const format = named(canvas, c, 'videoEditor.sidebar.canvasFormatLabel');
  const row = format.locator('xpath=ancestor::*[contains(@class,"sniptale-parameter-row")][1]');
  await titleHover(page, row, format);
  await row.locator('.sniptale-parameter-name').click();
  await expect(format).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(format).toHaveAttribute('aria-expanded', 'false');
  await capture(page, info, `canvas-${suffix}`);
  await segmentFit(canvas.locator('[data-ui="shared.ui.compact-inspector.segmented-field"]'), [
    tr(c, 'gallery.videoReview.sourceCropFit'),
    tr(c, 'gallery.videoReview.sourceCropEnable'),
  ]);
}

async function segmentFit(row: Locator, labels: string[]) {
  const value = row.locator('.sniptale-parameter-value');
  const fit = await value.evaluate((node, texts) => {
    const existing = node.querySelector('button');
    if (!existing) throw new Error('Segmented field control absent');
    const style = getComputedStyle(existing);
    const context = document.createElement('canvas').getContext('2d');
    if (!context) throw new Error('Text measurement unavailable');
    context.font = style.font;
    const buttons = [...node.querySelectorAll('button')];
    const segmented = buttons.length === texts.length;
    const container = segmented ? buttons[0]!.parentElement! : node;
    const groupStyle = getComputedStyle(container);
    const gap = Number.parseFloat(groupStyle.columnGap) || 0;
    const padding = segmented
      ? Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
      : 16;
    const required =
      texts.reduce((sum, text) => sum + context.measureText(text).width + padding, 0) +
      gap * (texts.length - 1);
    return {
      segmented,
      required,
      available: container.clientWidth,
      clipped: buttons.some((button) => button.scrollWidth > button.clientWidth + 1),
    };
  }, labels);
  if (fit.required <= fit.available - 1) expect(fit.segmented).toBe(true);
  if (fit.segmented) expect(fit.clipped).toBe(false);
}

async function textEdge(owner: Locator) {
  return owner.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let edge = Number.NEGATIVE_INFINITY;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (
        !node.textContent?.trim() ||
        node.parentElement?.closest('button[data-ui="shared.ui.compact-inspector.numeric-stepper"]')
      )
        continue;
      if (node.parentElement?.closest('[data-ui="shared.ui.compact-inspector.numeric-stepper"]'))
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width) edge = Math.max(edge, rect.right);
    }
    const input = root.querySelector('input[type="text"]');
    if (input) {
      const style = getComputedStyle(input);
      edge = Math.max(
        edge,
        input.getBoundingClientRect().right - Number.parseFloat(style.paddingRight)
      );
    }
    if (!Number.isFinite(edge)) throw new Error('Rendered value text edge unavailable');
    return edge;
  });
}

async function numericControls(
  page: Page,
  background: Locator,
  c: Composition,
  info: TestInfo,
  suffix: string
) {
  const row = background.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]').filter({
    has: page.getByRole('textbox', {
      name: tr(c, 'gallery.videoReview.backgroundPadding'),
      exact: true,
    }),
  });
  await row.scrollIntoViewIfNeeded();
  const field = row.locator('[data-ui="shared.ui.compact-inspector.numeric-value-field"]');
  const input = row.getByRole('textbox', {
    name: tr(c, 'gallery.videoReview.backgroundPadding'),
    exact: true,
  });
  await titleHover(page, row, field.locator('.sniptale-numeric-entry'));
  await expect(row).toHaveCSS('height', '40px');
  const range = row.locator('input[type="range"]');
  const shell = row.locator('[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]');
  await range.hover();
  const geometry = await row.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const hit = node.querySelector('input[type="range"]')!.getBoundingClientRect();
    const track = node
      .querySelector('[data-ui="shared.ui.compact-inspector.numeric-range-track"]')!
      .getBoundingClientRect();
    const style = getComputedStyle(node.querySelector('input[type="range"]')!);
    const field = node
      .querySelector('[data-ui="shared.ui.compact-inspector.numeric-value-field"]')!
      .getBoundingClientRect();
    return {
      hitHeight: hit.height,
      trackHeight: track.height,
      thumbSize: Number.parseFloat(style.getPropertyValue('--sniptale-range-thumb-size')),
      contained: hit.top >= box.top - 1 && hit.bottom <= box.bottom + 1,
      textAboveStrip: field.bottom <= hit.top + 1,
    };
  });
  expect(geometry.hitHeight).toBeGreaterThanOrEqual(16);
  expect(geometry.thumbSize).toBe(14);
  expect(geometry.trackHeight).toBe(3);
  expect(geometry.contained).toBe(true);
  expect(geometry.textAboveStrip).toBe(true);
  await expect(shell).not.toHaveAttribute('aria-hidden', 'true');
  const stepper = row.locator('[data-ui="shared.ui.compact-inspector.numeric-stepper"]');
  await expect(stepper).toHaveCSS('width', '32px');
  const idleEdge = await textEdge(field);
  await input.focus();
  expect(Math.abs((await textEdge(field)) - idleEdge)).toBeLessThanOrEqual(2);
  const initial = await input.inputValue();
  expect(await input.evaluate((node) => node.selectionEnd! - node.selectionStart!)).toBe(
    initial.length
  );
  await input.press('Escape');
  await row.locator('.sniptale-parameter-name').click();
  await expect(input).not.toBeFocused();
  const color = background.locator('[data-ui="shared.ui.compact-inspector.color-field"]').filter({
    hasText: tr(c, 'gallery.videoReview.backgroundShadowColor'),
  });
  const value = color.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
  expect(Math.abs((await textEdge(value)) - idleEdge)).toBeLessThanOrEqual(2);
  const swatch = color.locator('[data-ui="shared.ui.color-selector.picker-trigger"]');
  await expect(swatch).toHaveCSS('width', '32px');
  await expect(swatch).toHaveCSS('height', '32px');
  await expect(swatch.locator(':scope > span')).toHaveCSS('width', '20px');
  await expect(swatch.locator(':scope > span')).toHaveCSS('height', '20px');
  await row.hover();
  const hit = await range.boundingBox();
  if (!hit) throw new Error('Native contextual range hit area unavailable');
  await page.mouse.click(hit.x + hit.width * 0.3, hit.y + hit.height / 2);
  await expect(input).not.toHaveValue(initial);
  const clicked = await input.inputValue();
  await page.mouse.move(hit.x + hit.width * 0.3, hit.y + hit.height / 2);
  await page.mouse.down();
  await page.mouse.move(hit.x + hit.width * 0.5, hit.y + hit.height / 2);
  await page.mouse.up();
  await expect(input).not.toHaveValue(clicked);
  const accepted = await input.inputValue();
  await range.focus();
  await page.keyboard.down('ArrowRight');
  await range.press('Escape');
  await page.keyboard.up('ArrowRight');
  await input.focus();
  await expect(input).toHaveValue(accepted);
  await input.press('Escape');
  await capture(page, info, `numeric-${suffix}`);
}

async function clearControl(page: Page, inspector: Locator, c: Composition, info: TestInfo) {
  const header = inspector.locator('[data-ui="window-header-settings"]');
  await segmentFit(
    header
      .locator('[data-ui="shared.ui.compact-inspector.segmented-field"]')
      .filter({ hasText: tr(c, 'windowHeader.type') }),
    [tr(c, 'windowHeader.none'), tr(c, 'windowHeader.browser'), tr(c, 'windowHeader.application')]
  );
  await choose(page, header, c, 'windowHeader.browser', 'windowHeader.type');
  const input = header.getByRole('textbox', { name: tr(c, 'windowHeader.tabTitle'), exact: true });
  await input.fill('A long editable tab title for the narrow inspector reference');
  await input.press('Enter');
  const row = input.locator('xpath=ancestor::*[contains(@class,"sniptale-parameter-row")][1]');
  const clear = row.getByRole('button', {
    name: tr(c, 'shared.ui.clearField').replace('{field}', tr(c, 'windowHeader.tabTitle')),
    exact: true,
  });
  await page.mouse.move(0, 0);
  await expect(clear).toHaveCSS('opacity', '0');
  await row.locator('.sniptale-parameter-name').hover();
  await expect(clear).toHaveCSS('opacity', '0');
  await input.hover();
  await expect(clear).toHaveCSS('opacity', '1');
  await input.focus();
  await page.keyboard.press('Tab');
  await expect(clear).toBeFocused();
  await expect(clear).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await input.fill('A retained browser title');
  await clear.click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await capture(page, info, 'clear-narrow');
}

for (const locale of ['ru', 'en'] as const)
  for (const theme of ['light', 'dark'] as const) {
    const c: Composition = { locale, theme };
    test(`actual inspector interaction ${locale} ${theme}`, async ({}, info) => {
      const launched = await launchExtensionBrowser({ viewport: sizes[0]! });
      let page: Page | undefined;
      try {
        page = await launched.context.newPage();
        const inspector = await open(page, launched.extensionId, c);
        const background = ui(page, 'gallery.videoReview.backgroundInspector');
        for (const size of sizes) {
          await page.setViewportSize(size);
          await canvasControls(page, c, info, String(size.width));
          await choose(
            page,
            background,
            c,
            'gallery.videoReview.backgroundSolid',
            'gallery.videoReview.background'
          );
          await segmentFit(
            background
              .locator('[data-ui="shared.ui.compact-inspector.segmented-field"]')
              .filter({ hasText: tr(c, 'gallery.videoReview.backgroundType') }),
            [
              tr(c, 'gallery.videoReview.backgroundNone'),
              tr(c, 'gallery.videoReview.backgroundSolid'),
              tr(c, 'gallery.videoReview.backgroundImage'),
            ]
          );
          await numericControls(page, background, c, info, String(size.width));
        }
        const before = await inspector.boundingBox();
        const handle = await ui(page, 'gallery.videoReview.resizeInspector').boundingBox();
        if (!before || !handle) throw new Error('Inspector resize owner unavailable');
        await page.mouse.move(handle.x + handle.width / 2, handle.y + 12);
        await page.mouse.down();
        await page.mouse.move(handle.x + handle.width / 2 + before.width - 300, handle.y + 12);
        await page.mouse.up();
        await canvasControls(page, c, info, 'narrow');
        await clearControl(page, inspector, c, info);
      } catch (error) {
        if (page && !page.isClosed())
          await page.screenshot({ path: info.outputPath('failure-ui.png'), fullPage: false });
        throw error;
      } finally {
        await closeExtensionBrowser(launched, { removeUserDataDir: true });
      }
    });
  }
