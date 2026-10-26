import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Visual review workspace preserves selection and drafts at ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const preferences = await context.newPage();
    await preferences.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
    await preferences.evaluate(async (small) => {
      await chrome.storage.local.set({
        'sniptale-locale-preference': small ? 'ru' : 'en',
        'sniptale-theme-preference': small ? 'dark' : 'light',
      });
    }, viewport.name === '1280x560');
    await preferences.close();
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport.size);
    const panel = page.locator('[data-ui="content.design-review.tool-panel"]');
    const target = page.locator('#measurement-target');
    const toolbarInspect = page.locator('[data-ui="content.toolbar.review-tool.inspect"]');
    const chooseTarget = async (id: string) => {
      const box = (await page.locator(id).boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    await page.evaluate(() => {
      const target = document.getElementById('measurement-target')!;
      target.parentElement!.id = 'review-card';
      const neighbor = target.nextElementSibling as HTMLElement;
      neighbor.id = 'review-neighbor';
      neighbor.textContent = 'Secondary action';
      target.style.fontSize = '16px';
      target.style.fontWeight = '400';
      neighbor.style.setProperty('--review-ink', '#0a141e');
      neighbor.style.setProperty('--review-family', 'Arial');
      neighbor.style.color = 'var(--review-ink)';
      neighbor.style.fontFamily = 'var(--review-family)';
      const cascade = document.createElement('style');
      cascade.id = 'review-cascade-fixture';
      cascade.textContent = '#measurement-target { width: 200px !important; }';
      document.head.append(cascade);
    });
    await toolbarInspect.click();
    await chooseTarget('#review-neighbor');
    await expect(panel.getByRole('button', { name: /^(Font|Шрифт)$/u })).toContainText('Arial');
    await expect(
      panel
        .locator('[data-ui="content.design-review.workspace-section.text"]')
        .getByText(/^#0a141e$/iu)
    ).toBeVisible();
    const selectedFrame = page.locator('.sniptale-design-review-frame[data-state="selected"]');
    const candidateFrame = page.locator('.sniptale-design-review-candidate-frame');
    const hoverBox = (await target.boundingBox())!;
    await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2);
    await expect(selectedFrame).toContainText('review-neighbor');
    const selectedBox = (await page.locator('#review-neighbor').boundingBox())!;
    await expect
      .poll(async () => {
        const frame = (await selectedFrame.boundingBox())!;
        return (
          Math.abs(frame.x - selectedBox.x) +
          Math.abs(frame.y - selectedBox.y) +
          Math.abs(frame.width - selectedBox.width) +
          Math.abs(frame.height - selectedBox.height)
        );
      })
      .toBeLessThan(1);
    await expect(candidateFrame).toBeVisible();
    await expect(candidateFrame).toContainText('measurement-target');
    await expect(candidateFrame.locator('.sniptale-design-review-frame-summary')).toBeHidden();
    await expect(selectedFrame.locator('.sniptale-design-review-frame-summary')).toBeVisible();
    await expect(candidateFrame).toHaveCSS('border-top-width', '1px');
    await expect(selectedFrame).toHaveCSS('border-top-width', '2px');
    await expect
      .poll(async () => {
        const frame = (await candidateFrame.boundingBox())!;
        return (
          Math.abs(frame.x - hoverBox.x) +
          Math.abs(frame.y - hoverBox.y) +
          Math.abs(frame.width - hoverBox.width) +
          Math.abs(frame.height - hoverBox.height)
        );
      })
      .toBeLessThan(1);
    await page.screenshot({
      path: info.outputPath('workspace-selected-and-hover.png'),
      fullPage: false,
    });
    await chooseTarget('#measurement-target');
    await expect(candidateFrame).toBeHidden();
    await expect(selectedFrame).toContainText('measurement-target');
    const layoutHeader = panel.locator(
      '[data-ui="content.design-review.workspace-section.layout"] > summary'
    );
    await layoutHeader.click();
    await expect(target).toHaveCSS('width', '200px');
    await expect(panel.getByRole('textbox', { name: /^(Width|Ширина)$/u })).toHaveValue('200');
    await page.evaluate(() => document.getElementById('review-cascade-fixture')?.remove());
    await chooseTarget('#review-neighbor');
    await chooseTarget('#measurement-target');
    await expect(panel.getByRole('textbox', { name: /^(Width|Ширина)$/u })).toHaveValue('100');
    await panel
      .locator('[data-ui="content.design-review.workspace-section.text"] > summary')
      .click();
    const sectionHeader = panel.locator(
      '[data-ui="content.design-review.workspace-section.text"] > summary'
    );
    await expect(sectionHeader).toHaveCSS('display', 'flex');
    await expect(sectionHeader).toHaveCSS('list-style-type', 'none');
    const originalPosition = (await panel.boundingBox())!;
    const fontSize = panel.getByRole('textbox', { name: /^(Size|Размер)$/u });
    await fontSize.fill('22');
    await expect(target).toHaveCSS('font-size', '22px');
    await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
    await expect(target).toHaveCSS('font-size', '16px');
    await expect(fontSize).toHaveValue('16');
    await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
    await expect(target).toHaveCSS('font-size', '22px');
    await expect(fontSize).toHaveValue('22');
    const weight = panel.getByRole('button', {
      name: /^(Weight|Насыщенность)$/u,
    });
    await weight.click();
    await weight.press('Escape');
    await expect(fontSize).toBeVisible();
    await expect(toolbarInspect).toHaveAttribute('aria-pressed', 'true');
    await weight.click();
    await page.getByRole('option', { name: '600', exact: true }).click();
    await expect(target).toHaveCSS('font-weight', '600');
    await page.screenshot({
      path: info.outputPath('workspace-visual-properties.png'),
      fullPage: false,
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: hostOrigin });
    const computed = panel.locator('[data-ui="content.design-review.computed-section"]');
    await computed.locator('summary').click();
    const filter = computed.getByRole('textbox', { name: /Filter properties|Фильтр свойств/u });
    await filter.fill('font-weight');
    await expect(computed.locator('dt')).toHaveText(['font-weight']);
    await expect(computed.locator('dd')).toHaveText(['600']);
    await computed.getByRole('button', { name: /^(Copy|Копировать)$/u }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe('font-weight: 600;');
    await filter.fill('no-such-property');
    await expect(computed.getByRole('button', { name: /^(Copy|Копировать)$/u })).toBeDisabled();
    await filter.fill('');
    await computed.locator('summary').click();
    await panel.locator('[data-ui="content.design-review.css-section"] > summary').click();
    const css = panel.getByRole('textbox', { name: /CSS declarations|Декларации CSS/u });
    await css.fill('color: rgb(20, 40, 60);');
    await chooseTarget('#review-neighbor');
    await expect(css).toHaveValue('');
    const secondPosition = (await panel.boundingBox())!;
    expect(Math.abs(secondPosition.x - originalPosition.x)).toBeLessThan(1);
    expect(Math.abs(secondPosition.y - originalPosition.y)).toBeLessThan(1);
    await chooseTarget('#measurement-target');
    await expect(css).toHaveValue('color: rgb(20, 40, 60);');
    await css.focus();
    await css.press('End');
    await css.pressSequentially(' width: 144px;');
    await css.press('Escape');
    await expect(css).toHaveValue('color: rgb(20, 40, 60);');
    await expect(toolbarInspect).toHaveAttribute('aria-pressed', 'true');
    await panel.getByRole('button', { name: /^(Close|Закрыть)$/u }).click();
    await expect(panel).toBeHidden();
    await expect(toolbarInspect).toHaveAttribute('aria-pressed', 'true');
    await toolbarInspect.click();
    await expect(css).toHaveValue('color: rgb(20, 40, 60);');
    await panel.getByRole('button', { name: /^(Apply CSS|Применить CSS)$/u }).click();
    await expect(target).toHaveCSS('color', 'rgb(20, 40, 60)');
    await css.fill('color: red; width: invalid;');
    await panel.getByRole('button', { name: /^(Apply CSS|Применить CSS)$/u }).click();
    await expect(panel.getByRole('alert')).toBeVisible();
    await expect(panel.getByRole('alert')).toContainText('width');
    await expect(target).toHaveCSS('color', 'rgb(20, 40, 60)');
    await css.fill('padding: 12px;');
    await page.locator('[data-ui="content.toolbar.review-tool.move"]').click();
    await toolbarInspect.click();
    await expect(css).toHaveValue('padding: 12px;');
    await panel.getByRole('button', { name: /^(Collapse|Свернуть)/u }).click();
    await expect(css).toBeHidden();
    await panel.getByRole('button', { name: /^(Expand|Развернуть)/u }).click();
    await expect(css).toHaveValue('padding: 12px;');
    await chooseTarget('#review-card');
    await panel
      .getByRole('button', { name: /^(Choose child element|Выбрать дочерний элемент)$/u })
      .click();
    await page.getByRole('option').filter({ hasText: 'review-neighbor' }).click();
    await expect(panel).toContainText('review-neighbor');
    await expect(css).toHaveValue('');
    if (viewport.name === '1920x900') {
      await page.setViewportSize({ width: 1024, height: 560 });
      const bounds = (await panel.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(1024);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await page.screenshot({ path: info.outputPath('workspace-short.png'), fullPage: false });
    }
    await popup.close();
    await page.close();
  });
}
