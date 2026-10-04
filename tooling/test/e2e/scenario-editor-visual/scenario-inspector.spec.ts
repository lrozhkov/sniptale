import { expect, type Locator } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`scenario inspector shares color and section patterns in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 560 });
    const panel = page.locator('#guide-inspector-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('h2')).toHaveText('Compare two images');
    await expect(panel.locator('.guide-inspector-scope')).toHaveCount(0);
    await panel
      .getByRole('navigation', { name: 'Настройки шага' })
      .getByRole('button', { name: 'Оформление', exact: true })
      .click();
    const accent = panel.locator('.guide-style-accent');
    await expect(accent.locator('input[type="color"]')).toHaveCount(0);
    await expect(accent.getByText('Номера и ссылки', { exact: true })).toBeVisible();
    await accent.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
    await expect(page.locator('[data-ui="shared.ui.color-selector.picker"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ui="shared.ui.color-selector.picker"]')).toHaveCount(0);
    await testInfo.attach(`inspector-narrow-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    expect(
      await panel.evaluate((node) =>
        [
          ...node.querySelectorAll(
            'button, [role="group"], .guide-style-fields, .guide-inspector-choice, .guide-style-accent'
          ),
        ]
          .filter((el) => el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1)
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            text: el.textContent?.slice(0, 40),
            width: el.getBoundingClientRect().width,
          }))
      )
    ).toEqual([]);
    expect(
      await panel
        .locator('.guide-inspector-choice [role="group"] button > span')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.scrollWidth > node.clientWidth)
            .map((node) => node.textContent)
        )
    ).toEqual([]);
    await page.setViewportSize({ width: 1280, height: 560 });
    await testInfo.attach(`inspector-minimum-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await panel.getByRole('button', { name: 'Показать все настройки', exact: true }).click();
    await expect(panel.getByRole('navigation', { name: 'Настройки шага' })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Показать разделы настроек', exact: true }).click();
    await expect(
      panel.getByRole('navigation').getByRole('button', { name: 'Оформление', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Оформление', exact: true })
      .click();
    await expect(panel.locator('h2')).toHaveText('Весь сценарий');
    await expect(
      panel.locator('.guide-default-appearance .guide-inspector-group').first()
    ).toHaveCSS('border-top-width', '0px');
    await expect(
      panel.getByRole('button', { name: 'Показать все настройки', exact: true })
    ).toHaveCount(0);
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  for (const locale of ['ru', 'en'] as const) {
    test(`inspector fields wrap and groups support keyboard disclosure in ${locale} ${theme}`, async ({
      page,
      hostOrigin,
    }, info) => {
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 900 },
        'compare',
        { tourFixture: '1' }
      );
      const panel = page.locator('#guide-inspector-panel');
      const appearance = locale === 'ru' ? 'Оформление' : 'Appearance';
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: appearance, exact: true })
        .click();
      const guideInset = await panel.evaluate(
        (node) =>
          node.querySelector('nav button')!.getBoundingClientRect().top -
          node.querySelector('.guide-panel-heading')!.getBoundingClientRect().bottom
      );
      expect.soft(guideInset).toBe(12);
      const divider = page.locator('.guide-panel-divider-right');
      await divider.focus();
      await page.keyboard.press('Home');
      for (const width of [420, 260]) {
        if (width === 260) for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
        await expect(divider).toHaveAttribute('aria-valuenow', String(width));
        expect(
          await panel.evaluate((node) =>
            [
              ...node.querySelectorAll<HTMLElement>(
                'h2, h3, button, .guide-inspector-choice, .guide-style-accent'
              ),
            ]
              .filter((el) => el.getBoundingClientRect().width > 0)
              .filter(
                (el) =>
                  el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1 ||
                  el.scrollWidth > el.clientWidth + 1
              )
              .map((el) => el.textContent)
          )
        ).toEqual([]);
        await info.attach(`guide-${locale}-${theme}-${width}`, {
          body: await panel.screenshot(),
          contentType: 'image/png',
        });
      }
      const disclosure = panel.locator('.guide-inspector-disclosure').first();
      await disclosure.focus();
      await page.keyboard.press('Enter');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await expect(panel.locator('.guide-inspector-group-body').first()).toBeHidden();
      await page.keyboard.press('Space');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      await expect(panel.locator('.guide-inspector-group-body').first()).toBeVisible();
      await page
        .getByRole('button', {
          name: locale === 'ru' ? 'Интерактивный тур' : 'Interactive tour',
          exact: true,
        })
        .click();
      const tourPanel = page.locator('#guide-inspector-panel');
      await tourPanel
        .getByRole('navigation')
        .getByRole('button', { name: locale === 'ru' ? 'Камера' : 'Camera', exact: true })
        .click();
      await tourPanel.locator('[data-ui="shared.ui.compact-select"] > button').click();
      await page
        .getByRole('option', { name: locale === 'ru' ? 'Вручную' : 'Manual', exact: true })
        .click();
      await expect(
        tourPanel.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]')
      ).toHaveCount(3);
      expect(
        await tourPanel.evaluate((node) =>
          [
            ...node.querySelectorAll<HTMLElement>(
              '[data-ui="shared.ui.compact-inspector.numeric-row"], [data-ui="shared.ui.compact-select"]'
            ),
          ]
            .filter(
              (el) => el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1
            )
            .map((el) => el.textContent)
        )
      ).toEqual([]);
      await info.attach(`tour-${locale}-${theme}-260`, {
        body: await tourPanel.screenshot(),
        contentType: 'image/png',
      });
      await tourPanel
        .getByRole('navigation')
        .getByRole('button', {
          name: locale === 'ru' ? 'Объекты слайда' : 'Slide objects',
          exact: true,
        })
        .click();
      await tourPanel
        .getByRole('button', { name: locale === 'ru' ? 'Точка действия' : 'Hotspot', exact: true })
        .click();
      await tourPanel
        .getByRole('navigation')
        .getByRole('button', { name: locale === 'ru' ? 'Текст' : 'Text', exact: true })
        .click();
      await expect(
        tourPanel.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]').first()
      ).toBeVisible();
      expect(
        await tourPanel.evaluate((node) =>
          [
            ...node.querySelectorAll<HTMLElement>(
              'button, input, textarea, [data-ui="shared.ui.compact-inspector.numeric-row"]'
            ),
          ]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .filter(
              (el) => el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1
            )
            .map((el) => ({ text: el.textContent, label: el.getAttribute('aria-label') }))
        )
      ).toEqual([]);
      await tourPanel
        .getByRole('navigation')
        .getByRole('button', { name: appearance, exact: true })
        .click();
      const surface = tourPanel.locator('[data-ui="shared.ui.surface-style-selector"]');
      expect(
        await surface
          .locator('.truncate')
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => node.scrollWidth > node.clientWidth + 1)
              .map((node) => node.textContent)
          )
      ).toEqual([]);
      await surface.locator('[data-ui="shared.ui.surface-style-selector.trigger"]').click();
      await expect(surface.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(surface.getByRole('dialog')).toHaveCount(0);
      await expect(
        surface.locator('[data-ui="shared.ui.surface-style-selector.trigger"]')
      ).toBeFocused();
      await info.attach(`object-${locale}-${theme}-260`, {
        body: await tourPanel.screenshot(),
        contentType: 'image/png',
      });
      await tourPanel
        .getByRole('button', {
          name: locale === 'ru' ? 'К настройкам слайда' : 'Back to slide settings',
          exact: true,
        })
        .click();
      await expect(tourPanel.locator('[data-inspector-object]')).toBeFocused();
      await expect(tourPanel.locator('.tour-object-item-actions')).toBeVisible();
      await expect(tourPanel.locator('.tour-object-add button svg')).toHaveCount(1);
      await expect(tourPanel.locator('.tour-object-item-actions button').first()).toBeDisabled();
    });
  }
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  for (const locale of ['ru', 'en'] as const) {
    test(`navigation inspector feedback in ${locale} ${theme}`, async ({
      page,
      hostOrigin,
    }, info) => {
      const ru = locale === 'ru';
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 1000 },
        'compare',
        { tourFixture: '1' }
      );
      await page
        .getByRole('button', { name: ru ? 'Интерактивный тур' : 'Interactive tour', exact: true })
        .click();
      await page
        .locator('#guide-library-panel')
        .getByRole('button', { name: ru ? 'Навигационный слайд' : 'Navigation slide', exact: true })
        .click();
      const panel = page.locator('#guide-inspector-panel');
      const title = panel.getByRole('textbox', { name: ru ? 'Заголовок' : 'Title', exact: true });
      await expect(title).toBeVisible();
      const radius = await page
        .locator('.guide-project-name input')
        .evaluate((node) => getComputedStyle(node).borderRadius);
      expect.soft(await title.evaluate((node) => getComputedStyle(node).borderRadius)).toBe(radius);
      await expect(title).toHaveCSS('height', '36px');
      await expect(title).toHaveCSS('font-size', '12px');
      const leftTab = page.locator('.guide-left-navigation [aria-pressed="true"]');
      await expect.soft(leftTab).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await expect
        .soft(leftTab)
        .toHaveCSS('color', await panel.evaluate((node) => getComputedStyle(node).color));
      await title.fill('Navigation title');
      const controls = title.locator('..').locator('.guide-voice-control');
      const clear = controls.locator('button').last();
      await expect.soft(clear).toHaveAttribute('title', ru ? 'Очистить текст' : 'Clear text');
      await clear.hover();
      await expect.soft(clear).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');

      const railGeometry = await panel.evaluate((node) => {
        const nav = node.querySelector('nav')!;
        const button = nav.querySelector('button')!;
        const heading = node.querySelector(
          '[data-ui="shared.categorized-inspector.section-heading"]'
        )!;
        const label = heading.querySelector('span')!;
        return {
          left: button.getBoundingClientRect().left - node.getBoundingClientRect().left,
          right: nav.getBoundingClientRect().right - button.getBoundingClientRect().right,
          above:
            label.getBoundingClientRect().top -
            node.querySelector('.guide-panel-heading')!.getBoundingClientRect().bottom,
          below: heading.getBoundingClientRect().bottom - label.getBoundingClientRect().bottom,
        };
      });
      expect.soft(Math.abs(railGeometry.left - railGeometry.right)).toBeLessThanOrEqual(2);
      expect.soft(Math.abs(railGeometry.above - railGeometry.below)).toBeLessThanOrEqual(2);
      const composition = panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Композиция' : 'Composition', exact: true });
      await composition.hover();
      await expect.soft(composition).toHaveAttribute('aria-pressed', 'false', { timeout: 1000 });
      await composition.click();
      const labels = await panel
        .locator(
          '.tour-layout-setting > span, [data-ui="shared.ui.compact-inspector.numeric-row"] > span'
        )
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const css = getComputedStyle(node);
            return [css.fontFamily, css.fontSize, css.fontWeight, css.lineHeight].join('|');
          })
        );
      expect.soft(new Set(labels).size).toBe(1);
      const rightEdges = await panel
        .locator(
          '.tour-layout-setting > [role="group"], [data-ui="shared.ui.compact-inspector.numeric-value-field"]'
        )
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right));
      expect(Math.max(...rightEdges) - Math.min(...rightEdges)).toBeLessThanOrEqual(1);

      const align = panel.getByRole('button', { name: ru ? 'Справа' : 'Right', exact: true });
      await align.click();
      await expect(align).toHaveAttribute('aria-pressed', 'true');
      const selectedColors = await align.evaluate((node) =>
        ['text-primary'].map((token) => {
          const probe = document.createElement('span');
          probe.style.color = `var(--sniptale-color-${token})`;
          node.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        })
      );
      await expect
        .poll(async () =>
          selectedColors.includes(await align.evaluate((node) => getComputedStyle(node).color))
        )
        .toBe(true);
      await expect(align).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await page.mouse.move(800, 500);
      await expect
        .poll(async () =>
          selectedColors.includes(await align.evaluate((node) => getComputedStyle(node).color))
        )
        .toBe(true);
      const number = panel
        .locator('[data-ui="shared.ui.compact-inspector.numeric-value-field"]')
        .first();
      await number.locator('input').fill('77');
      await expect(number.locator('input')).toBeFocused();
      await expect(number).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await expect.soft(number).toHaveAttribute('data-focus-appearance', 'accent-box');
      expect
        .soft(await number.evaluate((node) => getComputedStyle(node).borderTopColor))
        .not.toBe('rgba(0, 0, 0, 0)');
      const contents = panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Пункты оглавления' : 'Contents links', exact: true });
      await contents.hover();
      await expect.soft(contents).toHaveAttribute('aria-pressed', 'false', { timeout: 1000 });
      await contents.click();
      await panel
        .getByRole('button', { name: ru ? 'Добавить кнопку' : 'Add button', exact: true })
        .click();
      await expect.soft(panel.locator('.guide-inspector-disclosure')).toHaveCount(0);
      const remove = panel.getByRole('button', { name: ru ? 'Удалить' : 'Delete', exact: true });
      expect
        .soft(await remove.evaluate((node) => getComputedStyle(node).borderTopColor))
        .toBe('rgba(0, 0, 0, 0)');
      await panel
        .getByRole('button', {
          name: ru ? 'К настройкам слайда' : 'Back to slide settings',
          exact: true,
        })
        .click();
      const row = panel.locator('.tour-contents-row');
      const rowCenters = await row.locator('button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return box.top + box.height / 2;
        })
      );
      expect.soft(Math.max(...rowCenters) - Math.min(...rowCenters)).toBeLessThanOrEqual(1);
      const resize = page.locator('.guide-panel-divider-right');
      await resize.focus();
      for (let index = 0; index < 10; index++) await page.keyboard.press('ArrowRight');
      await expect(resize).toHaveAttribute('aria-valuenow', '260');
      const narrowRow = await row.locator('button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return { center: box.top + box.height / 2, right: box.right };
        })
      );
      expect(
        Math.max(...narrowRow.map((box) => box.center)) -
          Math.min(...narrowRow.map((box) => box.center))
      ).toBeLessThanOrEqual(1);
      expect(Math.max(...narrowRow.map((box) => box.right))).toBeLessThanOrEqual(
        (await panel.boundingBox())!.x + 260
      );
      await info.attach(`contents-row-${locale}-${theme}-260`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      await resize.focus();
      await page.keyboard.press('Home');

      await expect
        .soft(row.getByRole('button', { name: ru ? 'Удалить' : 'Delete', exact: true }))
        .toHaveCount(1);
      if (await row.getByRole('button', { name: ru ? 'Удалить' : 'Delete', exact: true }).count()) {
        await row.hover();
        await row.getByRole('button', { name: ru ? 'Удалить' : 'Delete', exact: true }).click();
        await expect(row).toHaveCount(0);
        await page
          .locator('.guide-page-header')
          .getByRole('button', { name: ru ? 'Отменить' : 'Undo', exact: true })
          .click();
        await expect(row).toHaveCount(1);
      }
      await composition.hover();
      await composition.click();
      await expect.soft(number.locator('input')).toHaveValue('77');
      const playback = panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Воспроизведение' : 'Playback', exact: true });
      await playback.click();
      const select = panel.locator('[data-ui="shared.ui.compact-select"] > button').first();
      await select.click();
      const selected = page.getByRole('option', { selected: true });
      await selected.hover();
      const selectedBackground = await selected.evaluate(async (node) => {
        await Promise.all(node.getAnimations().map((animation) => animation.finished));
        return getComputedStyle(node).backgroundColor;
      });
      await page.mouse.move(800, 500);
      await expect.soft(selected).toHaveCSS('background-color', selectedBackground);
      await page.keyboard.press('Escape');
      await panel
        .locator('[aria-label="' + (ru ? 'Показать все настройки' : 'Show all settings') + '"]')
        .click();
      await expect
        .soft(panel.locator('.guide-panel-heading button').first())
        .not.toHaveAttribute('aria-pressed');
      await expect
        .soft(panel.locator('.guide-inspector-group-heading h3').first())
        .toHaveCSS('font-weight', '600');
      const separators = await panel.locator('.guide-inspector-section').evaluateAll((sections) =>
        sections.slice(1).map((section) => {
          const group = section.querySelector('.guide-inspector-group')!;
          return (
            parseFloat(getComputedStyle(section).borderTopWidth) +
            parseFloat(getComputedStyle(group).borderTopWidth)
          );
        })
      );
      expect(separators.length).toBeGreaterThan(0);
      expect(separators.every((width) => width === 1)).toBe(true);
      await info.attach(`navigation-feedback-${locale}-${theme}`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
    });
  }
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  for (const locale of ['ru', 'en'] as const) {
    test(`inspector field vocabulary in ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      const ru = locale === 'ru';
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 1000 },
        'compare',
        { tourFixture: '1' }
      );
      const panel = page.locator('#guide-inspector-panel');
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Оформление' : 'Appearance', exact: true })
        .click();
      const segment = panel
        .locator('.guide-inspector-choice [role="group"] button[aria-pressed="true"]')
        .first();
      await expect.soft(segment).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(
        panel.locator('.guide-inspector-choice [role="group"] > span[aria-hidden]').first()
      ).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(segment).toHaveCSS('box-shadow', 'none');
      const valueFonts = await panel
        .locator(
          [
            '.guide-inspector-choice [role="group"] button[aria-pressed="true"]',
            '.guide-inspector-choice [data-ui="shared.ui.compact-select"] > button',
          ].join(', ')
        )
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const style = getComputedStyle(node);
            return [
              style.fontFamily,
              style.fontSize,
              style.fontWeight,
              style.lineHeight,
              style.color,
            ].join('|');
          })
        );
      expect(new Set(valueFonts).size).toBe(1);

      await segment.hover();
      await expect(segment).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

      const accent = panel.locator('.guide-style-accent');
      const colorSpacing = await accent.evaluate(
        (node) =>
          node.querySelector(':scope > button')!.getBoundingClientRect().left -
          node
            .querySelector('[data-ui="shared.ui.color-selector.trigger"]')!
            .getBoundingClientRect().right
      );
      expect.soft(colorSpacing).toBe(8);
      await accent.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      const palette = page.locator('[data-ui="shared.ui.color-selector.picker"]');
      expect.soft(await palette.locator('button').count()).toBeGreaterThanOrEqual(8);
      await page.keyboard.press('Escape');
      await info.attach(`guide-colors-${locale}-${theme}`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      await page
        .getByRole('button', { name: ru ? 'Интерактивный тур' : 'Interactive tour', exact: true })
        .click();
      await page
        .locator('.guide-page-header')
        .getByRole('button', { name: ru ? 'Оформление' : 'Appearance', exact: true })
        .click();
      const parameterLabels = [
        '.guide-number-toggle',
        '.tour-text-field > span:not(.guide-voice-field)',
        '[data-ui="shared.ui.compact-inspector.numeric-row"] > span',
        '[data-ui="shared.ui.compact-inspector.color-field"] > span',
        '[data-ui="shared.ui.surface-style-selector"] > div:first-child > span',
      ].join(', ');
      for (const section of [
        ru ? 'Воспроизведение' : 'Playback',
        ru ? 'Пояснение к слайду' : 'Slide explanation',
      ]) {
        await panel
          .getByRole('navigation')
          .getByRole('button', { name: section, exact: true })
          .click();
        const fonts = await panel.locator(parameterLabels).evaluateAll((nodes) =>
          nodes.map((node) => {
            const style = getComputedStyle(node);
            return [
              style.fontFamily,
              style.fontSize,
              style.fontWeight,
              style.lineHeight,
              style.color,
            ].join('|');
          })
        );
        expect(fonts.length).toBeGreaterThan(2);
        expect.soft(new Set(fonts).size).toBe(1);
        for (const toggle of await panel.getByRole('switch').all()) {
          await expect.soft(toggle).toHaveCSS('width', '32px');
          await expect.soft(toggle).toHaveCSS('height', '20px');
        }
        const numeric = panel
          .locator('[data-ui="shared.ui.compact-inspector.numeric-row"]')
          .first();
        await numeric.hover();
        const scrub = numeric.locator(
          '[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]'
        );
        await expect(scrub).toHaveCSS('opacity', '1');
        const fill = await scrub.evaluate((node) =>
          getComputedStyle(node).getPropertyValue('--sniptale-range-fill-color').trim()
        );
        expect.soft(fill).not.toBe('');
        await info.attach(`document-${section}-${locale}-${theme}`, {
          body: await panel.screenshot(),
          contentType: 'image/png',
        });
      }
      const redo = page
        .locator('.guide-page-header')
        .getByRole('button', { name: ru ? 'Повторить' : 'Redo', exact: true });
      await expect(redo).toBeDisabled();
      const create = page.locator('.tour-list-actions button').first();
      await expect(create).toBeEnabled();
      await expect(create).toHaveCSS('opacity', '1');
      expect
        .soft(Number(await redo.evaluate((node) => getComputedStyle(node).opacity)))
        .toBeLessThanOrEqual(0.4);
    });
  }
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`semantic inspector rows ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 1000 },
        'compare',
        { tourFixture: '1' }
      );
      const panel = page.locator('#guide-inspector-panel');
      await panel
        .getByRole('button', {
          name: locale === 'ru' ? 'Показать все настройки' : 'Show all settings',
          exact: true,
        })
        .click();
      const row = panel
        .locator('.guide-inspector-choice:has(> span + [data-ui="shared.ui.compact-select"])')
        .first();
      await expect(row).toBeVisible();
      for (const width of [420, 260]) {
        await panel.evaluate((node, size) => {
          (node as HTMLElement).style.width = `${size}px`;
        }, width);
        const layout = panel
          .locator(
            '.guide-inspector-group:has(> .guide-inspector-group-heading .guide-inspector-static-heading)' +
              ':has(> .guide-inspector-group-body > [data-ui="shared.ui.compact-select"]:only-child)'
          )
          .first();
        await layout.scrollIntoViewIfNeeded();
        const heading = (await layout.locator('.guide-inspector-group-heading').boundingBox())!;
        const field = (await layout.locator('[data-ui="shared.ui.compact-select"]').boundingBox())!;
        if (width === 420)
          expect(
            Math.abs(heading.y + heading.height / 2 - field.y - field.height / 2)
          ).toBeLessThanOrEqual(1);
        else expect(field.y).toBeGreaterThanOrEqual(heading.y + heading.height);
        await row.scrollIntoViewIfNeeded();
        const label = (await row.locator(':scope > span').first().boundingBox())!;
        const select = (await row
          .locator(':scope > [data-ui="shared.ui.compact-select"]')
          .first()
          .boundingBox())!;
        if (width === 420)
          expect(
            Math.abs(label.y + label.height / 2 - select.y - select.height / 2)
          ).toBeLessThanOrEqual(1);
        else expect(select.y).toBeGreaterThanOrEqual(label.y + label.height);
        expect(select.x + select.width).toBeLessThanOrEqual(
          (await panel.boundingBox())!.x + width + 1
        );
      }
      await page
        .getByRole('button', {
          name: locale === 'ru' ? 'Интерактивный тур' : 'Interactive tour',
          exact: true,
        })
        .click();
      await page
        .locator('#guide-library-panel')
        .getByRole('button', {
          name: locale === 'ru' ? 'Навигационный слайд' : 'Navigation slide',
          exact: true,
        })
        .click();
      const paint = panel.locator('[data-ui="shared.ui.paint-selector"]').first();
      await expect(paint).toHaveAttribute('data-trigger-variant', 'swatch');
      const trigger = paint.locator('[data-ui="shared.ui.paint-selector.trigger"]');
      await expect(trigger.locator('.lucide-palette')).toHaveCount(1);
      await expect(trigger).toContainText('#');
      await expect(trigger).toHaveCSS('border-top-width', '0px');
      await trigger.click();
      await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toBeVisible();
      await trigger.click();
      await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toHaveCount(0);
      await info.attach('scenario-semantic-inspector', {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
    });
  }
}

for (const [locale, theme] of [
  ['ru', 'light'],
  ['en', 'dark'],
] as const) {
  test(`inspector image actions return to their origin in ${locale} ${theme}`, async ({
    page,
    extensionId,
  }, info) => {
    const ru = locale === 'ru';
    page.setDefaultTimeout(10_000);
    await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const value: unknown = (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ];
          return value === 'ru' || value === 'en';
        })
      )
      .toBe(true);
    await page.evaluate(
      async ({ locale, theme }) => {
        localStorage.setItem('sniptale-locale-preference', locale);
        await chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        });
      },
      { locale, theme }
    );
    await openVisualHarness(
      page,
      `chrome-extension://${extensionId}`,
      theme,
      locale,
      { width: 1280, height: 560 },
      'compare',
      { tourFixture: '1' }
    );
    const panel = page.locator('#guide-inspector-panel');
    const figure = page.locator('article#compare figure').first();
    await figure.locator('img').click();
    for (const representation of ['guide', 'tour']) {
      if (representation === 'tour') {
        await page
          .getByRole('button', { name: ru ? 'Интерактивный тур' : 'Interactive tour', exact: true })
          .click();
      }
      const edit = panel.getByRole('button', {
        name: ru ? 'Редактировать изображение' : 'Edit image',
        exact: true,
      });
      const replace = panel.getByRole('button', {
        name: ru ? 'Заменить изображение' : 'Replace image',
        exact: true,
      });
      await expect(edit).toBeEnabled();
      await expect(replace).toBeEnabled();
      await replace.click();
      await expect(page.locator('#guide-resource-drawer')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#guide-resource-drawer')).toHaveCount(0);
      await expect(replace).toBeFocused();
      await edit.focus();
      await page.keyboard.press('Enter');
      const child = page.frameLocator('.guide-image-editor iframe');
      await expect(
        child.locator('[data-ui="editor.floating.document-bar.apply-scenario-button"]')
      ).toBeEnabled();
      await child
        .getByRole('button', {
          name: ru ? 'Назад без применения' : 'Back without applying',
          exact: true,
        })
        .click();
      await expect(page.locator('.guide-image-editor')).toHaveCount(0);
      await expect(edit).toBeFocused();
      await edit.click();
      await child.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
      const canvas = child.locator('canvas.upper-canvas');
      await expect(canvas).toBeVisible();
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error('Missing image editor canvas');
      await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.4);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.5, {
        steps: 5,
      });
      await page.mouse.up();
      await child.locator('[data-ui="editor.floating.document-bar.apply-scenario-button"]').click();
      await expect(page.locator('.guide-image-editor')).toHaveCount(0);
      await expect(edit).toBeFocused();
      await info.attach(`${representation}-inspector-actions-${locale}-${theme}`, {
        body: await page.screenshot({
          path: `.tmp/backlog6-w16-visual/${representation}-actions-${locale}-${theme}.png`,
        }),
        contentType: 'image/png',
      });
    }
  });
}

