import { numericControl } from '../support/inspector-numeric';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { translate } from '../support/catalog-fixture';
import { startHostServer } from '../support/host-server';
import {
  addReviewFocus,
  seedReviewHistory,
  seedReviewWebcamBundle,
} from '../support/quick-editor-media-fixture';

const fieldSelector = [
  'input:not([type="hidden"]):not([type="file"])',
  'textarea',
  'select',
  '[role="switch"]',
  '[role="radiogroup"]',
  '[data-ui="shared.ui.compact-inspector.segmented-row"]',
  'button[aria-haspopup="listbox"]',
  'button[data-ui*="color-selector"]',
  'button[data-ui="shared.ui.paint-selector.trigger"]',
].join(',');

function inspectFields(panel: Locator) {
  return panel.locator(fieldSelector).evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      if (!node.getClientRects().length || node.closest('[hidden]')) return [];
      const style = getComputedStyle(node);
      const row = node.closest('.sniptale-parameter-row');
      const label = row?.querySelector('.sniptale-parameter-name')?.textContent?.trim();
      return [
        {
          label:
            node.getAttribute('aria-label') ||
            label ||
            node.getAttribute('placeholder') ||
            node.textContent?.trim(),
          kind:
            node.getAttribute('role') || node.getAttribute('type') || node.tagName.toLowerCase(),
          id: node.getAttribute('data-ui') || row?.getAttribute('data-ui'),
          value:
            node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
              ? node.value
              : undefined,
          disabled: node.matches(':disabled, [aria-disabled="true"]'),
          background: style.backgroundColor,
          border: style.borderTopColor,
          radius: style.borderRadius,
          fontWeight: style.fontWeight,
          width: Math.round(node.getBoundingClientRect().width),
          height: Math.round(node.getBoundingClientRect().height),
        },
      ];
    })
  );
}

async function capture(page: Page, inspector: Locator, info: TestInfo, route: string) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  const scrolls = inspector.locator(':is([role="tabpanel"], .review-inspector-scroll):visible');
  const scrollIndex = await scrolls.evaluateAll(
    (nodes) =>
      nodes.reduce(
        (best, node, index) =>
          node.scrollHeight - node.clientHeight > best.distance
            ? { index, distance: node.scrollHeight - node.clientHeight }
            : best,
        { index: -1, distance: 0 }
      ).index
  );
  const owner = scrollIndex >= 0 ? scrolls.nth(scrollIndex) : inspector;
  await owner.evaluate((element) => {
    element.scrollTop = 0;
  });
  const fields = await inspectFields(inspector);
  const sections = await inspector.locator('summary:visible').allTextContents();
  await page.screenshot({
    path: info.outputPath(`${route}.png`),
    animations: 'disabled',
    fullPage: false,
  });
  const geometry = await owner.evaluate((node) => ({
    view: node.clientHeight,
    total: node.scrollHeight,
  }));
  const distance = geometry.total - geometry.view;
  const step = Math.max(48, Math.floor(geometry.view * 0.85));
  for (let offset = step, index = 1; scrollIndex >= 0 && distance > 4; offset += step, index++) {
    await owner.evaluate(
      (element, top) => {
        element.scrollTop = top;
      },
      Math.min(offset, distance)
    );
    await page.screenshot({
      path: info.outputPath(`${route}-scroll-${index}.png`),
      animations: 'disabled',
      fullPage: false,
    });
    if (offset >= distance) break;
  }
  await owner.evaluate((element) => {
    element.scrollTop = 0;
  });
  await writeFile(
    info.outputPath(`${route}.json`),
    JSON.stringify({ route, sections, fields }, null, 2)
  );
}

async function captureSections(page: Page, inspector: Locator, info: TestInfo, route: string) {
  const closed = inspector.locator('details:not([open]) > summary:visible');
  for (let count = 0; count < 30 && (await closed.count()); count++) await closed.first().click();
  await capture(page, inspector, info, route);
  const navigation = inspector
    .locator('[data-ui="gallery.videoReview.inspectorSectionNavigation"]:visible')
    .first();
  const tabs = navigation.locator('[data-inspector-tab-motion]');
  for (const [index, id] of (
    await tabs.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-inspector-tab-motion'))
    )
  ).entries()) {
    const tab = tabs.nth(index).getByRole('tab');
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
    for (let count = 0; count < 30 && (await closed.count()); count++) await closed.first().click();
    await capture(page, inspector, info, `${route}-${id}`);
  }
}

