import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { evaluateInTarget } from '../support/recording-action';

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`marker drag handle distinguishes pointer and Tab focus ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      const target = (await page.locator('#measurement-target').boundingBox())!;
      await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
      const popover = page.locator('[data-ui="content.design-review.popover"]');
      const comment = popover.getByRole('textbox', {
        name: /Element comment|Комментарий к элементу/u,
      });
      await comment.fill('Marker focus check');
      await comment.press('Enter');
      await expect(popover).toHaveCount(0);
      const marker = page.locator('[data-ui="content.annotation-marker-button"]');
      const handle = page.locator('[data-ui="content.annotation-marker-drag-handle"]');
      await marker.hover();
      await handle.click({ position: { x: 10, y: 17 } });
      await expect(handle).toHaveCSS('outline-style', 'none');
      const before = (await marker.boundingBox())!;
      const grip = (await handle.boundingBox())!;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + 17);
      await page.mouse.down();
      await page.mouse.move(grip.x + grip.width / 2 + 12, grip.y + 17 + 20, {
        steps: 4,
      });
      await page.mouse.up();
      await expect.poll(async () => (await marker.boundingBox())!.x - before.x).toBeCloseTo(12, 0);
      await expect(handle).toHaveCSS('outline-style', 'none');
      await page.screenshot({ path: info.outputPath('marker-pointer.png'), fullPage: false });
      await marker.focus();
      await page.keyboard.press('Tab');
      await expect(handle).toBeFocused();
      await expect(handle).not.toHaveCSS('outline-style', 'none');
      await page.screenshot({ path: info.outputPath('marker-keyboard.png'), fullPage: false });
    } finally {
      await page.close();
      await popup.close();
    }
  });

  test(`reset icon follows toolbar mode ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await popup.evaluate(
        async (theme) => {
          await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
        },
        size.width === 1920 ? 'dark' : 'light'
      );
      const reset = page.locator('[data-ui="content.toolbar.reset-all-button"]');
      for (const mode of [
        'cursor',
        'drawing',
        'highlighter',
        'quick-edit',
        'design-review',
        'cursor',
      ]) {
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
        const icon = mode === 'cursor' ? 'rotate-ccw' : 'brush-cleaning';
        await expect(reset.locator(`svg.lucide-${icon}`)).toBeVisible();
        await expect(reset.locator('svg')).toHaveCount(1);
        await expect(reset.locator('svg')).toHaveAttribute('width', '18');
        await page.screenshot({
          path: info.outputPath(`reset-${mode}.png`),
          fullPage: false,
          animations: 'disabled',
        });
      }
    } finally {
      await page.close();
      await popup.close();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`design review export compact controls ${theme} ${viewport.name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(90000);
      const { page, popup } = await openDesignReview(
        context,
        extensionId,
        hostOrigin,
        viewport.size
      );
      try {
        const trigger = page.locator('[data-ui="content.toolbar.annotation-export-button"]');
        const menu = page.locator(
          '[data-ui="content.toolbar.annotation-export-menu"] .sniptale-toolbar-menu'
        );
        const configure = page.locator(
          '[data-ui="content.toolbar.annotation-export.configure-export"]'
        );
        for (const locale of ['ru', 'en']) {
          await popup.evaluate(
            async ({ theme, locale }) => {
              await chrome.storage.local.set({
                'sniptale-theme-preference': theme,
                'sniptale-locale-preference': locale,
              });
            },
            { theme, locale }
          );
          for (const displayMode of ['horizontal', 'vertical'] as const) {
            for (const compactMenus of [false, true]) {
              await popup.evaluate(
                async ({ displayMode, compactMenus }) => {
                  const current = (await chrome.storage.sync.get('sniptale_settings'))[
                    'sniptale_settings'
                  ];
                  await chrome.storage.sync.set({
                    sniptale_settings: {
                      ...current,
                      contentToolbar: {
                        ...current?.contentToolbar,
                        displayMode,
                        compactMenus,
                        freePlacement: false,
                        position: null,
                        dockEdge: displayMode === 'horizontal' ? 'bottom' : 'right-bottom',
                      },
                    },
                  });
                },
                { displayMode, compactMenus }
              );
              await page.reload();
              await popup.evaluate(async (origin) => {
                const tab = (await chrome.tabs.query({})).find(
                  (candidate) => candidate.url === `${origin}/`
                );
                if (tab?.id === undefined) throw new Error('Host tab not found');
                await chrome.runtime.sendMessage({
                  type: 'PAGE_ACCESS',
                  operation: 'register-granted-site',
                  tabId: tab.id,
                  __sniptaleRuntimeFreshness: {
                    issuedAtEpochMs: Date.now(),
                    nonce: crypto.randomUUID(),
                  },
                });
                await chrome.tabs.sendMessage(tab.id, {
                  type: 'ENABLE_SCREENSHOT_MODE',
                  workingMode: 'design-review',
                });
              }, hostOrigin);
              await page.bringToFront();
              await expect(page.locator('[data-ui="content.toolbar.root"]')).toHaveAttribute(
                'data-display-mode',
                displayMode
              );
              await trigger.click();
              await expect(menu).toBeVisible();
              await expect(menu).toHaveClass(
                compactMenus ? /sniptale-toolbar-menu--compact/ : /sniptale-toolbar-menu/
              );
              const bounds = (await menu.boundingBox())!;
              expect(Math.abs(bounds.width - 240)).toBeLessThanOrEqual(1);
              expect(bounds.x).toBeGreaterThanOrEqual(0);
              expect(bounds.y).toBeGreaterThanOrEqual(0);
              expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.size.width);
              expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.size.height);
              const target = (await configure.boundingBox())!;
              expect(Math.abs(target.width - 28)).toBeLessThanOrEqual(1);
              expect(Math.abs(target.height - 28)).toBeLessThanOrEqual(1);
              const row = (await configure.locator('..').boundingBox())!;
              expect(
                Math.abs(target.y + target.height / 2 - row.y - row.height / 2)
              ).toBeLessThanOrEqual(1);
              await configure.hover();
              await expect(configure).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
              await expect(configure).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
              expect(await configure.evaluate((node) => node.matches(':focus-visible'))).toBe(
                false
              );
              expect(
                await menu
                  .locator('.sniptale-toolbar-menu-item-label')
                  .evaluateAll((nodes) =>
                    nodes.every((node) => node.scrollWidth <= node.clientWidth)
                  )
              ).toBe(true);
              await page.screenshot({
                path: info.outputPath(`export-${locale}-${displayMode}-${compactMenus}.png`),
                fullPage: false,
                animations: 'disabled',
              });
              await page.keyboard.press('Escape');
              await expect(menu).toBeHidden();
              await expect(trigger).toBeFocused();
            }
          }
        }
        await page.setViewportSize({ width: 960, height: 560 });
        await trigger.click();
        await expect(menu).toBeVisible();
        const narrow = (await menu.boundingBox())!;
        expect(narrow.x + narrow.width).toBeLessThanOrEqual(960);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        const session = await context.browser()!.newBrowserCDPSession();
        try {
          const before = new Set(
            (await session.send('Target.getTargets')).targetInfos.map((target) => target.targetId)
          );
          await configure.click();
          await expect(menu).toBeHidden();
          let popupTarget: string | undefined;
          await expect
            .poll(async () => {
              popupTarget = (await session.send('Target.getTargets')).targetInfos.find(
                (target) =>
                  !before.has(target.targetId) &&
                  target.url.includes(`${extensionId}/apps/extension/src/popup/index.html`)
              )?.targetId;
              return popupTarget;
            })
            .toBeTruthy();
          await expect
            .poll(() =>
              evaluateInTarget(
                context,
                popupTarget!,
                `Boolean(document.querySelector('[data-ui="popup.export.export-button"]'))`
              )
            )
            .toBe(true);
        } finally {
          await session.detach();
        }
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    ...PRIMARY_BROWSER_VIEWPORTS,
    { name: '960x560', size: { width: 960, height: 560 } },
  ]) {
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
        const exportMenu = page.locator(
          '[data-ui="content.toolbar.annotation-export-menu"] .sniptale-toolbar-menu'
        );
        expect((await exportMenu.boundingBox())!.width).toBeLessThanOrEqual(241);
        const configureExport = page.locator(
          '[data-ui="content.toolbar.annotation-export.configure-export"]'
        );
        const configureBounds = (await configureExport.boundingBox())!;
        expect(configureBounds.width).toBeLessThanOrEqual(29);
        expect(configureBounds.height).toBeLessThanOrEqual(29);
        await page.screenshot({
          path: info.outputPath('export-menu.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await toolbar.locator('[data-ui="content.toolbar.annotation-export-button"]').click();
        const elementName = (
          theme === 'dark'
            ? 'Проверить длинное название выбранного элемента '
            : 'Review the long selected element name '
        )
          .repeat(6)
          .trim();
        await page.locator('#measurement-target').evaluate((element, text) => {
          element.textContent = text;
        }, elementName);
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
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        const commentLayer = popover.locator('[data-ui="content.design-review.comment-layer"]');
        const tag = popover.locator('[data-ui="content.design-review.element-tag"]');
        await expect(tag).toHaveText('BUTTON');
        await expect(
          popover
            .locator('[data-ui="content.design-review.popover-drag-handle"]')
            .locator('[data-ui="content.design-review.element-tag"]')
        ).toBeVisible();
        const tagBounds = (await tag.boundingBox())!;
        expect(Math.abs(tagBounds.x - panelBounds.x - 13)).toBeLessThanOrEqual(1);
        expect(
          Math.abs(tagBounds.y + tagBounds.height / 2 - closeBounds.y - closeBounds.height / 2)
        ).toBeLessThanOrEqual(1);
        const headerText = popover.locator('[data-ui="content.design-review.element-text"]');
        await expect(headerText).toHaveText(elementName);
        await expect(headerText).toHaveAttribute('title', elementName);
        const headerTextBounds = (await headerText.boundingBox())!;
        expect(headerTextBounds.width).toBeLessThanOrEqual(panelBounds.width / 2 + 1);
        expect(
          Math.abs(headerTextBounds.x - tagBounds.x - tagBounds.width - 8)
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(
            headerTextBounds.y + headerTextBounds.height / 2 - tagBounds.y - tagBounds.height / 2
          )
        ).toBeLessThanOrEqual(1);
        expect(
          await headerText.evaluate((element) => element.scrollWidth > element.clientWidth)
        ).toBe(true);
        await expect(headerText).toHaveCSS('text-overflow', 'ellipsis');
        const selectorBounds = (await popover
          .locator('[data-ui="content.design-review.element-selector"]')
          .boundingBox())!;
        const navigationBoundsFooter = (await popover
          .locator('[data-ui="content.design-review.tree-navigation"]')
          .boundingBox())!;
        expect(Math.abs(navigationBoundsFooter.x - panelBounds.x - 13)).toBeLessThanOrEqual(1);
        expect(
          Math.abs(selectorBounds.x - navigationBoundsFooter.x - navigationBoundsFooter.width - 8)
        ).toBeLessThanOrEqual(1);
        await expect.soft(commentLayer).toHaveCSS('padding-top', '32px', { timeout: 500 });
        expect.soft(closeBounds.width, 'Close retains a compact target').toBe(24);
        expect.soft(closeBounds.height).toBe(24);
        expect
          .soft(Math.abs(panelBounds.x + panelBounds.width - closeBounds.x - closeBounds.width - 5))
          .toBeLessThanOrEqual(1);
        expect.soft(Math.abs(closeBounds.y - panelBounds.y - 5)).toBeLessThanOrEqual(1);
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
        expect.soft(backing.radius, 'Close has no separate circular backing').toBe('4px');
        expect.soft(backing.alpha).toBe(0);
        await expect(
          popover.locator('[data-ui="content.design-review.close-backing"]')
        ).toHaveCount(0);
        expect.soft(closeBounds.x).toBeGreaterThanOrEqual(0);
        expect.soft(closeBounds.y).toBeGreaterThanOrEqual(0);
        expect.soft(closeBounds.x + closeBounds.width).toBeLessThanOrEqual(viewport.size.width);
        expect.soft(closeBounds.y + closeBounds.height).toBeLessThanOrEqual(viewport.size.height);
        await page.screenshot({
          path: info.outputPath('comment-popover.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await headerText.hover();
        await page.mouse.down();
        await page.mouse.move(
          headerTextBounds.x + headerTextBounds.width / 2 + 32,
          headerTextBounds.y + headerTextBounds.height / 2 + 18,
          { steps: 4 }
        );
        await page.mouse.up();
        await expect
          .poll(async () => {
            const moved = (await popover.boundingBox())!;
            const expectedX = Math.min(
              Math.max(panelBounds.x + 32, 12),
              viewport.size.width - panelBounds.width - 12
            );
            const expectedY = Math.min(
              Math.max(panelBounds.y + 18, 12),
              viewport.size.height - panelBounds.height - 12
            );
            return Math.max(Math.abs(moved.x - expectedX), Math.abs(moved.y - expectedY));
          })
          .toBeLessThanOrEqual(1);
        await close.click();
        await expect(popover).toHaveCount(0);
        await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
        await expect(popover).toBeVisible();
        await popover
          .getByRole('button', { name: /Edit element properties|Изменить свойства элемента/u })
          .click();
        const categories = popover.getByRole('navigation').getByRole('button');
        const navigation = popover.getByRole('navigation');
        const navigationBounds = (await navigation.boundingBox())!;
        for (const category of await categories.all()) {
          const bounds = (await category.boundingBox())!;
          expect(
            Math.abs(
              bounds.x + bounds.width / 2 - navigationBounds.x - (navigationBounds.width - 1) / 2
            )
          ).toBeLessThanOrEqual(1);
        }
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
        await categories.nth(0).click();
        const bold = popover.getByRole('button', { name: /^(Weight|Насыщенность)$/u });
        const marker = page.locator('[data-ui="content.annotation-marker-button"]');
        for (let iteration = 0; iteration < 3; iteration++) {
          await bold.click();
          await expect(marker).toHaveCount(1);
          await expect(marker).toContainText('1');
          await expect(marker.locator('span')).toHaveText('1');
          if (iteration === 2)
            await page.screenshot({
              path: info.outputPath('stable-marker.png'),
              fullPage: false,
              animations: 'disabled',
            });
          await bold.click();
          await expect(marker).toHaveCount(0);
        }
        const comment = popover.getByRole('textbox', {
          name: /Element comment|Комментарий к элементу/u,
        });
        await comment.fill('Проверка композиции и сохранения комментария');
        await comment.press('Enter');
        await expect(popover).toHaveCount(0);
        await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
        const remove = popover.getByRole('button', {
          name: /^(Delete feedback|Удалить замечание)$/u,
        });
        await expect(remove).toBeVisible();
        const actionCenters = await popover
          .locator('button')
          .filter({
            has: page.locator(
              '.lucide-clipboard-copy, .lucide-text-cursor-input, .lucide-pencil, .lucide-trash-2'
            ),
          })
          .evaluateAll((buttons) =>
            buttons.map((button) => {
              const bounds = button.getBoundingClientRect();
              return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
            })
          );
        expect(actionCenters).toHaveLength(4);
        const actionStep = actionCenters[1]!.x - actionCenters[0]!.x;
        for (let index = 1; index < actionCenters.length; index++) {
          expect(
            Math.abs(actionCenters[index]!.x - actionCenters[index - 1]!.x - actionStep)
          ).toBeLessThanOrEqual(1);
          expect(Math.abs(actionCenters[index]!.y - actionCenters[0]!.y)).toBeLessThanOrEqual(1);
        }
        await expect(
          toolbar.locator('[data-ui="content.toolbar.reset-all-button"] .lucide-brush-cleaning')
        ).toBeVisible();
        await expect(remove).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
        await remove.hover();
        await expect(remove).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
        await page.screenshot({
          path: info.outputPath('delete-hover-no-border.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await remove.click();
        const confirmation = popover.locator(
          '[data-ui="content.design-review.delete-confirmation"]'
        );
        await expect(confirmation).toBeVisible();
        await confirmation.getByRole('button', { name: /^(Cancel|Отмена)$/u }).click();
        await expect(confirmation).toHaveCount(0);
        await close.click();
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
        await close.click();
        await page.evaluate(() => {
          const parent = document.createElement('div');
          parent.id = 'review-tree-parent';
          parent.style.cssText =
            'position:fixed;left:400px;top:100px;width:180px;height:100px;padding:20px;background:#ddd';
          const hidden = document.createElement('span');
          hidden.hidden = true;
          const child = document.createElement('span');
          child.id = 'review-tree-child';
          child.textContent = 'Tree child';
          const otherChild = document.createElement('span');
          otherChild.id = 'review-tree-other';
          otherChild.textContent = 'Other child';
          parent.append(hidden, child, otherChild);
          document.body.append(parent);
        });
        await page.mouse.click(410, 110);
        await expect(tag).toHaveText('DIV');
        const treeComment = popover.getByRole('textbox', {
          name: /Element comment|Комментарий к элементу/u,
        });
        const down = popover.getByRole('button', {
          name: /^(Select child element|Выбрать дочерний элемент)$/u,
        });
        const up = popover.getByRole('button', {
          name: /^(Select parent element|Выбрать родительский элемент)$/u,
        });
        await expect(up).toBeEnabled();
        await expect(down).toBeDisabled();
        await close.click();
        const otherChildBounds = (await page.locator('#review-tree-other').boundingBox())!;
        await page.mouse.click(otherChildBounds.x + 5, otherChildBounds.y + 5);
        await expect(tag).toHaveText('SPAN');
        await up.click();
        await expect(tag).toHaveText('DIV');
        await expect(down).toBeEnabled();
        await treeComment.fill('Сохранить при переходе по дереву');
        await down.click();
        await expect(tag).toHaveText('SPAN');
        await expect(
          popover.locator('[data-ui="content.design-review.element-selector"]')
        ).toContainText('review-tree-other');
        await expect(down).toBeDisabled();
        await up.click();
        await expect(tag).toHaveText('DIV');
        await expect(treeComment).toHaveValue('Сохранить при переходе по дереву');
        await page.screenshot({
          path: info.outputPath('header-tree-navigation.png'),
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
