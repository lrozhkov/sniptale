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
  await expect(inspector).toHaveCSS('width', '330px');
  await named(inspector, c, 'gallery.videoReview.scene').click();
  await page.mouse.move(0, 0);
  const disclosure = inspector
    .locator('[data-ui="gallery.videoReview.disclosure"] > summary')
    .first();
  await expect(disclosure).toHaveCSS('font-weight', '500');
  const heading = disclosure.locator('h3, h4');
  await expect(heading).toHaveCSS('font-weight', '500');
  expect(await heading.evaluate((node) => getComputedStyle(node).color)).toBe(
    await disclosure.evaluate((node) => getComputedStyle(node).color)
  );
  const secondary = await disclosure.evaluate((node) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--sniptale-color-text-secondary)';
    node.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(disclosure).toHaveCSS('color', secondary);
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
  await capture(page, info, `inspector-before-${suffix}`);
  const format = named(canvas, c, 'videoEditor.sidebar.canvasFormatLabel');
  const row = format.locator('xpath=ancestor::*[contains(@class,"sniptale-parameter-row")][1]');
  await titleHover(page, row, format);
  await row.locator('.sniptale-parameter-name').click();
  await expect(format).toHaveAttribute('aria-expanded', 'false');
  await format.click();
  await expect(format).toHaveAttribute('aria-expanded', 'true');
  await expect(format).toHaveCSS('height', '32px');
  const options = page.getByRole('option');
  const selected = page.getByRole('option', { selected: true });
  const neighbor = await options.evaluateAll((nodes) => {
    const index = nodes.findIndex((node) => node.getAttribute('aria-selected') === 'true');
    return index + 1 < nodes.length ? index + 1 : index - 1;
  });
  expect(neighbor).toBeGreaterThanOrEqual(0);
  await options.nth(neighbor).hover();
  for (const option of [selected, options.nth(neighbor)]) {
    await expect(option).toHaveCSS('min-height', '32px');
    await expect(option).toHaveCSS('font-size', '13px');
    await expect(option).toHaveCSS('line-height', '18px');
    await expect(option).toHaveCSS('font-weight', '400');
    await expect(option).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  const singleLine = options.filter({
    hasNot: page.locator('.sniptale-select-option-description'),
  });
  for (const option of await singleLine.all()) {
    const label = option.locator('.sniptale-select-value-label-menu');
    if ((await label.count()) && (await label.boundingBox())!.height <= 18)
      await expect(option).toHaveCSS('height', '32px');
  }
  const selectedBox = (await selected.boundingBox())!;
  const neighborBox = (await options.nth(neighbor).boundingBox())!;
  const gap =
    selectedBox.y < neighborBox.y
      ? neighborBox.y - selectedBox.y - selectedBox.height
      : selectedBox.y - neighborBox.y - neighborBox.height;
  expect(gap).toBeGreaterThanOrEqual(2);
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

type EditAppearance = { borderWidth: string; borderColor: string; background: string };

async function editAppearance(control: Locator): Promise<EditAppearance> {
  return control.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      borderWidth: style.borderTopWidth,
      borderColor: style.borderTopColor,
      background: style.backgroundColor,
    };
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
      thumbBottom: track.top + track.height / 2 + 7,
      rowBottom: box.bottom,
      textToThumb: (() => {
        const text = document.createRange();
        text.selectNodeContents(node.querySelector('.sniptale-parameter-name')!);
        return track.top + track.height / 2 - 7 - text.getBoundingClientRect().bottom;
      })(),
    };
  });
  expect(geometry.hitHeight).toBe(8);
  expect(geometry.thumbSize).toBe(14);
  expect(geometry.trackHeight).toBe(3);
  expect(geometry.contained).toBe(true);
  expect(geometry.textAboveStrip).toBe(true);
  expect(geometry.textToThumb).toBeGreaterThanOrEqual(2);
  expect(geometry.thumbBottom).toBeLessThan(geometry.rowBottom + 4);
  await expect(field).toHaveCSS('height', '32px');
  await expect(shell).not.toHaveAttribute('aria-hidden', 'true');
  const stepper = row.locator('[data-ui="shared.ui.compact-inspector.numeric-stepper"]');
  await expect(stepper).toHaveCSS('width', '20px');
  const idleEdge = await textEdge(field);
  const bounds = await row.boundingBox();
  if (!bounds) throw new Error('Numeric row bounds unavailable');
  expect(Math.abs(bounds.x + bounds.width - idleEdge - 16)).toBeLessThanOrEqual(2);
  const entry = field.locator('.sniptale-numeric-entry');
  expect((await entry.boundingBox())!.width).toBeLessThanOrEqual(96);
  const increase = stepper.getByRole('button').first();
  await entry.hover();
  await increase.hover();
  await expect(increase).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const stepperBounds = (await stepper.boundingBox())!;
  expect(stepperBounds.x - idleEdge).toBeGreaterThanOrEqual(2);
  expect(stepperBounds.x - idleEdge).toBeLessThanOrEqual(6);
  expect(stepperBounds.x + stepperBounds.width).toBeCloseTo(bounds.x + bounds.width + 8, 0);
  expect(stepperBounds.x + stepperBounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const scroll = ui(page, 'gallery.videoReview.inspector').locator('.review-inspector-scroll');
  expect(await scroll.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  const unit = entry.locator(':scope > span');
  await expect(unit).toBeVisible();
  const unitText = await unit.innerText();
  const idleUnitBounds = (await unit.boundingBox())!;
  const idleEntryBounds = (await entry.boundingBox())!;
  await entry.click({ position: { x: 3, y: 10 } });
  await expect(input).toBeFocused();
  await expect(unit).toBeVisible();
  await expect(unit).toHaveText(unitText);
  expect(await input.inputValue()).not.toContain(unitText);
  const editingGeometry = await input.evaluate((node) => {
    const style = getComputedStyle(node);
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = style.font;
    const box = node.getBoundingClientRect();
    const entry = node.parentElement!.getBoundingClientRect();
    return {
      inputWidth: box.width,
      fiveDigits: context.measureText('00000').width,
      entryLeft: entry.left,
      entryRight: entry.right,
      entryWidth: entry.width,
    };
  });
  expect(editingGeometry.inputWidth).toBeGreaterThanOrEqual(editingGeometry.fiveDigits - 1);
  expect(editingGeometry.entryWidth).toBeLessThan(100);
  expect(editingGeometry.entryLeft).toBeLessThan(idleEntryBounds.x);
  expect(
    Math.abs(editingGeometry.entryRight - idleEntryBounds.x - idleEntryBounds.width)
  ).toBeLessThanOrEqual(1);
  const focusedUnitBounds = (await unit.boundingBox())!;
  expect(
    Math.abs(
      focusedUnitBounds.x + focusedUnitBounds.width - idleUnitBounds.x - idleUnitBounds.width
    )
  ).toBeLessThanOrEqual(1);
  await info.attach(`numeric-editing-${suffix}`, {
    body: JSON.stringify({ idleEntryBounds, idleUnitBounds, focusedUnitBounds, editingGeometry }),
    contentType: 'application/json',
  });
  const numericAppearance = await editAppearance(entry);
  expect(numericAppearance.borderWidth).toBe('1px');
  expect(numericAppearance.borderColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(numericAppearance.background).not.toBe('rgba(0, 0, 0, 0)');
  await capture(page, info, `numeric-editing-${suffix}`);
  await expect(entry).toHaveCSS('outline-style', 'none');
  expect(Math.abs((await textEdge(field)) - idleEdge)).toBeLessThanOrEqual(2);
  await input.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(entry).toHaveCSS('outline-width', '1px');
  const initial = await input.inputValue();
  expect(await input.evaluate((node) => node.selectionEnd! - node.selectionStart!)).toBe(
    initial.length
  );
  await input.fill('123456');
  const longDraftGeometry = await input.evaluate((node) => {
    const style = getComputedStyle(node);
    const unit = node.parentElement!.querySelector('span')!.getBoundingClientRect();
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = style.font;
    return {
      padding: Number.parseFloat(style.paddingInlineStart),
      oneDigit: context.measureText('0').width,
      unitRight: unit.right,
      contentWidth:
        node.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight),
      sixDigits: context.measureText('123456').width,
    };
  });
  expect(longDraftGeometry.padding).toBeGreaterThanOrEqual(longDraftGeometry.oneDigit - 1);
  expect(longDraftGeometry.contentWidth).toBeGreaterThanOrEqual(longDraftGeometry.sixDigits - 1);
  expect(
    Math.abs(longDraftGeometry.unitRight - idleUnitBounds.x - idleUnitBounds.width)
  ).toBeLessThanOrEqual(1);
  await info.attach(`numeric-long-draft-${suffix}`, {
    body: JSON.stringify(longDraftGeometry),
    contentType: 'application/json',
  });
  await input.press('Escape');
  await row.locator('.sniptale-parameter-name').click();
  await expect(input).not.toBeFocused();
  const color = background.locator('[data-ui="shared.ui.compact-inspector.color-field"]').filter({
    hasText: tr(c, 'gallery.videoReview.backgroundShadowColor'),
  });
  const value = color.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
  await color.locator('.sniptale-parameter-name').click();
  await expect(color.locator('input')).toHaveCount(0);
  await expect(value).toBeVisible();
  await value.hover();
  const valueBounds = (await value.boundingBox())!;
  await page.mouse.move(
    valueBounds.x + valueBounds.width / 2,
    valueBounds.y + valueBounds.height / 2
  );
  await page.mouse.down();
  expect(await editAppearance(value)).toEqual(numericAppearance);
  await page.screenshot({
    path: info.outputPath(`color-activation-${suffix}.png`),
    fullPage: false,
  });
  await page.mouse.up();
  const colorInput = color.locator('input');
  await expect(colorInput).toBeFocused();
  const colorEntry = colorInput.locator('..');
  // Native text editing can match :focus-visible after pointer activation.
  await expect(colorEntry).toHaveCSS('outline-width', '1px');
  await expect(colorInput).toHaveCSS('outline-style', 'none');
  expect(await editAppearance(colorEntry)).toEqual(numericAppearance);
  await capture(page, info, `color-editing-${suffix}`);
  await colorInput.press('Escape');
  await value.press('Enter');
  await expect(colorInput).toBeFocused();
  await expect(colorInput.locator('..')).toHaveCSS('outline-width', '1px');
  await colorInput.press('Escape');
  await expect(color).toHaveAttribute('data-layout', 'inline');
  await checkMixedRhythm(background, c);
  const swatch = color.locator('[data-ui="shared.ui.color-selector.picker-trigger"]');
  await expect(swatch).toHaveCSS('width', '32px');
  await expect(swatch).toHaveCSS('height', '32px');
  await expect(swatch.locator(':scope > span')).toHaveCSS('width', '16px');
  await expect(swatch.locator(':scope > span')).toHaveCSS('height', '16px');
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
  return numericAppearance;
}

async function checkMixedRhythm(background: Locator, c: Composition) {
  const keys: TranslationKey[] = [
    'gallery.videoReview.backgroundPadding',
    'gallery.videoReview.backgroundCornerRadius',
    'gallery.videoReview.backgroundShadow',
    'gallery.videoReview.backgroundShadowColor',
  ];
  const positions = [];
  for (const key of keys) {
    const name = background.getByText(tr(c, key), { exact: true });
    const geometry = await name.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const text = range.getBoundingClientRect();
      const row = node.closest('.sniptale-parameter-row')!;
      return { top: text.top, left: text.left, height: row.getBoundingClientRect().height };
    });
    positions.push(geometry);
  }
  for (let index = 0; index < positions.length; index++) {
    expect(positions[index]!.height).toBeCloseTo(40, 0);
    expect(positions[index]!.left).toBeCloseTo(positions[0]!.left, 0);
    if (index) expect(positions[index]!.top - positions[index - 1]!.top).toBeCloseTo(44, 0);
  }
}

