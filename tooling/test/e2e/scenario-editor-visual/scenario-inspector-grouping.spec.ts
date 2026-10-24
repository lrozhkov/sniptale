import { expect, type Locator, type Page } from '@playwright/test';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

async function presentation(panel: Locator, label: string) {
  const toggle = panel.getByRole('button', { name: label, exact: true });
  if (await toggle.count()) await toggle.click();
}
async function resizeInspector(page: Page, width: number) {
  const left = page.locator('.guide-panel-divider-left');
  await left.focus();
  for (let index = 0; index < 9; index++) await left.press('ArrowLeft');
  const divider = page.locator('.guide-panel-divider-right');
  await divider.focus();
  await divider.press('Home');
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 420 - width, box.y + box.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(divider).toHaveAttribute('aria-valuenow', String(width));
}
for (const context of [
  { locale: 'ru', theme: 'light', viewport: { width: 1280, height: 560 } },
  { locale: 'en', theme: 'dark', viewport: { width: 1920, height: 900 } },
] as const) {
  test(`scenario groups use gallery disclosure and category patterns ${context.locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(context.locale);
    await openVisualHarness(
      page,
      hostOrigin,
      context.theme,
      context.locale,
      context.viewport,
      'compare',
      { tourFixture: '1' }
    );
    const panel = page.locator('#guide-inspector-panel');
    const category = (label: string) =>
      panel.getByRole('navigation').getByRole('button', { name: label, exact: true });
    for (const [key, kind] of [
      ['guideAddHeading', 'heading'],
      ['guideAddNote', 'note'],
    ] as const) {
      await page
        .locator('article#compare .guide-insertion-block')
        .last()
        .getByRole('button', { name: t('scenario.editor.guideAddBlock'), exact: true })
        .click();
      await page.getByRole('button', { name: t(`scenario.editor.${key}`), exact: true }).click();
      const block = page.locator(`article#compare .guide-block[data-kind="${kind}"]`).last();
      await block.getByRole('textbox').first().fill(`Edited ${kind}`);
      await presentation(panel, t('scenario.editor.inspectorShowSections'));
      await expect(panel.getByRole('navigation').getByRole('button')).toHaveCount(2);
      await category(t('scenario.editor.guideAddText')).click();
      await expect(
        panel.getByRole('group', { name: t('scenario.editor.guideTextSize'), exact: true })
      ).toBeVisible();
      if (kind === 'note')
        await expect(
          panel.getByRole('button', { name: t('scenario.editor.guideNoteType'), exact: true })
        ).toBeVisible();
      await panel
        .getByRole('button', { name: t('scenario.editor.guideTextLarge'), exact: true })
        .click();
      await panel
        .getByRole('button', { name: t('scenario.editor.inspectorShowAll'), exact: true })
        .click();
      await expect(
        panel.getByRole('button', { name: t('scenario.editor.guideTextLarge'), exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: info.outputPath(`${kind}-grouping.png`), fullPage: false });
      await panel
        .getByRole('button', { name: t('scenario.editor.guideStepSettings'), exact: true })
        .click();
    }
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    await presentation(panel, t('scenario.editor.inspectorShowSections'));
    await category(t('scenario.editor.tourObjects')).click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourAnnotation'), exact: true })
      .click();
    await presentation(panel, t('scenario.editor.inspectorShowAll'));
    const textGroup = panel.getByRole('region', {
      name: t('scenario.editor.textLabel'),
      exact: true,
    });
    const text = textGroup.getByRole('textbox', {
      name: t('scenario.editor.textLabel'),
      exact: true,
      includeHidden: true,
    });
    await text.fill('Retained explanation');
    await expect(textGroup.locator('.sniptale-parameter-name')).toHaveCount(0);
    const trigger = textGroup.locator(':scope > .guide-inspector-group-heading button');
    await trigger.focus();
    await trigger.press('Enter');
    await expect(text).toBeHidden();
    await expect(text).toHaveValue('Retained explanation');
    await trigger.press('Space');
    await expect(text).toBeVisible();
    await page.screenshot({ path: info.outputPath('action-groups.png'), fullPage: false });
    await presentation(panel, t('scenario.editor.inspectorShowSections'));
    await category(t('scenario.editor.textLabel')).click();
    await expect(
      panel.getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true })
    ).toHaveValue('Retained explanation');
    await expect(
      category(t('scenario.editor.textLabel')).locator('.lucide-message-square')
    ).toHaveCount(1);
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    await category(t('scenario.editor.appearance')).click();
    await expect(
      panel.getByRole('region', { name: t('windowHeader.enabled'), exact: true })
    ).toBeVisible();
    for (const width of [260, 299, 300, 301, 320, 420]) {
      await resizeInspector(page, width);
      const scroll = panel.locator('.guide-panel-scroll');
      expect(
        await scroll.evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: info.outputPath(`window-group-${width}.png`),
        fullPage: false,
      });
    }
    await presentation(panel, t('scenario.editor.inspectorShowAll'));
    const hotspot = panel.getByRole('region', {
      name: t('scenario.editor.tourHotspot'),
      exact: true,
    });
    await expect(
      hotspot.locator(':scope > .guide-inspector-group-heading .lucide-crosshair')
    ).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('tour-groups.png'), fullPage: false });
    await page.setViewportSize({ width: 1200, height: 560 });
    expect(
      await page
        .locator('.guide-editor-viewport')
        .evaluate((node) => node.scrollWidth > node.clientWidth)
    ).toBe(true);
    await panel.scrollIntoViewIfNeeded();
    expect(
      await panel
        .locator('.guide-panel-scroll')
        .evaluate((node) => node.scrollWidth - node.clientWidth)
    ).toBeLessThanOrEqual(1);
  });
}