async function captureTracks(
  page: Page,
  review: Locator,
  inspector: Locator,
  info: TestInfo,
  mode: string
) {
  const headers = review.locator(
    '[data-review-header-track]:has([data-review-track-select]:enabled)'
  );
  const tracks = await headers.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-review-header-track'))
  );
  for (const track of tracks) {
    const header = review.locator(
      `[data-review-header-track="${track}"] [data-review-track-select]`
    );
    try {
      await header.click({ timeout: 3500 });
      await captureSections(page, inspector, info, `${mode}-${track}`);
      const listTab = inspector.locator('[data-inspector-tab-motion="list"]:visible').first();
      if (await listTab.count()) await listTab.getByRole('tab').click();
      const items = inspector.locator('.review-track-items-open:visible');
      const itemCount = await items.count();
      for (let index = 0; index < itemCount; index++) {
        if (index > 0) {
          await header.click();
          if (await listTab.count()) await listTab.getByRole('tab').click();
        }
        await items.nth(index).click({ timeout: 3500 });
        await captureSections(page, inspector, info, `${mode}-${track}-item-${index + 1}`);
      }
    } catch (error) {
      await writeFile(info.outputPath(`gap-${mode}-${track}.txt`), String(error));
    }
  }
}

async function captureCommands(
  page: Page,
  review: Locator,
  inspector: Locator,
  info: TestInfo,
  mode: string
) {
  for (const [name, selector] of [
    ['preview', 'previewSettings'],
    ['export', 'openExport'],
  ]) {
    const command = review.locator(`[data-ui="gallery.videoReview.${selector}"]`);
    if (!(await command.isVisible())) continue;
    await command.click();
    await captureSections(page, inspector, info, `${mode}-${name}`);
  }
}

async function captureSourceEdits(page: Page, review: Locator, inspector: Locator, info: TestInfo) {
  const plane = review.locator('[data-ui="gallery.videoReview.timePlane"]');
  const duration = Number(await plane.getAttribute('aria-valuemax'));
  const ruler = plane.locator('[data-ui="gallery.videoReview.ruler"]');
  const button = (key: Parameters<typeof translate>[0]) =>
    review.getByRole('button', { name: translate(key, 'en'), exact: true });
  for (const [route, key, start, end] of [
    ['cut', 'gallery.videoReview.cutMode', 2, 4],
    ['speed', 'gallery.videoReview.speedMode', 6, 8],
  ] as const) {
    await ruler.scrollIntoViewIfNeeded();
    const box = (await ruler.boundingBox())!;
    const y = box.y + 12;
    await page.mouse.move(box.x + (box.width * start) / duration, y);
    await page.mouse.down();
    await page.mouse.move(box.x + (box.width * end) / duration, y, { steps: 8 });
    await page.mouse.up();
    await button(key).click();
    await expect(review.locator('[data-ui="gallery.videoReview.feedback"]')).toBeHidden();
    await captureSections(page, inspector, info, `quick-source-item-${route}`);
  }
}

