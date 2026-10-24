import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

const largeReview = process.env['SNIPTALE_UI_REVIEW_LARGE'] === '1';
const contexts = [
  {
    locale: 'ru',
    theme: 'light',
    size: largeReview ? { width: 1920, height: 1080 } : { width: 1280, height: 560 },
  },
  {
    locale: 'en',
    theme: 'dark',
    size: largeReview ? { width: 2560, height: 1440 } : { width: 1920, height: 900 },
  },
] as const;
type Translate = ReturnType<typeof createTranslator>;

function category(panel: Locator, name: string) {
  return panel.getByRole('navigation').getByRole('button', { name, exact: true });
}
async function presentation(panel: Locator, t: Translate, mode: 'all' | 'sections') {
  const toggle = panel.getByRole('button', {
    name: t(
      mode === 'all' ? 'scenario.editor.inspectorShowAll' : 'scenario.editor.inspectorShowSections'
    ),
    exact: true,
  });
  if (await toggle.count()) await toggle.click();
}
async function width(page: Page, value: number) {
  const divider = page.locator('.guide-panel-divider-right');
  await divider.focus();
  const left = page.locator('.guide-panel-divider-left');
  await left.focus();
  for (let index = 0; index < 9; index++) await left.press('ArrowLeft');
  await divider.focus();
  await divider.press('Home');
  const bounds = await divider.boundingBox();
  if (!bounds) throw new Error('Inspector resize divider is missing');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 420 - value, bounds.y + bounds.height / 2, {
    steps: 3,
  });
  await page.mouse.up();
  await expect(divider).toHaveAttribute('aria-valuenow', String(value));
}
async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}
async function capture(page: Page, panel: Locator, info: TestInfo, name: string) {
  await settled(page);
  const inventory = await panel.evaluate((node) =>
    [
      ...node.querySelectorAll(
        'h2,h3,h4,label,output,input,textarea,select,button,[role="switch"],[role="radio"],[role="alert"],summary'
      ),
    ]
      .filter(
        (element) =>
          element.getBoundingClientRect().width > 0 &&
          element.getBoundingClientRect().height > 0 &&
          getComputedStyle(element).visibility !== 'hidden'
      )
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        font: getComputedStyle(element).fontFamily,
        fontRole: element.matches(
          'textarea,input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"])'
        )
          ? 'Sniptale Text'
          : 'Sniptale Interface',
        role: element.getAttribute('role'),
        name:
          element.getAttribute('aria-label') ??
          element.getAttribute('title') ??
          element.textContent?.trim(),
        value:
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
            ? element.value
            : undefined,
        checked: element.getAttribute('aria-checked'),
        disabled: element.matches(':disabled'),
      }))
  );
  expect(inventory.length, `${name}: visible parameters`).toBeGreaterThan(0);
  expect
    .soft(
      inventory.filter((element) => !element.font.includes(element.fontRole)),
      `${name}: font roles`
    )
    .toEqual([]);
  await info.attach(`${name}-parameters`, {
    body: JSON.stringify(inventory, null, 2),
    contentType: 'application/json',
  });
  const scroll = panel.locator('.guide-panel-scroll');
  const count = await scroll.evaluate((node) =>
    Math.max(1, Math.ceil(node.scrollHeight / Math.max(1, node.clientHeight - 32)))
  );
  for (let index = 0; index < count; index++) {
    await scroll.evaluate((node, offset) => {
      node.scrollTop = offset * Math.max(1, node.clientHeight - 32);
    }, index);
    await settled(page);
    expect(
      await scroll.evaluate((node) => node.scrollWidth - node.clientWidth),
      `${name}: horizontal overflow`
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`${name}-${index}.png`), fullPage: false });
  }
}
async function family(page: Page, panel: Locator, t: Translate, info: TestInfo, name: string) {
  for (const size of [260, 320, 420]) {
    await width(page, size);
    await presentation(panel, t, 'sections');
    const names = await panel
      .getByRole('navigation')
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.map(
          (button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''
        )
      );
    for (const [index, label] of names.entries()) {
      await category(panel, label).click();
      await capture(page, panel, info, `${name}-${size}-category-${index}`);
    }
    await presentation(panel, t, 'all');
    await capture(page, panel, info, `${name}-${size}-all`);
    await presentation(panel, t, 'sections');
  }
}
function number(panel: Locator, label: string) {
  return panel
    .getByRole('textbox', { name: label, exact: true })
    .locator('xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.numeric-row"]');
}
async function pitch(rows: Locator[]) {
  const centers: number[] = [];
  for (const row of rows)
    centers.push(
      await row.evaluate((node) => {
        const input = node.querySelector('input:not([type="range"])');
        if (!input) throw new Error('Numeric value is missing');
        const rect = input.getBoundingClientRect();
        return rect.top + rect.height / 2;
      })
    );
  for (let index = 1; index < centers.length; index++)
    expect(Math.abs(centers[index]! - centers[index - 1]! - 44)).toBeLessThanOrEqual(0.5);
}
async function addObject(
  page: Page,
  panel: Locator,
  t: Translate,
  kind: 'tourHotspot' | 'tourAnnotation'
) {
  await presentation(panel, t, 'sections');
  await category(panel, t('scenario.editor.tourObjects')).click();
  const direct = panel
    .locator('.tour-object-actions')
    .getByRole('button', { name: t(`scenario.editor.${kind}`), exact: true });
  if (await direct.count()) await direct.click();
  else {
    await panel.locator('.tour-object-add button').click();
    await page
      .locator('.guide-action-menu')
      .getByRole('button', { name: t(`scenario.editor.${kind}`), exact: true })
      .click();
  }
}
async function selectOption(page: Page, panel: Locator, label: string, option: string) {
  await panel.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

for (const { locale, theme, size } of contexts) {
  test(`inspector custom width remains visible after canvas resize ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, size);
    const panel = page.locator('#guide-inspector-panel');
    const block = page.locator('article#compare .guide-block[data-kind="image"]').first();
    await block.locator('img').click();
    await block.hover();
    const box = await block.locator('.guide-block-width').boundingBox();
    if (!box) throw new Error('Canvas resize handle is missing');
    const delta = await block.evaluate((node) => {
      const parent = node.parentElement;
      if (!parent) throw new Error('Block row is missing');
      return (
        (parent.getBoundingClientRect().width + parseFloat(getComputedStyle(parent).columnGap)) *
        0.37
      );
    });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - delta, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(block).toHaveAttribute('data-width', '63');
    for (const mode of ['all', 'sections'] as const) {
      await presentation(panel, t, mode);
      if (mode === 'sections')
        await category(panel, t('scenario.editor.guidePlacementGroup')).click();
      await expect(
        panel
          .locator('[data-ui="shared.ui.compact-inspector.status-row"]')
          .filter({ hasText: t('scenario.editor.guideBlockWidth') })
          .locator('output')
      ).toHaveText('63%');
      await expect(
        panel
          .getByRole('group', { name: t('scenario.editor.guideBlockWidth'), exact: true })
          .getByRole('button')
      ).toHaveCount(4);
      await capture(page, panel, info, `resized-${mode}`);
    }
    await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
    await expect(block).toHaveAttribute('data-width', '100');
  });

  test(`inspector numeric units and one contextual range preserve off-scale values ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, size);
    const panel = page.locator('#guide-inspector-panel');
    await page.locator('article#compare .guide-block[data-kind="text"] textarea').first().focus();
    await presentation(panel, t, 'all');
    const height = number(panel, t('scenario.editor.guideBlockHeight'));
    await expect(height).toContainText('px');
    await expect(height.locator('input[type="range"]')).toHaveCount(1);
    await page.locator('article#compare .guide-block[data-kind="image"] img').first().click();
    await presentation(panel, t, 'all');
    const frameWidth = number(panel, t('scenario.editor.guideImageWidth'));
    const field = frameWidth.getByRole('textbox');
    await field.fill('4321');
    await field.press('Enter');
    await expect(field).toHaveValue('4321');
    await expect(frameWidth).toContainText('px');
    await expect(frameWidth.locator('input[type="range"]')).toHaveCount(1);
    await expect(frameWidth.locator('.sniptale-numeric-scale-note')).toBeVisible();
    await frameWidth.locator('input[type="range"]').focus();
    await field.focus();
    await expect(field).toHaveValue('4321');
    await expect(panel.locator('.guide-image-range-field > input[type="range"]')).toHaveCount(0);
    await field.focus();
    await expect(
      frameWidth.locator('[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]')
    ).toHaveCSS('opacity', '0');
    await expect(field).toHaveValue('4321');
    await panel
      .getByRole('button', { name: t('scenario.editor.guideEditImageFrame'), exact: true })
      .click();
    const zoom = number(panel, t('scenario.editor.guideImageZoom'));
    await zoom.getByRole('textbox').fill('750');
    await zoom.getByRole('textbox').press('Enter');
    await expect(zoom.getByRole('textbox')).toHaveValue('750');
    await expect(zoom).toContainText('%');
    await expect(zoom.locator('.sniptale-numeric-scale-note')).toBeVisible();
    await expect(zoom.locator('input[type="range"]')).toHaveCount(1);
    await capture(page, panel, info, 'frame-off-scale');
    await page.keyboard.press('Escape');
  });

  test(`inspector template heading and disclosure preserve mounted draft ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, size);
    const panel = page.locator('#guide-inspector-panel');
    await category(panel, t('scenario.editor.appearanceLayout')).click();
    const templates = panel.getByRole('region', {
      name: t('scenario.editor.stepTemplates'),
      exact: true,
    });
    await expect(templates.getByRole('heading')).toBeVisible();
    await templates
      .getByRole('button', { name: t('scenario.editor.templateSave'), exact: true })
      .click();
    const draft = templates.getByRole('textbox', {
      name: t('scenario.editor.templateName'),
      exact: true,
    });
    await draft.fill('Inspector draft');
    const disclosure = templates.locator('.guide-inspector-disclosure');
    await disclosure.focus();
    await disclosure.press('Enter');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await expect(draft).toBeHidden();
    const chevron = disclosure.locator('svg').last();
    await expect(chevron).toHaveCSS('transform', 'none');
    await disclosure.press('Space');
    await expect(draft).toHaveValue('Inspector draft');
    await expect(chevron).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
    await capture(page, panel, info, 'template-draft-reopened');
  });

  test(`inspector HTML frame output restores full-image edge and terminal Apply ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, size);
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    const panel = page.locator('#guide-inspector-panel');
    const html = panel.getByRole('region', { name: t('scenario.editor.htmlImages'), exact: true });
    const optimize = html.getByRole('switch', {
      name: t('scenario.editor.htmlOptimize'),
      exact: true,
    });
    if (!(await optimize.isChecked())) await optimize.check();
    await selectOption(page, html, t('scenario.editor.htmlMaxEdge'), '4096 px');
    await selectOption(
      page,
      html,
      t('scenario.editor.htmlContent'),
      t('scenario.editor.htmlFrame')
    );
    const edge = html.getByRole('button', { name: t('scenario.editor.htmlMaxEdge'), exact: true });
    await expect(edge).toHaveCount(0);
    await expect(
      html.getByRole('button', { name: t('scenario.editor.htmlQuality'), exact: true })
    ).toBeEnabled();
    await expect(optimize).toBeChecked();
    await expect(optimize).toBeDisabled();
    await capture(page, panel, info, 'html-frame');
    await selectOption(page, html, t('scenario.editor.htmlContent'), t('scenario.editor.htmlFull'));
    await expect(edge).toHaveText('4096 px');
    const apply = panel.getByRole('button', {
      name: t('scenario.editor.guideApplyAllSteps'),
      exact: true,
    });
    expect(
      await apply.evaluate((node) => {
        const fields = node
          .closest('.guide-default-appearance')
          ?.querySelector('.guide-html-fields');
        return Boolean(
          fields && fields.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
        );
      })
    ).toBe(true);
    await apply.scrollIntoViewIfNeeded();
    await expect(apply).toBeInViewport();
    await capture(page, panel, info, 'html-full-terminal-apply');
  });

  test(`tour image, region and animation rows keep 44px pitch ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, size, 'compare', { tourFixture: '1' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    await category(panel, t('scenario.editor.tourSlide')).click();
    await width(page, 420);
    await pitch(
      ['tourImagePositionX', 'tourImagePositionY', 'tourImageScale'].map((key) =>
        number(panel, t(`scenario.editor.${key}`))
      )
    );
    await capture(page, panel, info, 'tour-image-placement-pitch');
    await addObject(page, panel, t, 'tourHotspot');
    await category(panel, t('scenario.editor.appearance')).click();
    const visual = panel.getByRole('group', { name: t('scenario.editor.tourVisual'), exact: true });
    if (await visual.count())
      await visual
        .getByRole('button', { name: t('scenario.editor.tourHighlight'), exact: true })
        .click();
    else
      await selectOption(
        page,
        panel,
        t('scenario.editor.tourVisual'),
        t('scenario.editor.tourHighlight')
      );
    await pitch([
      number(panel, 'X'),
      number(panel, 'Y'),
      number(panel, t('scenario.editor.width')),
      number(panel, t('scenario.editor.height')),
    ]);
    const entryDuration = number(panel, t('scenario.editor.tourHighlightEnterDuration'));
    const entryChoice = panel.getByRole('group', {
      name: t('scenario.editor.tourHighlightEnter'),
      exact: true,
    });
    const distance = await entryDuration.evaluate((node) => {
      const row = node.previousElementSibling;
      if (!row) throw new Error('Entry animation choice is missing');
      return node.getBoundingClientRect().top - row.getBoundingClientRect().top;
    });
    expect(Math.abs(distance - 44)).toBeLessThanOrEqual(0.5);
    if (await entryChoice.count())
      await entryChoice
        .getByRole('button', { name: t('scenario.editor.tourAnimationNone'), exact: true })
        .click();
    else
      await selectOption(
        page,
        panel,
        t('scenario.editor.tourHighlightEnter'),
        t('scenario.editor.tourAnimationNone')
      );
    await expect(entryDuration).toHaveCount(0);
    await capture(page, panel, info, 'tour-region-hidden-animation');
  });

  test(`tour navigation icon radios support one Tab stop and keyboard changes ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, size, 'compare', { tourFixture: '1' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    await page
      .locator('#guide-library-panel')
      .getByRole('button', { name: t('scenario.editor.tourAddNavigation'), exact: true })
      .click();
    const panel = page.locator('#guide-inspector-panel');
    await category(panel, t('scenario.editor.tourComposition')).click();
    for (const key of ['tourAlignment', 'tourNavigationPosition', 'tourButtonColumns'] as const) {
      const group = panel.getByRole('radiogroup', {
        name: t(`scenario.editor.${key}`),
        exact: true,
      });
      const radios = group.getByRole('radio');
      await expect(radios).toHaveCount(3);
      expect(
        await radios.evaluateAll(
          (nodes) => nodes.filter((node) => node.getAttribute('tabindex') === '0').length
        )
      ).toBe(1);
      const start = radios.nth(0);
      await start.focus();
      await start.press('End');
      await expect(radios.nth(2)).toBeChecked();
      await expect(radios.nth(2)).toBeFocused();
      await radios.nth(2).press('Home');
      await expect(start).toBeChecked();
      await start.press('ArrowRight');
      await expect(radios.nth(1)).toBeChecked();
      await radios.nth(1).press('ArrowLeft');
      await expect(start).toBeChecked();
      await start.press('Tab');
      expect(await group.evaluate((node) => node.contains(document.activeElement))).toBe(false);
    }
    await capture(page, panel, info, 'navigation-radio-keyboard');
    await category(panel, t('scenario.editor.tourAddNavigation')).click();
    const title = panel.getByRole('textbox', {
      name: t('scenario.editor.tourNavigationTitle'),
      exact: true,
    });
    await title.fill('Navigation survives radio changes');
    await category(panel, t('scenario.editor.tourComposition')).click();
    await expect(
      panel
        .getByRole('radiogroup', { name: t('scenario.editor.tourAlignment'), exact: true })
        .getByRole('radio')
        .first()
    ).toBeChecked();
    await category(panel, t('scenario.editor.tourAddNavigation')).click();
    await expect(title).toHaveValue('Navigation survives radio changes');
  });

  test(`tour URL fields expose names, Clear and preserve accepted destinations ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, size, 'compare', { tourFixture: '1' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const library = page.locator('#guide-library-panel');
    await library
      .getByRole('button', { name: t('scenario.editor.tourAddNavigation'), exact: true })
      .click();
    const panel = page.locator('#guide-inspector-panel');
    await category(panel, t('scenario.editor.tourContentsLinks')).click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourAddButton'), exact: true })
      .click();
    await selectOption(
      page,
      panel,
      t('scenario.editor.tourAction'),
      t('scenario.editor.tourActionUrl')
    );
    const url = panel.getByRole('textbox', {
      name: t('scenario.editor.tourActionUrl'),
      exact: true,
    });
    const urlRow = url.locator(
      'xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.text-field"]'
    );
    await expect(
      urlRow.getByText(t('scenario.editor.tourActionUrl'), { exact: true })
    ).toBeVisible();
    const accepted = 'https://example.com/accepted';
    await url.fill(accepted);
    await url.press('Enter');
    await expect(url).not.toHaveAttribute('aria-invalid', 'true');
    await url.fill('https://');
    await url.press('Enter');
    await expect(url).toHaveAttribute('aria-invalid', 'true');
    await expect(panel.getByRole('alert')).toContainText(t('scenario.editor.tourInvalidUrl'));
    await capture(page, panel, info, 'navigation-invalid-url');
    await urlRow
      .getByRole('button', {
        name: t('shared.ui.clearField').replace('{field}', t('scenario.editor.tourActionUrl')),
        exact: true,
      })
      .click();
    await expect(url).toHaveValue('');
    await expect(url).toBeFocused();
    await url.press('Tab');
    await expect(url).toHaveAttribute('aria-invalid', 'true');
    await panel
      .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
      .click();
    await panel.locator('.tour-contents-select').first().click();
    await expect(url).toHaveValue(accepted);
    await presentation(panel, t, 'all');
    const remove = panel.getByRole('button', { name: t('common.actions.delete'), exact: true });
    expect(await remove.evaluate((node) => !node.closest('.guide-inspector-group'))).toBe(true);
    expect(
      await remove.evaluate((node) =>
        [
          ...node.closest('.tour-object-inspector')!.querySelectorAll('.guide-inspector-group'),
        ].every((group) =>
          Boolean(group.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
        )
      )
    ).toBe(true);
    await remove.scrollIntoViewIfNeeded();
    await expect(remove).toBeInViewport();
    await presentation(panel, t, 'sections');
    await category(panel, t('scenario.editor.tourNarration')).click();
    await remove.scrollIntoViewIfNeeded();
    await expect(remove).toBeInViewport();
    await capture(page, panel, info, 'navigation-narration-terminal-delete');
    await library.getByRole('button', { name: t('scenario.editor.tourEnd'), exact: true }).click();
    await panel
      .getByRole('switch', { name: t('scenario.editor.tourEndButton'), exact: true })
      .check();
    await expect(
      urlRow.getByText(t('scenario.editor.tourActionUrl'), { exact: true })
    ).toBeVisible();
    await url.fill(accepted);
    await url.press('Enter');
    await url.fill('https://');
    await url.press('Enter');
    await expect(url).toHaveAttribute('aria-invalid', 'true');
    await urlRow
      .getByRole('button', {
        name: t('shared.ui.clearField').replace('{field}', t('scenario.editor.tourActionUrl')),
        exact: true,
      })
      .click();
    await expect(url).toHaveValue('');
    await expect(url).toBeFocused();
    await url.press('Tab');
    await expect(url).toHaveAttribute('aria-invalid', 'true');
    await capture(page, panel, info, 'terminal-invalid-url');
    await library
      .getByRole('button', { name: t('scenario.editor.tourAddNavigation'), exact: true })
      .click();
    await library.getByRole('button', { name: t('scenario.editor.tourEnd'), exact: true }).click();
    await expect(url).toHaveValue(accepted);
  });

  test(`guide inspector visible parameter inventory at three panel widths ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    test.setTimeout(180_000);
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, size);
    const panel = page.locator('#guide-inspector-panel');
    await family(page, panel, t, info, 'guide-step');
    await category(panel, t('scenario.editor.appearanceLayout')).click();
    for (const threshold of [279, 280, 281]) {
      await width(page, threshold);
      await capture(page, panel, info, `guide-container-threshold-${threshold}`);
    }
    await page.locator('#intro input, #intro textarea').first().focus();
    await family(page, panel, t, info, 'guide-section');
    await page.locator('article#compare .guide-block[data-kind="text"] textarea').first().focus();
    await family(page, panel, t, info, 'guide-text');
    const step = page.locator('article#compare');
    for (const [key, kind] of [
      ['guideAddHeading', 'heading'],
      ['guideAddNote', 'note'],
      ['guideAddImage', 'image-slot'],
    ] as const) {
      await panel
        .getByRole('button', { name: t('scenario.editor.guideStepSettings'), exact: true })
        .click();
      const add = step
        .locator('.guide-insertion-block')
        .last()
        .getByRole('button', { name: t('scenario.editor.guideAddBlock'), exact: true });
      await add.focus();
      await add.press('Enter');
      await page.getByRole('button', { name: t(`scenario.editor.${key}`), exact: true }).click();
      const block = step.locator(`.guide-block[data-kind="${kind}"]`).last();
      if (kind === 'image-slot') await step.locator('.guide-image-slot').last().focus();
      else await block.getByRole('textbox').first().fill(`Visible ${kind}`);
      await family(page, panel, t, info, `guide-${kind}`);
    }
    await step.locator('.guide-block[data-kind="image"] img').first().click();
    await family(page, panel, t, info, 'guide-image');
    await presentation(panel, t, 'all');
    await panel
      .getByRole('button', { name: t('scenario.editor.guideEditImageFrame'), exact: true })
      .click();
    await family(page, panel, t, info, 'guide-image-framing');
    await page.keyboard.press('Escape');
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    await family(page, panel, t, info, 'guide-defaults');
  });

  test(`tour inspector visible parameter inventory at three panel widths ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    test.setTimeout(240_000);
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, size, 'compare', { tourFixture: '1' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    await family(page, panel, t, info, 'tour-image');
    for (const kind of ['tourHotspot', 'tourAnnotation'] as const) {
      await addObject(page, panel, t, kind);
      await family(page, panel, t, info, kind);
      await panel
        .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
        .click();
    }
    const library = page.locator('#guide-library-panel');
    await library
      .getByRole('button', { name: t('scenario.editor.tourAddNavigation'), exact: true })
      .click();
    await family(page, panel, t, info, 'tour-navigation');
    await category(panel, t('scenario.editor.tourContentsLinks')).click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourAddButton'), exact: true })
      .click();
    await family(page, panel, t, info, 'tour-button');
    await library.getByRole('button', { name: t('scenario.editor.tourEnd'), exact: true }).click();
    await family(page, panel, t, info, 'tour-end');
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    await family(page, panel, t, info, 'tour-defaults');
    for (const panelWidth of [299, 300, 301]) {
      await width(page, panelWidth);
      await capture(page, panel, info, `tour-container-threshold-${panelWidth}`);
    }
    await page.setViewportSize({ width: 1100, height: size.height });
    await panel.getByRole('navigation').getByRole('button').first().click();
    await panel.scrollIntoViewIfNeeded();
    await capture(page, panel, info, 'below-desktop-minimum');
  });
}