async function remainingSceneControls(
  page: Page,
  inspector: Locator,
  background: Locator,
  c: Composition,
  info: TestInfo
) {
  expect((await inspector.boundingBox())!.width).toBeGreaterThanOrEqual(320);
  const captions = ui(page, 'gallery.videoReview.captionScene').getByRole('switch', {
    name: tr(c, 'gallery.videoReview.captionsEnabled'),
    exact: true,
  });
  await expect(captions).toBeEnabled();
  const captionName = ui(page, 'gallery.videoReview.captionScene')
    .locator('.sniptale-parameter-name')
    .first();
  expect((await captionName.boundingBox())!.height).toBe(32);
  const checked = await captions.getAttribute('aria-checked');
  await captions.click();
  await expect(captions).toHaveAttribute('aria-checked', checked === 'true' ? 'false' : 'true');
  await captions.click();
  await expect(captions).toHaveAttribute('aria-checked', checked!);
  const header = ui(page, 'window-header-settings');
  const headerRows = header.locator(
    ':scope > [data-ui="shared.ui.compact-inspector.segmented-field"]'
  );
  const geometry = await headerRows.evaluateAll((rows) =>
    rows.map((row) => {
      const name = row.querySelector('.sniptale-parameter-name')!;
      const range = document.createRange();
      range.selectNodeContents(name);
      return {
        layout: row.getAttribute('data-layout'),
        top: range.getBoundingClientRect().top,
        height: row.getBoundingClientRect().height,
      };
    })
  );
  for (let index = 1; index < geometry.length; index++)
    expect(geometry[index]!.top - geometry[index - 1]!.top).toBeCloseTo(
      geometry[index - 1]!.height + 4,
      0
    );
  await headerRows.first().scrollIntoViewIfNeeded();
  await capture(page, info, 'header-repaired');
  const presentation = ui(page, 'gallery.videoReview.presentationInspector');
  const segments = presentation.locator('.sniptale-parameter-unlabelled');
  await expect(segments).toHaveCount(2);
  for (const segment of await segments.all()) {
    const inset = await segment.evaluate((node) => {
      const value = node.querySelector('.sniptale-property-choice')!;
      return value.getBoundingClientRect().left - node.parentElement!.getBoundingClientRect().left;
    });
    expect(inset).toBeCloseTo(8, 0);
  }
  await segments.first().scrollIntoViewIfNeeded();
  await capture(page, info, 'presentation-repaired');
  const cursor = ui(page, 'cursorFocusPath.settings');
  await cursor.scrollIntoViewIfNeeded();
  const choices = cursor.locator('.sniptale-property-choice');
  const widths = await choices.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().width)
  );
  expect(widths.length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  const cursorNames = cursor.locator(
    '[data-ui="shared.ui.compact-inspector.segmented-field"] > .sniptale-parameter-name'
  );
  const cursorRows = await cursorNames.evaluateAll((nodes) =>
    nodes.slice(0, 3).map((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return {
        top: range.getBoundingClientRect().top,
        height: node.parentElement!.getBoundingClientRect().height,
      };
    })
  );
  for (let index = 1; index < cursorRows.length; index++)
    expect(cursorRows[index]!.top - cursorRows[index - 1]!.top).toBeCloseTo(
      cursorRows[index - 1]!.height + 4,
      0
    );
  await capture(page, info, 'cursor-repaired');
  await choose(
    page,
    background,
    c,
    'gallery.videoReview.backgroundImage',
    'gallery.videoReview.background'
  );
  const picker = background.locator('[data-ui="background.image.picker"]');
  await picker.scrollIntoViewIfNeeded();
  const edges = await picker.evaluate((node) => {
    const row = node.parentElement!.querySelector('.sniptale-parameter-row')!;
    const first = node.firstElementChild!;
    return {
      left: first.getBoundingClientRect().left,
      right:
        node.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(node).paddingRight),
      rowLeft:
        row.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(row).paddingLeft),
      rowRight:
        row.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(row).paddingRight),
    };
  });
  expect(edges.left).toBeCloseTo(edges.rowLeft, 0);
  expect(edges.right).toBeCloseTo(edges.rowRight, 0);
  await capture(page, info, 'background-image-repaired');
}