test('scenario header shortens the name before stacking actions', async ({
  page,
  hostOrigin,
}, info) => {
  const t = createTranslator('ru');
  await openVisualHarness(page, hostOrigin, 'light', 'ru', { width: 1280, height: 560 });
  const header = page.locator('.guide-page-header');
  const name = header.getByRole('textbox', {
    name: t('scenario.editor.projectLabel'),
    exact: true,
  });
  await expect(header).not.toHaveAttribute('data-wrapped', 'true');
  const original = await name.inputValue();
  await name.fill('Очень длинное название сценария для проверки компактного заголовка');
  await name.press('Tab');
  await expect(header).not.toHaveAttribute('data-wrapped', 'true');
  await expect(name).toHaveValue(
    'Очень длинное название сценария для проверки компактного заголовка'
  );
  expect(await name.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  await page.locator('.guide-panel-divider-right').focus();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('compact-header-1280.png'), fullPage: false });
  const panel = page.locator('#guide-inspector-panel');
  await page.locator('article#compare .guide-block[data-kind="image"] img').first().click();
  await presentation(panel, t('scenario.editor.inspectorShowAll'));
  const entry = panel.getByRole('button', {
    name: t('scenario.editor.guideEditImageFrame'),
    exact: true,
  });
  await expect(entry).toBeVisible();
  await expect(entry.locator('svg')).toHaveCount(0);
  await entry.click();
  await expect(
    panel.getByRole('group', { name: t('scenario.editor.guideImageFit'), exact: true })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  for (const viewport of [
    { width: 1920, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(header).not.toHaveAttribute('data-wrapped', 'true');
    await page.screenshot({
      path: info.outputPath(`header-${viewport.width}x${viewport.height}.png`),
      fullPage: false,
    });
  }
  await name.fill(original);
  await name.press('Tab');
});

test('tour header keeps its controls reachable at the measured wrap boundary', async ({
  page,
  hostOrigin,
}, info) => {
  const t = createTranslator('ru');
  await openVisualHarness(
    page,
    hostOrigin,
    'light',
    'ru',
    { width: 1280, height: 560 },
    'compare',
    { tourFixture: '1' }
  );
  await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
  const header = page.locator('.guide-page-header');
  const wrapped = async (width: number) => {
    await page.setViewportSize({ width, height: 560 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    return (await header.getAttribute('data-wrapped')) === 'true';
  };
  let lower = 1280;
  let upper = 1920;
  expect(await wrapped(lower)).toBe(true);
  expect(await wrapped(upper)).toBe(false);
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (await wrapped(middle)) lower = middle;
    else upper = middle;
  }
  for (const width of [upper - 1, upper, upper + 1]) {
    expect(await wrapped(width)).toBe(width < upper);
    const overflow = await header.evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath(`tour-header-boundary-${width}.png`),
      fullPage: false,
    });
  }
  const panel = page.locator('#guide-inspector-panel');
  await presentation(panel, t('scenario.editor.inspectorShowAll'));
  const actions = panel.getByRole('region', {
    name: t('scenario.editor.tourObjects'),
    exact: true,
  });
  await expect(
    actions.locator('.guide-inspector-group-heading .lucide-mouse-pointer-2')
  ).toHaveCount(1);
  await actions
    .getByRole('button', { name: t('scenario.editor.tourAnnotation'), exact: true })
    .click();
  const narration = panel.getByRole('region', {
    name: t('scenario.editor.tourNarration'),
    exact: true,
  });
  await expect(narration.locator('.guide-inspector-group-heading .lucide-audio-lines')).toHaveCount(
    1
  );
  await narration.scrollIntoViewIfNeeded();
  await expect(narration.locator('.lucide-mic')).toHaveCount(1);
  await page.setViewportSize({ width: 1200, height: 560 });
  expect(
    await page
      .locator('.guide-editor-viewport')
      .evaluate((node) => node.scrollWidth > node.clientWidth)
  ).toBe(true);
});

test('framing utilities belong to the heading and editor fonts follow their roles', async ({
  page,
  hostOrigin,
}, info) => {
  const t = createTranslator('ru');
  await openVisualHarness(page, hostOrigin, 'light', 'ru', { width: 1920, height: 1080 });
  const panel = page.locator('#guide-inspector-panel');
  await page.locator('article#compare .guide-block[data-kind="image"] img').first().click();
  await presentation(panel, t('scenario.editor.inspectorShowAll'));
  const reset = panel.getByRole('button', {
    name: t('scenario.editor.guideImageReset'),
    exact: true,
  });
  await expect(reset).toBeEnabled();
  await expect(
    reset.locator('xpath=ancestor::*[contains(@class,"guide-inspector-group-heading")]')
  ).toHaveCount(1);
  const width = panel.getByRole('textbox', {
    name: t('scenario.editor.guideImageWidth'),
    exact: true,
  });
  const original = await width.inputValue();
  await width.fill('720');
  await width.press('Enter');
  await reset.click();
  await expect(width).toHaveValue(original);
  const disclosure = panel.getByRole('button', {
    name: t('scenario.editor.guideFramingGroup'),
    exact: true,
  });
  await disclosure.click();
  await expect(width).toBeHidden();
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(width).toBeHidden();
  await disclosure.click();
  await expect(width).toHaveValue(original);
  const fontErrors = () =>
    page.locator('.sniptale-scenario-workspace').evaluateAll((roots) =>
      roots
        .flatMap((root) => [...root.querySelectorAll('input,textarea,button,label,h2,h3,h4')])
        .filter((node) => {
          if (node.closest('.guide-document,.tour-stage-host')) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .flatMap((node) => {
          const input =
            node instanceof HTMLTextAreaElement ||
            (node instanceof HTMLInputElement &&
              !['range', 'checkbox', 'radio', 'file', 'hidden'].includes(node.type));
          const font = getComputedStyle(node).fontFamily;
          const expected = input ? 'Sniptale Text' : 'Sniptale Interface';
          return font.includes(expected)
            ? []
            : [
                {
                  tag: node.tagName,
                  label: node.getAttribute('aria-label') ?? node.textContent?.slice(0, 50),
                  font,
                  expected,
                },
              ];
        })
    );
  const loadedFonts = await page.evaluate(async () => {
    const faces = await Promise.all(
      ['Sniptale Interface', 'Sniptale Text'].map((family) =>
        document.fonts.load(`400 13px "${family}"`, 'AaЯя123')
      )
    );
    return faces.map((list) => list.map((face) => ({ family: face.family, status: face.status })));
  });
  for (const faces of loadedFonts) {
    expect(faces.length).toBeGreaterThan(0);
    expect(faces.every((face) => face.status === 'loaded')).toBe(true);
  }
  await info.attach('loaded-golos-families', {
    body: JSON.stringify(loadedFonts),
    contentType: 'application/json',
  });
  expect(await fontErrors()).toEqual([]);
  await panel
    .getByRole('button', { name: t('scenario.editor.guideEditImageFrame'), exact: true })
    .click();
  const center = panel.getByRole('button', {
    name: t('scenario.editor.guideImageCenter'),
    exact: true,
  });
  await expect(
    center.locator('xpath=ancestor::*[contains(@class,"guide-inspector-group-heading")]')
  ).toHaveCount(1);
  for (const viewport of [
    { width: 1280, height: 560 },
    { width: 1920, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    await resizeInspector(page, 260);
    for (const mode of ['all', 'sections'] as const) {
      await presentation(
        panel,
        t(
          mode === 'all'
            ? 'scenario.editor.inspectorShowAll'
            : 'scenario.editor.inspectorShowSections'
        )
      );
      const heading = panel.locator(
        mode === 'all'
          ? '.guide-inspector-group-heading'
          : '[data-ui="shared.categorized-inspector.section-heading"]'
      );
      await expect(
        heading.getByRole('button', { name: t('scenario.editor.guideImageReset'), exact: true })
      ).toBeVisible();
      await expect(
        heading.getByRole('button', { name: t('scenario.editor.guideImageCenter'), exact: true })
      ).toBeVisible();
      await center.click();
      await expect(
        panel.locator('.guide-inspector-group-body .guide-image-reset-actions')
      ).toHaveCount(0);
      expect(
        await panel
          .locator('.guide-panel-scroll')
          .evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeLessThanOrEqual(1);
      expect(await fontErrors()).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`framing-${mode}-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
      });
    }
  }
  await page.keyboard.press('Escape');
  await page
    .locator('#guide-library-panel')
    .getByRole('button', { name: t('scenario.editor.guideResources'), exact: true })
    .click();
  expect(await fontErrors()).toEqual([]);
  await page.screenshot({ path: info.outputPath('resources-fonts-qhd.png'), fullPage: false });
  await page
    .locator('.guide-page-header')
    .getByRole('button', { name: t('scenario.editor.guideReaderOpen'), exact: true })
    .click();
  await expect(page.locator('.guide-export-workspace')).toBeVisible();
  expect(await fontErrors()).toEqual([]);
  await page.screenshot({ path: info.outputPath('export-fonts-qhd.png'), fullPage: false });
});
