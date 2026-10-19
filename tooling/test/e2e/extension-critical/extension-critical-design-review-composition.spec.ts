import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`design review composition ${theme} ${viewport.name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const setup = await context.newPage();
      await setup.setViewportSize(viewport.size);
      await setup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
      await setup.evaluate(async (theme) => {
        await chrome.storage.local.set({
          'sniptale-locale-preference': 'ru',
          'sniptale-theme-preference': theme,
        });
      }, theme);
      await setup.close();
      const { page, popup } = await openDesignReview(
        context,
        extensionId,
        hostOrigin,
        viewport.size
      );
      try {
        const toolbar = page.locator('[data-ui="content.toolbar.root"]');
        await expect(toolbar).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: info.outputPath('toolbar-idle.png'),
          fullPage: false,
          animations: 'disabled',
        });
        const geometry = await toolbar.locator('button').evaluateAll((buttons) =>
          buttons
            .filter((button) => button.getBoundingClientRect().width > 0)
            .map((button) => {
              const rect = button.getBoundingClientRect();
              const icon = button.querySelector('svg')?.getBoundingClientRect();
              const style = getComputedStyle(button);
              return {
                id: button.dataset.ui,
                title: button.title,
                width: rect.width,
                height: rect.height,
                icon: icon ? [icon.width, icon.height] : null,
                font: style.font,
                color: style.color,
              };
            })
        );
        await info.attach('toolbar-geometry', {
          body: JSON.stringify(geometry, null, 2),
          contentType: 'application/json',
        });
        await toolbar
          .locator('[data-ui="content.toolbar.design-review-measurements-button"]')
          .click();
        await page.screenshot({
          path: info.outputPath('toolbar-active.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await toolbar.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.screenshot({
          path: info.outputPath('mode-menu.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await toolbar.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await toolbar.locator('[data-ui="content.toolbar.annotation-export-button"]').click();
        await expect(
          page.locator('[data-ui="content.toolbar.annotation-export-menu"] .sniptale-toolbar-menu')
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath('export-menu.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await toolbar.locator('[data-ui="content.toolbar.annotation-export-button"]').click();
        const target = (await page.locator('#measurement-target').boundingBox())!;
        await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
        const popover = page.locator('[data-ui="content.design-review.popover"]');
        await expect(popover).toBeVisible();
        await expect(popover).toHaveCSS('font-weight', '400');
        const panelAlpha = await popover.evaluate((node) => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const drawing = canvas.getContext('2d')!;
          drawing.fillStyle = getComputedStyle(node).backgroundColor;
          drawing.fillRect(0, 0, 1, 1);
          return drawing.getImageData(0, 0, 1, 1).data[3];
        });
        expect(panelAlpha, 'Design Review hides underlying page text').toBe(255);
        const close = popover.getByRole('button', { name: /^(Close|Закрыть)$/u });
        const panelBounds = (await popover.boundingBox())!;
        const closeBounds = (await close.boundingBox())!;
        const commentLayer = popover.locator('[data-ui="content.design-review.comment-layer"]');
        await expect.soft(commentLayer).toHaveCSS('padding-top', '16px', { timeout: 500 });
        expect.soft(closeBounds.width, 'Close retains a compact target').toBe(24);
        expect.soft(closeBounds.height).toBe(24);
        expect
          .soft(Math.abs(closeBounds.x + closeBounds.width / 2 - panelBounds.x - panelBounds.width))
          .toBeLessThanOrEqual(2);
        expect
          .soft(Math.abs(closeBounds.y + closeBounds.height / 2 - panelBounds.y))
          .toBeLessThanOrEqual(2);
        const backing = await close.evaluate((node) => {
          const surface = node.parentElement?.matches(
            '[data-ui="content.design-review.close-backing"]'
          )
            ? node.parentElement
            : node;
          const css = getComputedStyle(surface);
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d')!;
          context.fillStyle = css.backgroundColor;
          context.fillRect(0, 0, 1, 1);
          return { radius: css.borderRadius, alpha: context.getImageData(0, 0, 1, 1).data[3] };
        });
        expect.soft(backing.radius, 'Close has a circular backing over page imagery').toBe('50%');
        expect.soft(backing.alpha).toBe(255);
        expect.soft(closeBounds.x).toBeGreaterThanOrEqual(0);
        expect.soft(closeBounds.y).toBeGreaterThanOrEqual(0);
        expect.soft(closeBounds.x + closeBounds.width).toBeLessThanOrEqual(viewport.size.width);
        expect.soft(closeBounds.y + closeBounds.height).toBeLessThanOrEqual(viewport.size.height);
        await page.screenshot({
          path: info.outputPath('comment-popover.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await close.click();
        await expect(popover).toHaveCount(0);
        await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
        await expect(popover).toBeVisible();
        await popover
          .getByRole('button', { name: /Edit element properties|Изменить свойства элемента/u })
          .click();
        const categories = popover.getByRole('navigation').getByRole('button');
        const names = await categories.evaluateAll((buttons) =>
          buttons.map(
            (button) =>
              button.getAttribute('aria-label') ??
              button.getAttribute('title') ??
              button.textContent
          )
        );
        await info.attach('property-categories', {
          body: JSON.stringify(names),
          contentType: 'application/json',
        });
        for (let index = 0; index < names.length; index++) {
          await categories.nth(index).click();
          await expect(categories.nth(index)).toHaveAttribute('aria-pressed', 'true');
          const categoryPaint = await categories.nth(index).evaluate((button) => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--sniptale-color-accent)';
            button.append(probe);
            const accent = getComputedStyle(probe).color;
            probe.remove();
            return { foreground: getComputedStyle(button).color, accent };
          });
          expect(categoryPaint.foreground).not.toBe(categoryPaint.accent);
          const linkedFields = popover
            .locator('[data-ui="content.design-review.side-field"]')
            .filter({ has: page.locator('[data-ui="content.design-review.side-values-compact"]') });
          for (const field of await linkedFields.all()) {
            const values = await field
              .locator('[data-ui="content.design-review.side-values-compact"]')
              .boundingBox();
            const link = await field.locator('[data-side-link="all"]').boundingBox();
            if (!values || !link) throw new Error('Linked property controls have no bounds');
            expect(
              Math.abs(values.y + values.height / 2 - link.y - link.height / 2)
            ).toBeLessThanOrEqual(1);
          }
          await page.screenshot({
            path: info.outputPath(`properties-${index}.png`),
            fullPage: false,
            animations: 'disabled',
          });
        }
        const comment = popover.getByRole('textbox', {
          name: /Element comment|Комментарий к элементу/u,
        });
        await comment.fill('Проверка композиции и сохранения комментария');
        await comment.press('Enter');
        await expect(popover).toHaveCount(0);
        await toolbar.locator('[data-ui="content.toolbar.design-review-panel-button"]').click();
        await expect(
          page.locator('[data-ui="content.design-review.feedback-panel"]')
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath('feedback-panel.png'),
          fullPage: false,
          animations: 'disabled',
        });
        const feedback = page.locator('[data-ui="content.design-review.feedback-panel"]');
        const item = feedback.locator('[data-ui="content.design-review.feedback-item"]').first();
        await item.hover();
        await expect(
          page.locator('[data-ui="content.design-review.feedback-preview"]')
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath('feedback-preview.png'),
          fullPage: false,
          animations: 'disabled',
        });
        const filter = feedback.getByRole('button', { name: /Filter|Фильтр/u });
        await filter.click();
        const filterMenu = feedback.locator(
          '[data-ui="content.design-review.feedback-filter-menu"]'
        );
        await expect(filterMenu).toBeVisible();
        const options = filterMenu.getByRole('menuitemradio');
        await options.nth(1).hover();
        const selectedBounds = (await options.first().boundingBox())!;
        const hoveredBounds = (await options.nth(1).boundingBox())!;
        expect(hoveredBounds.y - selectedBounds.y - selectedBounds.height).toBeGreaterThanOrEqual(
          1.5
        );
        await page.screenshot({
          path: info.outputPath('feedback-filter.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await page.keyboard.press('Escape');
        await expect(filterMenu).toHaveCount(0);
        await expect(filter).toBeFocused();
        const search = feedback.getByRole('textbox');
        await search.fill('нет такого замечания');
        await expect(item).toHaveCount(0);
        await search.fill('Проверка композиции');
        await expect(item).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(feedback).toHaveCount(0);
        await page.evaluate(() => {
          const image = document.createElement('img');
          image.id = 'design-review-image-target';
          image.alt = 'Review image';
          image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
          image.style.cssText =
            'position:absolute;left:800px;top:300px;width:120px;height:80px;background:#31569c';
          document.body.append(image);
        });
        await page.mouse.click(850, 340);
        await expect(popover).toBeVisible();
        await popover
          .getByRole('button', { name: /Edit element properties|Изменить свойства элемента/u })
          .click();
        await expect(
          popover.locator('[data-ui="content.design-review.settings-image"]')
        ).toBeVisible();
        await expect(popover.getByRole('navigation').getByRole('button')).toHaveCount(5);
        await page.screenshot({
          path: info.outputPath('image-properties.png'),
          fullPage: false,
          animations: 'disabled',
        });
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }
}

test('toolbar menu Escape keeps Design Review active before the next element selection', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const { page, popup } = await openDesignReview(
    context,
    extensionId,
    hostOrigin,
    PRIMARY_BROWSER_VIEWPORTS[0].size
  );
  try {
    for (const id of ['mode-selector-button', 'annotation-export-button']) {
      const trigger = page.locator(`[data-ui="content.toolbar.${id}"]`);
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toBeFocused();
      await expect(
        page.locator('[data-ui="content.toolbar.design-review-measurements-button"]')
      ).toBeVisible();
    }
    const target = (await page.locator('#measurement-target').boundingBox())!;
    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
    const popover = page.locator('[data-ui="content.design-review.popover"]');
    await expect(popover).toBeVisible();
    await page.setViewportSize({ width: 960, height: 560 });
    await expect
      .poll(async () => {
        const bounds = (await popover.boundingBox())!;
        return bounds.x >= 0 && bounds.x + bounds.width <= 960;
      })
      .toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  } finally {
    await popup.close();
    await page.close();
  }
});