async function captureSourceVariants(
  page: Page,
  review: Locator,
  inspector: Locator,
  info: TestInfo
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  await review.locator('[data-review-header-track="source"] [data-review-track-select]').click();
  const tab = (name: string) =>
    inspector.locator(`[data-inspector-tab-motion="${name}"]:visible`).getByRole('tab');
  await tab('background').click();
  const background = inspector.locator('[data-ui="gallery.videoReview.backgroundInspector"]');
  await background
    .getByRole('button', { name: label('gallery.videoReview.backgroundSolid'), exact: true })
    .click();
  await expectSharedSegments(
    background.getByRole('group', {
      name: label('gallery.videoReview.background'),
      exact: true,
    })
  );
  await expectSharedSegments(
    background.getByRole('group', {
      name: label('gallery.videoReview.backgroundZoom'),
      exact: true,
    })
  );
  await expectExactNumber(
    numericControl(background, label('gallery.videoReview.backgroundShadow'))
  );
  await capture(page, inspector, info, 'advanced-source-background-solid');
  const radius = background.getByRole('textbox', {
    name: label('gallery.videoReview.backgroundCornerRadius'),
    exact: true,
  });
  const radiusRow = radius.locator(
    'xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.numeric-row"]'
  );
  const unit = radiusRow.locator('.sniptale-numeric-unit');
  const unitBefore = (await unit.boundingBox())!;
  const inputBefore = (await radius.boundingBox())!;
  await radius.click();
  await expect(radius).toBeFocused();
  expect(Math.abs((await unit.boundingBox())!.x - unitBefore.x)).toBeLessThanOrEqual(1);
  expect(Math.abs((await radius.boundingBox())!.x - inputBefore.x)).toBeLessThanOrEqual(1);
  await expect(unit).toHaveCSS(
    'color',
    await unit.evaluate((element) => {
      const sample = document.createElement('span');
      sample.style.color = 'var(--sniptale-color-text-secondary)';
      element.append(sample);
      const color = getComputedStyle(sample).color;
      sample.remove();
      return color;
    })
  );
  await page.screenshot({
    path: info.outputPath('advanced-source-background-radius-active.png'),
    animations: 'disabled',
    fullPage: false,
  });
  await radius.press('Escape');
  await background.locator('.sniptale-paint-swatch-trigger').first().click();
  const paint = page.locator('[data-ui="shared.ui.paint-selector.popup"]');
  await expect(paint).toBeVisible();
  await paint
    .getByRole('button', { name: label('highlighter.paintPicker.gradient'), exact: true })
    .click();
  await capture(page, paint, info, 'advanced-source-background-gradient-picker');
  await page.keyboard.press('Escape');
  await expect(paint).toBeHidden();
  await tab('watermark').click();
  const watermark = inspector.locator('[data-ui="gallery.videoReview.watermarkInspector"]');
  await watermark
    .getByRole('button', { name: label('gallery.videoReview.watermarkText'), exact: true })
    .click();
  await expect(watermark.getByRole('textbox').first()).toBeVisible();
  await expectExactNumber(
    watermark.getByRole('textbox', {
      name: label('gallery.videoReview.watermarkSize'),
      exact: true,
    })
  );
  await capture(page, inspector, info, 'advanced-source-watermark-text');
  const precisePosition = watermark
    .locator('details')
    .filter({
      has: page.locator('summary', {
        hasText: label('gallery.videoReview.watermarkPositionExact'),
      }),
    })
    .last();
  const positionSummary = precisePosition.locator('summary');
  if (!(await positionSummary.isVisible())) {
    await watermark
      .getByText(label('gallery.videoReview.watermarkAdvanced'), { exact: true })
      .click();
  }
  if (!(await precisePosition.evaluate((element: HTMLDetailsElement) => element.open))) {
    await positionSummary.click();
  }
  for (const key of ['watermarkMargin', 'watermarkX', 'watermarkY'] as const) {
    await expectExactNumber(
      watermark.getByRole('textbox', {
        name: label(`gallery.videoReview.${key}`),
        exact: true,
      })
    );
  }
  await capture(page, inspector, info, 'advanced-source-watermark-precise-position');
  await addWatermarkImage(watermark);
  await capture(page, inspector, info, 'advanced-source-watermark-image');
  await tab('window-header').click();
  const header = inspector.locator('[data-ui="gallery.videoReview.windowHeader"]');
  const browser = header.getByRole('button', { name: label('windowHeader.browser'), exact: true });
  if (await browser.isVisible()) await browser.click();
  else {
    await header.getByRole('button', { name: label('windowHeader.type'), exact: true }).click();
    await page.getByRole('option', { name: label('windowHeader.browser'), exact: true }).click();
  }
  await expectSharedSegments(
    header.getByRole('group', {
      name: label('windowHeader.style'),
      exact: true,
    })
  );
  for (const key of ['windowHeader.tabTitle', 'windowHeader.address'] as const) {
    const field = header.getByRole('textbox', { name: label(key), exact: true });
    await field.scrollIntoViewIfNeeded();
    await expectStackedLabelGap(field.locator('xpath=ancestor::*[@data-layout="stacked"]'));
    await expect(field).toHaveCSS('height', '32px');
    await expect(field).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    await expect(field).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await capture(page, inspector, info, 'advanced-source-window-header-browser');
  await tab('presentation').click();
  const presentation = inspector.locator('[data-ui="gallery.videoReview.presentationInspector"]');
  for (const phase of ['presentationFadeIn', 'presentationFadeOut'] as const) {
    const mode = presentation.getByRole('button', {
      name: label(`gallery.videoReview.${phase}`),
      exact: true,
    });
    await mode.click();
    await expectSharedSegments(mode.locator('..'));
  }
  for (const duration of await presentation
    .getByRole('textbox', {
      name: label('gallery.videoReview.presentationDuration'),
      exact: true,
    })
    .all()) {
    await expectExactNumber(duration);
  }
  await capture(page, inspector, info, 'advanced-source-presentation-both-fades');
  await tab('source-filters').click();
  const filters = inspector.locator('[data-ui="shared.ui.source-image-filter-fields"]');
  for (const add of await filters
    .getByRole('group', { name: label('videoEditor.sidebar.sourceFiltersAdd') })
    .getByRole('button')
    .all())
    await add.click();
  await capture(page, inspector, info, 'advanced-source-filters-enabled');
}

async function expectSharedSegments(group: Locator) {
  await expect(group).toHaveClass(/sniptale-framed-segments/);
  await expect(group).toHaveCSS('padding', '2px');
  await expect(group.getByRole('button').first()).toHaveCSS('min-height', '26px');
  const row = group.locator(
    'xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.segmented-field"]'
  );
  if ((await row.count()) && (await row.getAttribute('data-layout')) === 'stacked') {
    await expectStackedLabelGap(row);
  }
}

async function expectStackedLabelGap(row: Locator) {
  const name = row.locator(':scope > .sniptale-parameter-name > span:first-child');
  const value = row.locator(':scope > .sniptale-parameter-value');
  const labelBox = (await name.boundingBox())!;
  const controlBox = (await value.boundingBox())!;
  expect(Math.abs(controlBox.y - labelBox.y - labelBox.height - 4)).toBeLessThanOrEqual(1);
}

async function expectExactNumber(field: Locator) {
  const row = field.locator(
    'xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.numeric-row"]'
  );
  await expect(row.locator('[data-stepper-placement="sides"]')).toBeVisible();
  await field.hover();
  await expect(row.locator('input[type="range"]')).toHaveCount(0);
}

async function captureImportedAudio(
  page: Page,
  review: Locator,
  inspector: Locator,
  info: TestInfo
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  const toolbar = review.locator('[data-ui="gallery.videoReview.editingTools"]');
  for (const [lane, key] of [
    ['voiceover', 'gallery.videoReview.audioImport'],
    ['music', 'gallery.videoReview.musicLibrary'],
  ] as const) {
    await review.locator(`[data-review-header-track="${lane}"] [data-review-track-select]`).click();
    await toolbar.getByRole('button', { name: label(key), exact: true }).click();
    const library = page.getByRole('dialog', {
      name: label('gallery.videoReview.musicLibrary'),
      exact: true,
    });
    await library
      .locator('input[type="file"]')
      .setInputFiles('tooling/test/e2e/fixtures/review-voice-speech.wav');
    await expect(library).toBeHidden();
    const clip = review.locator(`[data-audio-lane="${lane}"] [data-audio-id]`).first();
    await clip.click();
    await captureSections(page, inspector, info, `advanced-${lane}-imported-clip`);
  }
}

async function captureAuthoredText(
  page: Page,
  review: Locator,
  inspector: Locator,
  info: TestInfo
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  await review.locator('[data-review-header-track="text"] [data-review-track-select]').click();
  await review
    .getByRole('button', { name: label('gallery.videoReview.textViewCards'), exact: true })
    .click();
  const document = review.locator('[data-ui="gallery.videoReview.textDocument"]');
  await document
    .getByRole('button', {
      name: label('gallery.videoReview.textFragmentAdd'),
      exact: true,
    })
    .click();
  const text = document.getByRole('textbox', {
    name: label('gallery.videoReview.speechText'),
    exact: true,
  });
  await text.fill('First line.\nSecond line.');
  await text.press('Tab');
  await captureSections(page, inspector, info, 'advanced-text-authored-fragment');
  await inspector.locator('[data-inspector-tab-motion="list"]:visible').getByRole('tab').click();
  await document.locator('[data-text-voice-trigger="subtitles:all"]:visible').first().click();
  const subtitles = inspector.locator('[data-ui="gallery.videoReview.textSubtitles"]');
  await expect(subtitles).toBeVisible();
  await capture(page, inspector, info, 'advanced-text-subtitle-export');
  await subtitles
    .getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
    .click();
}

async function captureZoomLink(page: Page, review: Locator, inspector: Locator, info: TestInfo) {
  const plane = review.locator('[data-ui="gallery.videoReview.timePlane"]');
  const ruler = plane.locator('[data-ui="gallery.videoReview.ruler"]');
  const duration = Number(await plane.getAttribute('aria-valuemax'));
  for (const seconds of [1, 5]) {
    await ruler.scrollIntoViewIfNeeded();
    const box = (await ruler.boundingBox())!;
    await page.mouse.click(box.x + (box.width * seconds) / duration, box.y + 12);
    await expect
      .poll(async () => Number(await plane.getAttribute('aria-valuenow')))
      .toBeCloseTo(seconds, 0);
    await addReviewFocus(page, 'en');
  }
  const lane = review.locator('[data-ui="gallery.videoReview.zoomLane"]');
  const regions = lane.locator('[role="button"][aria-pressed]');
  await regions.first().click();
  const link = lane.locator('[data-ui="gallery.videoReview.zoomLink"]');
  await link.click();
  await expect(link).toHaveAttribute('data-connected', 'true');
  await expect(
    inspector.locator('[data-ui="gallery.videoReview.zoomLinkInspector"]')
  ).toBeVisible();
  await captureSections(page, inspector, info, 'advanced-zoom-connection');
  await regions.first().click();
  await regions.last().click({ modifiers: ['Control'] });
  await expect(review.locator('.review-selection-count')).toHaveAttribute(
    'title',
    'Selected items: 2'
  );
  await captureSections(page, inspector, info, 'advanced-zoom-multi-selection');
}

async function captureRecordingReady(
  page: Page,
  review: Locator,
  inspector: Locator,
  info: TestInfo
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  await review.locator('[data-review-header-track="voiceover"] [data-review-track-select]').click();
  await review
    .getByRole('button', {
      name: label('gallery.videoReview.recordVoiceover'),
      exact: true,
    })
    .click();
  const recorder = inspector.locator('[data-ui="gallery.videoReview.voiceoverInspector"]');
  await expect(recorder).toBeVisible();
  await capture(page, inspector, info, 'advanced-voiceover-recording-ready');
}

async function addReviewAnnotation(page: Page, review: Locator, name: string | RegExp = 'Frame') {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  await review
    .locator('[data-review-header-track="annotationEffects"] [data-review-track-select]')
    .click();
  await review
    .getByRole('button', {
      name: label('gallery.videoReview.annotationEffectsAdd'),
      exact: true,
    })
    .click();
  await page.getByRole('option', { name, exact: true }).first().click();
  const lane = review.locator('[data-ui="gallery.videoReview.annotationEffectsLane"]');
  await lane.scrollIntoViewIfNeeded();
  const box = (await lane.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 12, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 3, y, { steps: 8 });
  await page.mouse.up();
  const instance = review.locator('[data-annotation-effect-id]').last();
  await expect(instance).toBeVisible();
  await instance.click();
}

async function addWatermarkImage(watermark: Locator) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  await watermark
    .getByRole('button', { name: label('gallery.videoReview.watermarkImage'), exact: true })
    .click();
  await watermark.locator('input[type="file"]').setInputFiles({
    name: 'static-logo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#5985A3"/></svg>'
    ),
  });
  await expect(watermark.getByRole('img')).toBeVisible();
}