async function clearControl(
  page: Page,
  inspector: Locator,
  c: Composition,
  info: TestInfo,
  numericAppearance: EditAppearance
) {
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
  await expect(input).toHaveCSS('height', '32px');
  await expect(input).toHaveCSS('font-weight', '400');
  await expect(input).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(input).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await expect(input).toHaveCSS('padding-right', '8px');
  await input.hover();
  await expect(input).toHaveCSS('padding-right', '28px');
  await expect(clear).toHaveCSS('cursor', 'pointer');
  await expect(input).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(input).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  expect(await editAppearance(input)).toEqual(numericAppearance);
  await expect(clear).toHaveCSS('opacity', '1');
  await input.focus();
  await page.keyboard.press('Tab');
  await expect(clear).toBeFocused();
  await expect(clear).toHaveCSS('opacity', '1');
  await page.keyboard.press('Shift+Tab');
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS('outline-width', '1px');
  const focusPaint = await input.evaluate((node) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--sniptale-color-border-strong)';
    node.parentElement!.appendChild(probe);
    const neutral = getComputedStyle(probe).color;
    probe.remove();
    return { actual: getComputedStyle(node).outlineColor, neutral };
  });
  expect(focusPaint.actual).toBe(focusPaint.neutral);
  await page.keyboard.press('Tab');
  await expect(clear).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await input.fill('A retained browser title');
  await clear.click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await capture(page, info, 'clear-narrow');
  await expect(input).toHaveAttribute('placeholder', tr(c, 'windowHeader.tabTitle'));
  const address = header.getByRole('textbox', { name: tr(c, 'windowHeader.address'), exact: true });
  await address.fill('');
  await address.press('Enter');
  await expect(address).toHaveAttribute('placeholder', 'example.com');
  const hint = await address.evaluate((node) => {
    const style = getComputedStyle(node, '::placeholder');
    const channels = (color: string) => color.match(/[\d.]+/gu)?.map(Number) ?? [];
    const layers: number[][] = [];
    for (let element: Element | null = node; element; element = element.parentElement)
      layers.push(channels(getComputedStyle(element).backgroundColor));
    const background = layers.reverse().reduce(
      (base, layer) => {
        const alpha = layer[3] ?? 1;
        return base.map((channel, index) => (layer[index] ?? 0) * alpha + channel * (1 - alpha));
      },
      [255, 255, 255]
    );
    const luminance = (rgb: number[]) =>
      rgb.reduce((sum, channel, index) => {
        const value = channel / 255;
        return (
          sum +
          (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
            ([0.2126, 0.7152, 0.0722][index] ?? 0)
        );
      }, 0);
    const text = luminance(channels(style.color).slice(0, 3));
    const surface = luminance(background);
    const contrast = (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
    return {
      color: style.color,
      background,
      contrast,
      opacity: style.opacity,
      fontStyle: style.fontStyle,
    };
  });
  await info.attach(`placeholder-${c.theme}`, {
    body: JSON.stringify(hint),
    contentType: 'application/json',
  });
  expect(hint.contrast).toBeGreaterThanOrEqual(4.5);
  expect(hint.opacity).toBe('1');
  expect(hint.fontStyle).toBe('italic');
  await expect(address).toHaveCSS('font-style', 'normal');
  for (const width of [800, 320]) {
    await page.setViewportSize(sizes[1]!);
    const bounds = await inspector.boundingBox();
    const handle = await ui(page, 'gallery.videoReview.resizeInspector').boundingBox();
    if (!bounds || !handle) throw new Error('Inspector resize owner unavailable');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 12);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + bounds.width - width, handle.y + 12);
    await page.mouse.up();
    await address.scrollIntoViewIfNeeded();
    const addressRow = address.locator(
      'xpath=ancestor::*[contains(@class,"sniptale-parameter-row")][1]'
    );
    const file = named(header, c, 'windowHeader.fileIcon');
    const site = named(header, c, 'windowHeader.favicon');
    await expect
      .poll(async () => {
        const rowBox = await addressRow.boundingBox();
        const fileBox = await file.boundingBox();
        return rowBox && fileBox
          ? Math.abs(rowBox.x + rowBox.width - 8 - fileBox.x - fileBox.width)
          : Infinity;
      })
      .toBeLessThanOrEqual(1);
    const inputBox = await address.boundingBox();
    const siteBox = await site.boundingBox();
    const fileBox = await file.boundingBox();
    if (!inputBox || !siteBox || !fileBox) throw new Error('Address controls unavailable');
    expect(Math.abs(inputBox.y - siteBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(siteBox.y - fileBox.y)).toBeLessThanOrEqual(1);
    expect(siteBox.x - inputBox.x - inputBox.width).toBeLessThanOrEqual(8);
    if (width === 800) expect(inputBox.width).toBeGreaterThan(250);
    await capture(page, info, `address-${width}`);
  }
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
        let numericAppearance: EditAppearance | undefined;
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
          numericAppearance = await numericControls(page, background, c, info, String(size.width));
        }
        const before = await inspector.boundingBox();
        const handle = await ui(page, 'gallery.videoReview.resizeInspector').boundingBox();
        if (!before || !handle) throw new Error('Inspector resize owner unavailable');
        await page.mouse.move(handle.x + handle.width / 2, handle.y + 12);
        await page.mouse.down();
        await page.mouse.move(handle.x + handle.width / 2 + before.width - 320, handle.y + 12);
        await page.mouse.up();
        await canvasControls(page, c, info, 'narrow');
        await clearControl(page, inspector, c, info, numericAppearance!);
        await remainingSceneControls(page, inspector, background, c, info);
      } catch (error) {
        if (page && !page.isClosed())
          await page.screenshot({ path: info.outputPath('failure-ui.png'), fullPage: false });
        throw error;
      } finally {
        await closeExtensionBrowser(launched, { removeUserDataDir: true });
      }
    });
  }
