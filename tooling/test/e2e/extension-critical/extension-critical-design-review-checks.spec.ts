import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Check preserves its root and Measure pair through finding actions at ${viewport.name}`, async ({
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
    await page.evaluate(() => {
      const root = document.createElement('section');
      root.id = 'audit-root';
      root.style.cssText =
        'position:absolute;left:300px;top:170px;width:300px;height:140px;background:white';
      const contrast = document.createElement('p');
      contrast.id = 'audit-contrast';
      contrast.textContent = 'Readable text needs sufficient contrast';
      contrast.style.cssText =
        'position:absolute;left:20px;top:40px;width:240px;height:60px;margin:0;' +
        'color:rgb(190,190,190);background:white;font:16px/20px sans-serif';
      const image = document.createElement('img');
      image.id = 'audit-image';
      image.style.cssText = 'position:absolute;left:20px;top:110px;width:24px;height:24px';
      root.append(contrast, image);
      const transient = document.createElement('div');
      transient.id = 'audit-transient';
      transient.textContent = 'Transient measurement target';
      transient.style.cssText = 'position:absolute;left:620px;top:220px;width:180px;height:50px';
      document.body.append(root, transient);
    });
    const root = page.locator('#audit-root');
    const source = await root.evaluate((element) => element.outerHTML);
    const panel = page.locator('[data-ui="content.design-review.tool-panel"]');
    const checks = panel.locator('[data-ui="content.design-review.checks"]');
    const checkButton = page.locator('[data-ui="content.toolbar.review-check"]');
    const measure = page.locator('[data-ui="content.toolbar.review-tool.compare"]');
    const commentTool = page.locator('[data-ui="content.toolbar.review-tool.comment"]');
    const popover = page.locator('[data-ui="content.design-review.popover"]');
    const a = panel.locator('[data-ui="content.design-review.measure-target.a"]');
    const b = panel.locator('[data-ui="content.design-review.measure-target.b"]');
    const contrastFinding = checks
      .locator('[data-ui="content.design-review.check-finding"]')
      .filter({ hasText: /Text contrast is below|Контраст текста ниже/u });
    const recheck = checks.getByRole('button', { name: /^(Recheck|Повторить проверку)$/u });
    const assertRoot = async () => {
      await expect(checks.locator('dd').first()).toContainText('audit-root');
      await expect(checks.locator('dd').nth(1)).toContainText(
        `${page.viewportSize()!.width} × ${page.viewportSize()!.height}`
      );
    };
    const click = async (selector: string, corner = false) => {
      const box = (await page.locator(selector).boundingBox())!;
      await page.mouse.click(
        box.x + (corner ? box.width - 10 : box.width / 2),
        box.y + (corner ? 10 : box.height / 2)
      );
    };
    await measure.click();
    await click('#measurement-target');
    await click('#audit-root', true);
    await expect(a).toContainText('measurement-target');
    await expect(b).toContainText('audit-root');
    await checkButton.click();
    await expect(measure).toHaveAttribute('aria-pressed', 'true');
    await assertRoot();
    await expect(contrastFinding).toHaveCount(1);
    await contrastFinding.getByRole('button', { name: /^(Show|Показать)$/u }).click();
    await expect(popover).toBeHidden();
    await recheck.click();
    await assertRoot();
    await expect(contrastFinding).toHaveCount(1);
    expect(await root.evaluate((element) => element.outerHTML)).toBe(source);
    await expect(page.locator('[data-ui="content.toolbar.history-undo-button"]')).toBeDisabled();
    await page.screenshot({ path: info.outputPath('check-original-root.png'), fullPage: false });
    await panel.getByRole('button', { name: /^(Close|Закрыть)$/u }).click();
    await expect(panel).toBeHidden();
    await expect(measure).toHaveAttribute('aria-pressed', 'true');
    await expect(checkButton).toHaveAttribute('aria-expanded', 'false');

    await measure.click();
    await expect(a).toContainText('measurement-target');
    await expect(b).toContainText('audit-root');
    await b.getByRole('button', { name: /^(Choose B|Выбрать B)$/u }).click();
    const transient = (await page.locator('#audit-transient').boundingBox())!;
    await page.mouse.move(transient.x + transient.width / 2, transient.y + transient.height / 2);
    await expect(panel.locator('[data-ui="content.design-review.measure-geometry"]')).toContainText(
      /preview|предпросмотр/u
    );
    await checkButton.click();
    await recheck.click();
    await assertRoot();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(measure).toHaveAttribute('aria-pressed', 'true');
    await expect(checkButton).toHaveAttribute('aria-expanded', 'false');
    await measure.click();
    await expect(a).toContainText('measurement-target');
    await expect(b).toContainText('audit-root');
    await expect(
      panel.locator('[data-ui="content.design-review.measure-geometry"]')
    ).not.toContainText(/preview|предпросмотр/u);
    expect(await root.evaluate((element) => element.outerHTML)).toBe(source);
    await expect(page.locator('[data-ui="content.toolbar.history-undo-button"]')).toBeDisabled();

    await checkButton.click();
    await contrastFinding
      .getByRole('button', { name: /^(Add feedback|Добавить замечание)$/u })
      .click();
    const comment = popover.getByRole('textbox', {
      name: /Element comment|Комментарий к элементу/u,
    });
    await expect(comment).toHaveValue(/Text contrast is below|Контраст текста ниже/u);
    await comment.fill('Please improve the contrast of this text.');
    await expect(comment).toHaveValue('Please improve the contrast of this text.');
    await comment.press('Enter');
    await expect(popover).toBeHidden();
    await checkButton.click();
    await expect(commentTool).toHaveAttribute('aria-pressed', 'true');
    await contrastFinding.getByRole('button', { name: /^(Show|Показать)$/u }).click();
    await expect(popover).toBeHidden();
    await expect(commentTool).toHaveAttribute('aria-pressed', 'true');
    await assertRoot();

    await contrastFinding.getByRole('button', { name: /^(Properties|Свойства)$/u }).click();
    await expect(page.locator('[data-ui="content.toolbar.review-tool.inspect"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(panel).toContainText('audit-contrast');
    await panel.locator('[data-ui="content.design-review.css-section"] > summary').click();
    await panel
      .getByRole('textbox', { name: /CSS declarations|Декларации CSS/u })
      .fill('color: rgb(0, 0, 0);');
    await panel.getByRole('button', { name: /^(Apply CSS|Применить CSS)$/u }).click();
    await expect(page.locator('#audit-contrast')).toHaveCSS('color', 'rgb(0, 0, 0)');
    await checkButton.click();
    await recheck.click();
    await assertRoot();
    await expect(contrastFinding).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('check-after-explicit-fix.png'),
      fullPage: false,
    });

    const retainedFindings = await checks
      .locator('[data-ui="content.design-review.check-finding"]')
      .allTextContents();
    expect(retainedFindings.length).toBeGreaterThan(0);
    // A same-ID replacement must not become the accepted scan root.
    await page.evaluate(() => {
      const original = document.getElementById('audit-root')!;
      const replacement = original.cloneNode(true);
      original.replaceWith(replacement);
      const text = document.getElementById('audit-contrast');
      if (text instanceof HTMLElement) text.style.color = 'rgb(190, 190, 190)';
    });
    await recheck.click();
    await expect(checks.getByRole('alert')).toContainText(/unavailable|недоступен/u);
    expect(
      await checks.locator('[data-ui="content.design-review.check-finding"]').allTextContents()
    ).toEqual(retainedFindings);
    await assertRoot();
    await expect(contrastFinding).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('check-stale-root.png'), fullPage: false });
    if (viewport.name === '1920x900') {
      await page.setViewportSize({ width: 1024, height: 560 });
      await recheck.click();
      const bounds = (await panel.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(1024);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await checks.locator('[data-ui="content.design-review.check-limits"] > summary').click();
      await expect(
        checks.locator('[data-ui="content.design-review.check-limits"]')
      ).toHaveAttribute('open', '');
      await page.screenshot({ path: info.outputPath('check-short.png'), fullPage: false });
    }
    await popup.close();
    await page.close();
  });
}