async function checkOpacityField(page: Page, row: Locator, info: TestInfo, name: string) {
  const slider = row.getByRole('slider');
  const pencil = row.getByRole('button');
  const input = row.getByRole('spinbutton');
  await expect(slider).toBeVisible();
  await slider.scrollIntoViewIfNeeded();
  const bounds = (await slider.boundingBox())!;
  const origin = await slider.inputValue();
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(bounds.x + bounds.width * 0.8, y);
  await page.mouse.down();
  try {
    await page.mouse.move(bounds.x + bounds.width * 0.5, y);
    await expect(slider).not.toHaveValue(origin);
    await page.keyboard.press('Escape');
    await page.mouse.move(bounds.x + bounds.width * 0.2, y);
    await expect(slider).toHaveValue(origin);
  } finally {
    await page.mouse.up();
  }
  await expect(slider).toHaveValue(origin);
  await slider.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect.poll(async () => Number(await slider.inputValue())).toBeLessThan(60);
  const value = await slider.evaluate((node: HTMLInputElement) => Number(node.value));
  expect(value).toBeGreaterThan(40);
  expect(value).toBeLessThan(60);
  await slider.press('ArrowUp');
  await expect(slider).toHaveValue(String(value + 1));
  const idleDigits = (await row.locator('.readout-digits').boundingBox())!;
  await slider.evaluate((node: HTMLInputElement) => node.blur());
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: info.outputPath(`opacity-idle-${name}.png`),
    fullPage: false,
  });
  await pencil.click();
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS('border-top-width', '0px');
  expect(Math.abs((await input.boundingBox())!.x - idleDigits.x)).toBeLessThanOrEqual(1);
  await expect(row.locator('button svg.lucide-check')).toBeVisible();
  await expect(input).toHaveValue(String(value + 1));
  await page.screenshot({
    path: info.outputPath(`opacity-exact-edit-${name}.png`),
    animations: 'disabled',
    fullPage: false,
  });
  await pencil.hover();
  await input.evaluate((node) => {
    node.addEventListener(
      'keyup',
      (event) => {
        if (event.key === 'Alt') node.dataset.altReleasePrevented = String(event.defaultPrevented);
      },
      { once: true }
    );
  });
  await page.keyboard.down('Alt');
  try {
    await page.mouse.wheel(0, -80);
    await expect(input).toHaveValue(String(value + 2));
  } finally {
    await page.keyboard.up('Alt');
  }
  await expect(input).toHaveAttribute('data-alt-release-prevented', 'true');
  await expect(input).toBeFocused();
  await input.fill('42');
  await input.press('Enter');
  await expect(slider).toHaveValue('42');
  await expect(pencil).toBeFocused();
  await pencil.click();
  await input.fill('17');
  await input.press('Escape');
  await expect(slider).toHaveValue('42');
  await expect(pencil).toBeFocused();
  await pencil.click();
  await input.fill('41');
  await input.press('Tab');
  await expect(pencil).toBeFocused();
  await pencil.press('Tab');
  await expect(slider).toHaveValue('41');
  if (name === 'watermark') {
    await pencil.click();
    await input.fill('0.14');
    await input.press('ArrowUp');
    await expect(input).toHaveValue('1.14');
    await input.fill('42.5%');
    await input.press('Enter');
    await expect(slider).toHaveValue('42.5');
    await slider.dispatchEvent('pointerdown', { button: 0 });
    await slider.dispatchEvent('pointerup', { button: 0 });
    await expect(slider).toHaveValue('42.5');
    await slider.press('ArrowUp');
    await expect(slider).toHaveValue('43');
  }
}