for (const [locale, theme] of [
  ['ru', 'light'],
  ['en', 'dark'],
] as const) {
  test(`tour inspector element matrix in ${locale} ${theme}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      locale,
      theme === 'light' ? { width: 1280, height: 560 } : { width: 1920, height: 900 },
      'compare',
      { tourFixture: '1' }
    );
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    const category = (name: string) =>
      panel.getByRole('navigation').getByRole('button', { name, exact: true });
    const visit = async (expected: number, label: string) => {
      const buttons = panel.getByRole('navigation').getByRole('button');
      await expect(buttons).toHaveCount(expected);
      for (let index = 0; index < expected; index++) {
        const button = buttons.nth(index);
        const pressed = await button.getAttribute('aria-pressed');
        await button.hover();
        await expect(button).toHaveAttribute('aria-pressed', pressed!);
        await button.focus();
        await page.keyboard.press('Enter');
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        await expect(panel.locator('.guide-inspector-disclosure')).toHaveCount(0);
        if (
          label === 'image-slide' &&
          (await button.getAttribute('aria-label')) === t('scenario.editor.tourObjects')
        ) {
          const geometry = await panel.evaluate((node) => {
            const heading = node
              .querySelector('[data-ui="shared.categorized-inspector.section-heading"]')!
              .getBoundingClientRect();
            const actions = [...node.querySelectorAll('.tour-object-actions button')].map((entry) =>
              entry.getBoundingClientRect()
            );
            return {
              top: actions[0]!.top - heading.bottom,
              heights: actions.map((entry) => entry.height),
              gaps: actions.slice(1).map((entry, index) => entry.top - actions[index]!.bottom),
            };
          });
          expect(geometry.top).toBeGreaterThanOrEqual(8);
          expect(geometry.heights.every((height) => height >= 32)).toBe(true);
          expect(geometry.gaps.every((gap) => gap >= 8)).toBe(true);
          await page.screenshot({
            path: `.tmp/backlog6-w16-visual/slide-object-actions-${locale}-${theme}.png`,
          });
        }
      }
      await category(t('scenario.editor.tourNarration')).click();
      await expect(panel.locator('.tour-audio-acquisition')).toBeVisible();
      await panel
        .getByRole('button', { name: t('scenario.editor.inspectorShowAll'), exact: true })
        .click();
      await expect(panel.getByRole('navigation')).toHaveCount(0);
      await panel
        .getByRole('button', { name: t('scenario.editor.inspectorShowSections'), exact: true })
        .click();
      await expect(category(t('scenario.editor.tourNarration'))).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await info.attach(`${label}-${locale}-${theme}`, {
        body: await page.screenshot({
          path: `.tmp/backlog6-w16-visual/${label}-${locale}-${theme}.png`,
        }),
        contentType: 'image/png',
      });
    };
    await visit(5, 'image-slide');
    await panel
      .locator('.tour-audio-acquisition input[type="file"]')
      .setInputFiles('tooling/test/e2e/fixtures/review-voice-speech.wav');
    await expect(panel).toContainText('review-voice-speech.wav');
    for (const [key, count] of [
      ['tourHotspot', 5],
      ['tourAnnotation', 3],
      ['tourMask', 3],
    ] as const) {
      await category(t('scenario.editor.tourObjects')).click();
      if (key === 'tourHotspot') {
        await panel.getByRole('button', { name: t(`scenario.editor.${key}`), exact: true }).click();
      } else {
        await panel.locator('.tour-object-add button').click();
        await page
          .getByRole('group', { name: t('scenario.editor.tourAddObject'), exact: true })
          .getByRole('button', { name: t(`scenario.editor.${key}`), exact: true })
          .click();
      }
      await checkTourObjectActions(panel, t);
      if (key === 'tourHotspot') {
        await info.attach(`object-delete-${locale}-${theme}`, {
          body: await panel.screenshot(),
          contentType: 'image/png',
        });
      }
      await panel
        .getByRole('button', { name: t('scenario.editor.inspectorShowAll'), exact: true })
        .click();
      await checkTourObjectActions(panel, t);
      await expect
        .soft(
          panel.getByRole('textbox', { name: t('scenario.editor.tourHintRadius'), exact: true })
        )
        .toHaveCount(0);
      await panel
        .getByRole('button', { name: t('scenario.editor.inspectorShowSections'), exact: true })
        .click();
      await visit(count, key);
      if (key === 'tourAnnotation') {
        await category(t('scenario.editor.appearance')).click();
        for (const placement of ['tourCaptionTop', 'tourCaptionBottom'] as const) {
          await panel
            .getByRole('button', { name: t('scenario.editor.tourSlidePlacement'), exact: true })
            .click();
          await page
            .getByRole('option', { name: t(`scenario.editor.${placement}`), exact: true })
            .click();
          await checkTourObjectActions(panel, t);
          await expect
            .soft(
              panel.getByRole('textbox', { name: t('scenario.editor.tourHintRadius'), exact: true })
            )
            .toHaveCount(0);
        }
      }
      if (key === 'tourHotspot') {
        await category(t('scenario.editor.appearance')).click();
        const markerInheritance = panel.getByRole('switch', {
          name: t('scenario.editor.tourMarkerInherit'),
          exact: true,
        });
        const markerSize = panel.getByRole('textbox', {
          name: t('scenario.editor.tourMarkerSize'),
          exact: true,
        });
        await expect(markerInheritance).toBeChecked();
        await expect(markerSize).toBeDisabled();
        await markerInheritance.uncheck();
        await markerSize.fill('48');
        await markerSize.press('Enter');
        await expect(markerSize).toHaveValue('48');
        await markerInheritance.check();
        await expect(markerSize).toHaveValue('30');
        await expect(markerSize).toBeDisabled();
        await category(t('scenario.editor.tourNarration')).click();
        await expect(panel).not.toContainText('review-voice-speech.wav');
        await panel
          .locator('.tour-audio-acquisition input[type="file"]')
          .setInputFiles('tooling/test/e2e/fixtures/review-voice-speech.wav');
        await expect(panel).toContainText('review-voice-speech.wav');
      }
      if (key === 'tourMask') {
        await category(t('scenario.editor.tourEffectType')).click();
        for (const effect of ['tourSpotlight', 'tourBlur', 'tourHighlight'] as const) {
          await panel
            .getByRole('button', { name: t('scenario.editor.tourMask'), exact: true })
            .click();
          await page
            .getByRole('option', { name: t(`scenario.editor.${effect}`), exact: true })
            .click();
          await category(t('scenario.editor.appearance')).click();
          await expect(
            panel.getByRole('switch', {
              name: t('scenario.editor.tourUseCentralStyle'),
              exact: true,
            })
          ).toBeVisible();
          if (effect === 'tourHighlight') await checkTourObjectActions(panel, t);
          if (effect === 'tourBlur') {
            await expect(
              panel.getByRole('textbox', { name: t('scenario.editor.tourBlurRadius'), exact: true })
            ).toBeVisible();
          }
          await category(t('scenario.editor.tourEffectType')).click();
        }
      }
      await panel
        .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
        .click();
    }
    await page
      .locator('#guide-library-panel')
      .getByRole('button', { name: t('scenario.editor.tourAddNavigation'), exact: true })
      .click();
    await visit(5, 'navigation-slide');
    await category(t('scenario.editor.tourContentsLinks')).click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourAddButton'), exact: true })
      .click();
    await checkTourObjectActions(panel, t);
    await info.attach(`navigation-delete-${locale}-${theme}`, {
      body: await panel.screenshot(),
      contentType: 'image/png',
    });
    await panel
      .getByRole('button', { name: t('scenario.editor.inspectorShowAll'), exact: true })
      .click();
    await checkTourObjectActions(panel, t);
    await panel
      .getByRole('button', { name: t('scenario.editor.inspectorShowSections'), exact: true })
      .click();
    await visit(2, 'navigation-button');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page
      .locator('#guide-library-panel')
      .getByRole('button', { name: t('scenario.editor.tourEnd'), exact: true })
      .click();
    await expect(panel.getByRole('navigation')).toHaveCount(0);
    await expect(panel.locator('input,textarea').first()).toBeVisible();
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    const defaults = panel.getByRole('navigation').getByRole('button');
    await expect(defaults).toHaveCount(7);
    for (let index = 0; index < 7; index++) {
      await defaults.nth(index).click();
      await expect(defaults.nth(index)).toHaveAttribute('aria-pressed', 'true');
      await expect
        .soft(
          panel.getByRole('textbox', { name: t('scenario.editor.tourHintRadius'), exact: true })
        )
        .toHaveCount(0);
      expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.screenshot({
        path: `.tmp/backlog6-w16-visual/tour-default-${index}-${locale}-${theme}.png`,
      });
    }
    await expect(page.getByRole('status').first()).toHaveText(t('scenario.editor.guideSaved'));
    await page.reload();
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    await page.locator('.tour-slide-select').first().click();
    await category(t('scenario.editor.tourNarration')).click();
    await expect(panel.locator('.tour-audio-binding')).toContainText('review-voice-speech.wav');
    await category(t('scenario.editor.tourObjects')).click();
    await panel.locator('[data-inspector-object]').first().click();
    await category(t('scenario.editor.tourNarration')).click();
    await expect(panel.locator('.tour-audio-binding')).toContainText('review-voice-speech.wav');
  });
}

for (const [locale, theme] of [
  ['ru', 'light'],
  ['en', 'dark'],
] as const) {
  test(`guide inspector element matrix in ${locale} ${theme}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, theme, locale, { width: 1280, height: 560 });
    const panel = page.locator('#guide-inspector-panel');
    const step = page.locator('article#compare');
    await step.locator('.guide-block[data-kind="text"] textarea').first().focus();
    const checkPlacement = async (kind: string) => {
      const block = step.locator(`.guide-block[data-kind="${kind}"]`).last();
      await expect(panel.locator('.guide-block-inspector')).toBeVisible();
      await panel
        .getByRole('button', { name: t('scenario.editor.guideHalfWidth'), exact: true })
        .click();
      await expect(block).toHaveAttribute('data-width', '50');
      await expect(
        panel.getByRole('button', { name: t('scenario.editor.guideEditImage'), exact: true })
      ).toHaveCount(0);
      expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await info.attach(`${kind}-${locale}-${theme}`, {
        body: await page.screenshot({
          path: `.tmp/backlog6-w16-visual/${kind}-${locale}-${theme}.png`,
        }),
        contentType: 'image/png',
      });
    };
    await checkPlacement('text');
    for (const [kind, key] of [
      ['heading', 'guideAddHeading'],
      ['note', 'guideAddNote'],
      ['image-slot', 'guideAddImage'],
    ] as const) {
      const add = step
        .locator('.guide-insertion-block')
        .last()
        .getByRole('button', { name: t('scenario.editor.guideAddBlock'), exact: true });
      await add.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: t(`scenario.editor.${key}`), exact: true }).click();
      if (kind !== 'image-slot') {
        await step
          .locator(`.guide-block[data-kind="${kind}"]`)
          .last()
          .locator('input,textarea')
          .first()
          .fill(`${kind} ${'A long readable title '.repeat(4)}`);
      } else await step.locator('.guide-image-slot').last().focus();
      await checkPlacement(kind);
    }
    const section = page.locator('.guide-section-title').first();
    await section.fill('Long section title '.repeat(8));
    await expect(
      panel.getByRole('region', { name: t('scenario.editor.guideNumbering'), exact: true })
    ).toBeVisible();
    await expect(panel.getByRole('navigation')).toHaveCount(0);
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await info.attach(`section-${locale}-${theme}`, {
      body: await page.screenshot({
        path: `.tmp/backlog6-w16-visual/section-${locale}-${theme}.png`,
      }),
      contentType: 'image/png',
    });
  });
}

