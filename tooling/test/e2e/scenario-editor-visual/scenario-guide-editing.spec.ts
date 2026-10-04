import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

for (const [theme, locale] of [
  ['light', 'en'],
  ['dark', 'ru'],
] as const) {
  test(`guide editing and insertion stay separate in ${theme}`, async ({ page, hostOrigin }) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, locale, { width: 1280, height: 720 });
    const insertion = page.locator('.guide-document > .guide-insertion-item').first();
    const plus = insertion.locator('button');
    const menu = page.locator('.guide-action-menu--insert');
    await plus.hover();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await plus.click();
    await expect(menu).toBeVisible();
    await menu.locator('button').first().click();
    await expect(page.locator('main article')).toHaveCount(3);
    await page.locator('.guide-history-controls button').first().click();
    await expect(page.locator('main article')).toHaveCount(2);
    const block = page.locator('[data-block-id="description"]');
    const field = block.locator('textarea');
    await field.click();
    await expect(block).toBeFocused();
    await expect(plus).toBeDisabled();
    await expect(insertion).toHaveAttribute('inert', '');
    await expect(insertion).toHaveCSS('pointer-events', 'none');
    await block.press('Enter');
    await expect(field).toBeFocused();
    await field.press('Shift+Enter');
    await expect(field).toBeFocused();
    await field.press('Enter');
    await expect(block).toBeFocused();
    await block.press('Enter');
    await field.press('Escape');
    await block.press('Escape');
    await expect(block).toBeFocused();
    await expect(block).toHaveAttribute('data-selected', 'true');
    await expect(block).toHaveCSS('outline-style', 'none');
    await expect(block).not.toHaveCSS('border-radius', '0px');
    const image = page.locator('[data-block-id="before"]');
    await image.locator('img').click();
    const placement = page.locator(
      '.guide-image-inspector [aria-label="' +
        (locale === 'en' ? 'Block width' : 'Ширина блока') +
        '"]'
    );
    await expect(placement).toBeVisible();
    await placement.locator('button').nth(1).click();
    await expect(placement.locator('button').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await image.locator('[data-frame-image]').click();
    await expect(image.locator('.guide-image-tools [aria-pressed="true"]')).toHaveCount(1);
    const inset = await image.evaluate((element) => {
      const outer = element.getBoundingClientRect();
      const action = element.querySelector('.guide-block-actions')!.getBoundingClientRect();
      return outer.right - action.right;
    });
    expect(inset).toBeGreaterThan(0);
    await image.locator('[data-frame-image]').click();
    await page.locator('article#compare > header').click({ position: { x: 5, y: 5 } });
    await expect(plus).toBeEnabled();
    await plus.hover();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    issues.assertClean();
  });
}