async function openComparisonReview(
  page: Page,
  origin: string,
  size: { width: number; height: number },
  theme: 'light' | 'dark'
) {
  await page.setViewportSize(size);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': theme },
  });
  await page.goto(`${origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
  await page.locator('[data-ui="gallery.page.root"]').waitFor();
  await seedReviewWebcamBundle(page);
  await seedReviewHistory(page, true, 2, 2);
  await page.reload();
  await page.getByRole('button', { name: 'Screen or window: Screen', exact: true }).click();
  await page.locator('[data-ui="gallery.videoReview.enter"]').click();
  const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
  const inspector = review.locator('[data-ui="gallery.videoReview.inspector"]');
  return { review, inspector };
}

for (const { size, name } of PRIMARY_BROWSER_VIEWPORTS) {
  const theme = size.width === 1280 ? 'light' : 'dark';
  test(`Gallery field comparison ${name} ${theme}`, async ({ page }, info) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(5000);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      const { review, inspector } = await openComparisonReview(page, host.origin, size, theme);
      const mode = review.getByRole('button', {
        name: label('gallery.videoReview.advancedEditing'),
        exact: true,
      });
      await expect(mode).toHaveAttribute('aria-pressed', 'false');
      await captureSections(page, inspector, info, 'quick');
      await captureTracks(page, review, inspector, info, 'quick');
      await captureCommands(page, review, inspector, info, 'quick');
      await mode.click();
      await expect(review.locator('[data-ui="gallery.videoReview.trackControls"]')).toBeVisible();
      await captureSections(page, inspector, info, 'advanced');
      await addReviewFocus(page, 'en');
      await captureSections(page, inspector, info, 'advanced-focus-item');
      await review
        .getByRole('button', { name: label('gallery.videoReview.trackSettings'), exact: true })
        .click();
      await capture(page, review, info, 'advanced-track-settings');
      const webcam = review.locator('[data-review-header-track="webcam"]').getByRole('switch');
      if ((await webcam.isEnabled()) && (await webcam.getAttribute('aria-checked')) === 'false')
        await webcam.click();
      await review
        .getByRole('button', { name: label('gallery.videoReview.trackSettings'), exact: true })
        .click();
      await captureTracks(page, review, inspector, info, 'advanced');
      await captureSourceVariants(page, review, inspector, info);
      await addReviewAnnotation(page, review);
      await captureSections(page, inspector, info, 'advanced-annotation-frame');
      const presets = inspector.getByRole('button', {
        name: label('gallery.videoReview.annotationPresets'),
        exact: true,
      });
      await expect(presets).toHaveCSS('border-top-width', '1px');
      await page.mouse.move(0, 0);
      const idleBorder = await presets.evaluate((node) => getComputedStyle(node).borderTopColor);
      await presets.click();
      await expect(presets).toHaveAttribute('aria-expanded', 'true');
      await expect(presets).toHaveCSS('border-top-color', idleBorder);
      const menu = page.locator(
        `[id="${await presets.getAttribute('aria-controls')}"][role="listbox"]`
      );
      await expect(menu).toBeVisible();
      await page.screenshot({
        path: info.outputPath('advanced-annotation-frame-visual-presets.png'),
        fullPage: false,
      });
      await page.keyboard.press('Escape');
      await expect(presets).toBeFocused();
      await captureCommands(page, review, inspector, info, 'advanced');
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
  test(`Gallery source interval comparison ${name} ${theme}`, async ({ page }, info) => {
    const host = await startHostServer();
    try {
      const { review, inspector } = await openComparisonReview(page, host.origin, size, theme);
      await expect(
        review.getByRole('button', {
          name: translate('gallery.videoReview.advancedEditing', 'en'),
          exact: true,
        })
      ).toHaveAttribute('aria-pressed', 'false');
      await captureSourceEdits(page, review, inspector, info);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
  test(`Gallery opacity editing ${name} ${theme}`, async ({ page }, info) => {
    test.setTimeout(60_000);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      const { review, inspector } = await openComparisonReview(page, host.origin, size, theme);
      await review
        .getByRole('button', {
          name: label('gallery.videoReview.advancedEditing'),
          exact: true,
        })
        .click();
      await review
        .locator('[data-review-header-track="source"] [data-review-track-select]')
        .click();
      await inspector
        .getByRole('tab', {
          name: label('gallery.videoReview.watermark'),
          exact: true,
        })
        .click();
      const watermark = inspector.locator('[data-ui="gallery.videoReview.watermarkInspector"]');
      await addWatermarkImage(watermark);
      await checkOpacityField(page, watermark.locator('.opacity-field'), info, 'watermark');
      await addReviewAnnotation(page, review);
      const placement = inspector
        .locator('[data-inspector-tab-motion="placement"]')
        .getByRole('tab');
      await placement.click();
      const position = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.annotationY'),
        exact: true,
      });
      await expectExactNumber(position);
      // The Frame template starts at 10%. Its measured body has a different top edge.
      await expect(position).not.toHaveValue('10');
      const previous = await position.inputValue();
      const next = String(Math.round(Number(previous)) + 1);
      await position.fill(next);
      await position.press('Escape');
      await expect(position).toHaveValue(previous);
      await position.fill(next);
      await expect(position).toHaveValue(next);
      await position.press('Enter');
      await expect(position).not.toHaveValue(previous);
      await page.screenshot({
        path: info.outputPath('annotation-placement-exact.png'),
        fullPage: false,
      });
      await captureSections(page, inspector, info, 'annotation-frame-before-edit');
      await expect(inspector.locator('[data-has-scrub="true"]')).toHaveCount(0);
      const corner = inspector.getByRole('textbox', { name: 'Corner radius', exact: true });
      const cornerRow = corner.locator('xpath=ancestor::*[@data-stepper-placement="sides"]');
      await expect(cornerRow.getByRole('button', { name: 'Corner radius increase' })).toBeVisible();
      await checkOpacityField(page, inspector.locator('.opacity-field'), info, 'annotation');
      const width = inspector.getByRole('textbox', { name: 'Border width', exact: true });
      const widthFrame = width.locator('xpath=ancestor::*[@data-stepper-placement="sides"]');
      await expect(widthFrame.getByRole('button', { name: 'Border width increase' })).toBeVisible();
      await expect(widthFrame.getByRole('button', { name: 'Border width decrease' })).toBeVisible();
      await expect(
        width
          .locator('xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.numeric-row"]')
          .getByRole('slider')
      ).toHaveCount(0);
      const thickness = Number(await width.inputValue());
      await width.click();
      await width.press('ArrowUp');
      await expect(width).toHaveValue(String(thickness + 1));
      await expect(width).toBeEnabled();
      await width.fill('11');
      await width.press('Escape');
      await expect(width).toHaveValue(String(thickness + 1));
      await width.evaluate((node: HTMLInputElement) => node.blur());
      const preset = inspector.getByRole('button', { name: 'Visual presets', exact: true });
      await expect(preset.locator('.truncate').first()).toHaveCSS('font-size', '13px');
      const accent = inspector.locator('[data-effect-control-id="accent"]');
      const hex = accent.locator('.inspector-hex-editor input');
      const alpha = accent.locator('.alpha-value input');
      for (const control of [hex, alpha]) {
        await expect(control).toHaveCSS('font-size', '13px');
        await expect(control).toHaveCSS('font-weight', '400');
      }
      await accent.locator('.inspector-hex-trigger').click();
      await expect(hex).toBeFocused();
      await width.focus();
      await expect(hex).toHaveAttribute('readonly', '');
      expect(
        await hex.evaluate((input: HTMLInputElement) => ({
          range: [input.selectionStart, input.selectionEnd],
          background: getComputedStyle(input, '::selection').backgroundColor,
        }))
      ).toEqual({ range: [0, 0], background: 'rgba(0, 0, 0, 0)' });
      await page.screenshot({
        path: info.outputPath('annotation-frame-fields.png'),
        fullPage: false,
      });
      await addReviewAnnotation(page, review, /^Name and role(?:$| ·)/u);
      const textTab = inspector
        .locator('[data-inspector-tab-motion="sdk:content"]')
        .getByRole('tab');
      await textTab.click();
      const text = inspector.locator('textarea').first();
      await text.hover();
      await expect(text.locator('..').locator('.sniptale-field-clear')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('annotation-multiline.png'), fullPage: false });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
  test(`Gallery authored media comparison ${name} ${theme}`, async ({ page }, info) => {
    page.setDefaultTimeout(10_000);
    const host = await startHostServer();
    try {
      const { review, inspector } = await openComparisonReview(page, host.origin, size, theme);
      await review
        .getByRole('button', {
          name: translate('gallery.videoReview.advancedEditing', 'en'),
          exact: true,
        })
        .click();
      await captureImportedAudio(page, review, inspector, info);
      await captureAuthoredText(page, review, inspector, info);
      await captureZoomLink(page, review, inspector, info);
      await captureRecordingReady(page, review, inspector, info);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
