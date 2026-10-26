import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Measure previews and pins live A/B without editing the page at ${viewport.name}`, async ({
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
      const a = document.getElementById('measurement-target')!;
      a.parentElement!.id = 'pair-parent';
      const b = a.nextElementSibling;
      if (!(b instanceof HTMLElement)) throw new Error('Missing B');
      b.id = 'measure-b';
      b.style.fontSize = '20px';
      const c = document.createElement('p');
      c.id = 'measure-c';
      c.textContent = 'Another target';
      c.style.cssText = 'position:absolute;left:550px;top:230px;width:100px;height:40px';
      document.body.append(c);
    });
    const source = await page.locator('#pair-parent').evaluate((element) => element.outerHTML);
    const panel = page.locator('[data-ui="content.design-review.tool-panel"]');
    const tool = page.locator('[data-ui="content.toolbar.review-tool.compare"]');
    const click = async (id: string) => {
      const rect = (await page.locator(id).boundingBox())!;
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    };
    const hover = async (id: string) => {
      const rect = (await page.locator(id).boundingBox())!;
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    };
    const a = panel.locator('[data-ui="content.design-review.measure-target.a"]'),
      b = panel.locator('[data-ui="content.design-review.measure-target.b"]');
    await tool.click();
    await click('#measurement-target');
    await expect(a).toContainText('measurement-target');
    await hover('#measure-b');
    const geometry = panel.locator('[data-ui="content.design-review.measure-geometry"]');
    await expect(geometry).toContainText(/60 (?:px|пкс)/u);
    await expect(geometry).toContainText(/preview|предпросмотр/u);
    await expect(b).not.toContainText('measure-b');
    const previewGeometry = await geometry.textContent();
    const previewLabel = page
      .locator('[data-ui="content.design-review.measure-guide-label"]')
      .first();
    const previewBounds = await previewLabel.boundingBox();
    const panelHeader = (await panel.locator('header').boundingBox())!;
    await page.mouse.move(panelHeader.x + 12, panelHeader.y + panelHeader.height / 2);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    await expect(geometry).toHaveText(previewGeometry!);
    await expect(geometry).toContainText(/preview|предпросмотр/u);
    await expect(b).not.toContainText('measure-b');
    await expect(previewLabel).toBeVisible();
    expect(await previewLabel.boundingBox()).toEqual(previewBounds);
    await hover('#measure-b');
    await click('#measure-b');
    await expect(b).toContainText('measure-b');
    await expect(geometry).not.toContainText(/preview|предпросмотр/u);
    await expect(
      page.locator('[data-ui="content.design-review.measure-projection"]')
    ).toContainText('60 px');
    await expect(
      panel.locator('[data-ui="content.design-review.measure-difference.text"]')
    ).toContainText('20px');
    await page.screenshot({ path: info.outputPath('measure-pair.png'), fullPage: false });
    await page.locator('#measure-b').evaluate((element) => {
      if (!(element instanceof HTMLElement)) throw new Error('Fixture B unavailable');
      element.style.left = '156px';
    });
    await expect(geometry).toContainText(/16 (?:px|пкс)/u);
    const label = (await page
      .locator('[data-ui="content.design-review.measure-guide-label"]')
      .first()
      .boundingBox())!;
    for (const id of ['#measurement-target', '#measure-b']) {
      const bounds = (await page.locator(id).boundingBox())!;
      expect(
        label.x + label.width <= bounds.x ||
          bounds.x + bounds.width <= label.x ||
          label.y + label.height <= bounds.y ||
          bounds.y + bounds.height <= label.y
      ).toBe(true);
    }
    const assertLabelSpacing = async () => {
      const labels = await page
        .locator(
          '[data-ui="content.design-review.measure-guide-label"], ' +
            '[data-ui="content.design-review.measure-target-label"]'
        )
        .all();
      const labelBoxes = await Promise.all(labels.map((label) => label.boundingBox()));
      for (let first = 0; first < labelBoxes.length; first++)
        for (let second = first + 1; second < labelBoxes.length; second++) {
          const left = labelBoxes[first]!,
            right = labelBoxes[second]!;
          expect(
            left.x + left.width <= right.x ||
              right.x + right.width <= left.x ||
              left.y + left.height <= right.y ||
              right.y + right.height <= left.y
          ).toBe(true);
        }
    };
    await assertLabelSpacing();
    await page.screenshot({ path: info.outputPath('measure-tight-gap.png'), fullPage: false });
    await page.locator('#measure-b').evaluate((element) => {
      if (!(element instanceof HTMLElement)) throw new Error('Fixture B unavailable');
      element.style.left = '200px';
    });
    await click('#measure-c');
    await expect(b).toContainText('measure-b');
    await panel.getByRole('button', { name: /^(Swap A and B|Поменять A и B)$/u }).click();
    await expect(a).toContainText('measure-b');
    await expect(b).toContainText('measurement-target');
    await b.getByRole('button', { name: /^(Choose B|Выбрать B)$/u }).click();
    await hover('#measure-c');
    await expect(geometry).toContainText(/preview|предпросмотр/u);
    await page.keyboard.press('Escape');
    await expect(b).toContainText('measurement-target');
    await expect(geometry).not.toContainText(/preview|предпросмотр/u);
    await panel.getByRole('button', { name: /^(Close|Закрыть)$/u }).click();
    await expect(panel).toBeHidden();
    await tool.click();
    await expect(b).toContainText('measurement-target');
    await panel.locator('[data-ui="content.design-review.measure-hierarchy"] > summary').click();
    await panel
      .getByRole('button', { name: /^(Select parent element|Выбрать родительский элемент)$/u })
      .focus();
    await panel
      .getByRole('button', { name: /^(Select parent element|Выбрать родительский элемент)$/u })
      .press('Enter');
    await expect(panel).toContainText('pair-parent');
    await expect(b).toContainText('measurement-target');
    await b.getByRole('button', { name: /^(Choose B|Выбрать B)$/u }).click();
    await panel
      .getByRole('button', {
        name: /Use selected element as B|Использовать выбранный элемент как B/u,
      })
      .click();
    await expect(b).toContainText('pair-parent');
    await expect(panel).toContainText(/inside the bounds|внутри границ/u);
    expect(await page.locator('#pair-parent').evaluate((element) => element.outerHTML)).toBe(
      source
    );
    await expect(page.locator('[data-ui="content.toolbar.history-undo-button"]')).toBeDisabled();
    await b.getByRole('button', { name: /^(Choose B|Выбрать B)$/u }).click();
    await click('#measure-c');
    await page.evaluate(() => {
      document.getElementById('measure-c')!.style.fontSize = '26px';
    });
    await expect(
      panel.locator('[data-ui="content.design-review.measure-difference.text"]')
    ).toContainText('26px');
    await page.evaluate(() => {
      document.getElementById('measure-c')!.remove();
      const replacement = document.createElement('p');
      replacement.id = 'measure-c';
      replacement.textContent = 'Recreated target';
      replacement.style.cssText = 'position:absolute;left:550px;top:230px;width:100px;height:40px';
      document.body.append(replacement);
    });
    await expect(b).toContainText(/unavailable|недоступен/u);
    await expect(panel).toContainText(/removed or hidden|удалён или скрыт/u);
    await b.getByRole('button', { name: /^(Choose B|Выбрать B)$/u }).click();
    await click('#measure-c');
    await expect(b).not.toContainText(/unavailable|недоступен/u);
    await page.locator('[data-ui="content.toolbar.review-tool.inspect"]').click();
    await tool.click();
    await expect(a).toContainText('measure-b');
    await expect(b).toContainText('measure-c');
    await expect(
      page.locator('[data-ui="content.design-review.measure-projection"]')
    ).toContainText('X 150 px');
    await expect(
      page.locator('[data-ui="content.design-review.measure-projection"]')
    ).toContainText('Y 64 px');
    await assertLabelSpacing();
    if (viewport.name === '1920x900') {
      await page.setViewportSize({ width: 1024, height: 560 });
      const bounds = (await panel.boundingBox())!;
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(1024);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await page.screenshot({ path: info.outputPath('measure-short.png'), fullPage: false });
    }
    await expect(page.locator('[data-ui="content.toolbar.history-undo-button"]')).toBeDisabled();
    await popup.close();
    await page.close();
  });
}