for (const [theme, locale] of [
  ['light', 'en'],
  ['dark', 'ru'],
] as const) {
  test(`image crop controls retain application surfaces in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    await openVisualHarness(page, hostOrigin, theme, locale, { width: 1280, height: 720 });
    const image = page.locator('[data-block-id="before"]');
    await image.locator('img').click();
    const inspector = page.locator('.guide-image-inspector');
    const actions = inspector.locator('.guide-image-controls > button');
    await expect(actions).toHaveCount(2);
    expect(
      await actions.first().evaluate((button) => {
        const settings = button.parentElement!.querySelectorAll('.guide-inspector-group');
        return [...settings].every(
          (group) => !!(group.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)
        );
      })
    ).toBe(true);
    const placement = inspector.getByRole('group', {
      name: locale === 'en' ? 'Block width' : 'Ширина блока',
      exact: true,
    });
    const boxes = await placement.getByRole('button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { y: rect.y, height: rect.height, width: rect.width };
      })
    );
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box.y).toBeCloseTo(boxes[0]!.y, 1);
      expect(box.height).toBeCloseTo(boxes[0]!.height, 1);
      expect(box.width).toBeGreaterThan(30);
    }
    await actions.last().scrollIntoViewIfNeeded();
    await expect(actions.last()).toBeInViewport();
    await page.screenshot({ path: `.tmp/backlog7/w11-image-actions-${theme}.png` });
    const zoom = inspector.locator('input[type="range"]').first();
    await expect(inspector.locator('.guide-image-overview-map')).toHaveCount(0);
    await inspector
      .getByRole('button', {
        name: locale === 'en' ? 'Frame and image' : 'Рамка и изображение',
        exact: true,
      })
      .click();
    await expect(image.locator('[data-frame-image]')).toBeFocused();
    await expect(actions).toHaveCount(0);
    await expect(inspector.locator('.guide-image-overview-map')).toBeVisible();
    await expect(zoom).toHaveAttribute('aria-label', locale === 'en' ? 'Zoom, %' : 'Масштаб, %');
    const toolbar = image.locator('.guide-image-tools');
    const cancel = toolbar.getByRole('button', {
      name: locale === 'en' ? 'Cancel' : 'Отмена',
      exact: true,
    });
    const bounds = toolbar.locator('button[aria-pressed]');
    const colors = await cancel.evaluate((button) => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--sniptale-color-surface-panel)';
      probe.style.color = 'var(--sniptale-color-text-primary)';
      button.append(probe);
      const style = getComputedStyle(probe);
      const result = {
        background: style.backgroundColor,
        color: style.color,
        selected: '',
        hover: '',
      };
      probe.style.backgroundColor =
        'color-mix(in srgb, var(--sniptale-color-accent) 15%, var(--sniptale-color-surface-panel))';
      result.selected = getComputedStyle(probe).backgroundColor;
      probe.style.backgroundColor =
        'color-mix(in srgb, var(--sniptale-color-text-primary) 8%, var(--sniptale-color-surface-panel))';
      result.hover = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return result;
    });
    await page.mouse.move(1, 1);
    await expect(cancel).toHaveCSS('background-color', colors.background);
    await expect(cancel).toHaveCSS('color', colors.color);
    await expect(bounds).toHaveCSS('background-color', colors.selected);
    await bounds.click();
    await page.mouse.move(1, 1);
    await expect(bounds).toHaveAttribute('aria-pressed', 'false');
    await expect(bounds).toHaveCSS('background-color', colors.background);
    await expect(bounds).toHaveCSS('color', colors.color);
    await bounds.hover();
    await expect(bounds).toHaveCSS('background-color', colors.hover);
    await cancel.hover();
    await expect(cancel).toHaveCSS('background-color', colors.hover);
    await expect(cancel).toHaveCSS('color', colors.color);
    await bounds.click();
    await expect(bounds).toHaveAttribute('aria-pressed', 'true');
    await expect(bounds).toHaveCSS('color', colors.color);
    await expect(bounds).toHaveCSS('background-color', colors.selected);
    await page.screenshot({ path: `.tmp/backlog7/w10-crop-${theme}.png` });
    await page.setViewportSize({ width: 1024, height: 640 });
    await expect(cancel).toBeInViewport();
    await page.screenshot({ path: `.tmp/backlog7/w10-crop-${theme}-compact.png` });
    await cancel.click();
    await inspector
      .getByRole('button', {
        name: locale === 'en' ? 'Quarter width' : 'На четверть ширины',
        exact: true,
      })
      .click();
    await inspector
      .getByRole('button', {
        name: locale === 'en' ? 'Frame and image' : 'Рамка и изображение',
        exact: true,
      })
      .click();
    expect((await image.locator('figure').boundingBox())!.width).toBeLessThan(160);
    await expect(cancel).toHaveCSS('height', '24px');
    await expect(cancel).toHaveCSS('padding-left', '0px');
    await cancel.click();
    await expect(inspector.locator('.guide-image-overview-map')).toHaveCount(0);
    await expect(image.locator('figure')).toHaveAttribute('data-editing', 'false');
  });
}