async function checkTourObjectActions(panel: Locator, t: ReturnType<typeof createTranslator>) {
  const back = panel.getByRole('button', {
    name: t('scenario.editor.tourBackToSlide'),
    exact: true,
  });
  await back.scrollIntoViewIfNeeded();
  await panel.locator('.guide-panel-scroll').evaluate((node) => {
    node.scrollTop = 0;
  });
  const geometry = await back.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const scroll = node.closest('.guide-panel-scroll')!.getBoundingClientRect();
    return {
      inset: rect.top - scroll.top,
      left: rect.left - scroll.left,
      right: scroll.right - rect.right,
      height: rect.height,
    };
  });
  expect.soft(geometry.inset).toBeGreaterThanOrEqual(8);
  expect.soft(geometry.left).toBeGreaterThanOrEqual(0);
  expect.soft(geometry.right).toBeGreaterThanOrEqual(0);
  expect.soft(geometry.height).toBeGreaterThanOrEqual(32);
  await back.hover();
  await back.focus();
  await back.page().keyboard.press('Tab');
  await back.page().keyboard.press('Shift+Tab');
  await expect(back).toBeFocused();
  const focus = await back.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      visible: node.matches(':focus-visible'),
      width: parseFloat(style.borderTopWidth),
      style: style.borderTopStyle,
      color: style.borderTopColor,
    };
  });
  expect(focus.visible).toBe(true);
  expect(focus.width).toBeGreaterThanOrEqual(1);
  expect(focus.style).not.toBe('none');
  expect(focus.color).not.toBe('rgba(0, 0, 0, 0)');
  expect
    .soft(
      await back.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return [box.left + 2, box.right - 2].every((x) =>
          node.contains(document.elementFromPoint(x, box.top + box.height / 2))
        );
      })
    )
    .toBe(true);
  const remove = panel.getByRole('button', { name: t('common.actions.delete'), exact: true });
  await remove.scrollIntoViewIfNeeded();
  const separator = await remove.evaluate((node) => {
    const group = node.parentElement!;
    const style = getComputedStyle(group);
    return {
      border: parseFloat(style.borderTopWidth),
      padding: parseFloat(style.paddingTop),
      color: style.borderTopColor,
    };
  });
  expect.soft(separator.border).toBeGreaterThanOrEqual(1);
  expect.soft(separator.padding).toBeGreaterThanOrEqual(8);
  expect.soft(separator.color).not.toBe('rgba(0, 0, 0, 0)');
}
