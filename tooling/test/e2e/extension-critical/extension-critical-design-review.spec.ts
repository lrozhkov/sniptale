import { expect, test } from '../support/extension-fixture';

test('Design Review measurements stay independent and stable through inspector interactions at HD', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(hostOrigin);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
  const tabId = await popup.evaluate(async (origin) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((candidate) => candidate.url === `${origin}/`);
    if (tab?.id === undefined) throw new Error('Host tab not found');
    return tab.id;
  }, hostOrigin);
  await popup.evaluate((origin) => {
    const grant = document.createElement('button');
    grant.textContent = 'Grant test origin';
    grant.onclick = async () => {
      grant.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${origin}/*`] })
      );
    };
    document.body.append(grant);
  }, hostOrigin);
  await popup.getByRole('button', { name: 'Grant test origin' }).click();
  await expect(popup.getByRole('button', { name: 'Grant test origin' })).toHaveAttribute(
    'data-granted',
    'true'
  );
  await page.reload();
  const registered = await popup.evaluate(
    async (targetTabId) =>
      chrome.runtime.sendMessage({
        type: 'PAGE_ACCESS',
        operation: 'register-granted-site',
        tabId: targetTabId,
        __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
      }),
    tabId
  );
  expect(registered).toMatchObject({ success: true, result: 'registered' });
  const enabled = await popup.evaluate(
    async (targetTabId) =>
      chrome.tabs.sendMessage(targetTabId, {
        type: 'ENABLE_SCREENSHOT_MODE',
        workingMode: 'design-review',
      }),
    tabId
  );
  expect(enabled).toMatchObject({ success: true });
  await page.bringToFront();
  await page.evaluate(() => {
    const parent = document.createElement('section');
    parent.style.cssText = 'position:absolute;left:100px;top:300px;width:400px;height:240px';
    const target = document.createElement('button');
    target.id = 'measurement-target';
    target.textContent = 'Measure this';
    target.style.cssText = 'position:absolute;left:40px;top:50px;width:100px;height:40px';
    const sibling = document.createElement('div');
    sibling.textContent = 'Neighbor';
    sibling.style.cssText = 'position:absolute;left:200px;top:50px;width:100px;height:40px';
    parent.append(target, sibling);
    document.body.append(parent);
  });
  const basic = page.locator('[data-ui="content.toolbar.design-review-measurements-button"]');
  const additional = page.locator(
    '[data-ui="content.toolbar.design-review-measurement-details-button"]'
  );
  const layer = page.locator('[data-ui="content.design-review.measurements"]');
  const popover = page.locator('[data-ui="content.design-review.popover"]');
  for (const [neighbors, layout] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ]) {
    for (const [control, value] of [
      [basic, neighbors],
      [additional, layout],
    ] as const) {
      if ((await control.getAttribute('aria-pressed')) !== String(value)) await control.click();
      await expect(control).toHaveAttribute('aria-pressed', String(value));
      await expect(control).toBeEnabled();
    }
    const target = (await page.locator('#measurement-target').boundingBox())!;
    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
    await expect(popover).toBeVisible();
    if (neighbors || layout) {
      await expect(layer).toHaveCount(1);
      await expect(layer.locator('[data-scope="neighbor"]')).toHaveCount(neighbors ? 1 : 0);
      await expect(layer.locator('[data-scope="container"]')).toHaveCount(layout ? 4 : 0);
      await expect(layer.locator('[data-scope="viewport"]')).toHaveCount(layout ? 4 : 0);
      await layer.evaluate((node) => node.setAttribute('data-projection-proof', 'retained'));
    } else await expect(layer).toHaveCount(0);
    await popover
      .getByRole('button', { name: /Edit element properties|Изменить свойства элемента/u })
      .click();
    const navigation = popover.getByRole('navigation');
    for (const name of [
      /Borders and corners|Границы и скругление/u,
      /Fill and effects|Фон и эффекты/u,
    ]) {
      await navigation.getByRole('button', { name }).click();
      if (neighbors || layout)
        await expect(layer).toHaveAttribute('data-projection-proof', 'retained');
      else await expect(layer).toHaveCount(0);
      if (await popover.locator('[data-ui="content.design-review.settings-border"]').count()) {
        const borders = popover.locator('[data-ui="content.design-review.settings-border"]');
        await borders.getByRole('textbox').first().fill('3');
        const radius = neighbors ? '9' : '8';
        await borders
          .locator('[data-side-field-label="Radius"], [data-side-field-label="Скругление"]')
          .getByRole('textbox')
          .first()
          .fill(radius);
        await expect(page.locator('#measurement-target')).toHaveCSS(
          'border-top-left-radius',
          `${radius}px`
        );
      } else {
        await popover
          .locator('[data-ui="shared.ui.color-selector.picker-trigger"]')
          .first()
          .click();
        await page.getByRole('textbox', { name: 'HEX', exact: true }).fill('#123456');
        await page.getByRole('button', { name: /^(Apply|Применить)$/u }).click();
        await expect(page.locator('#measurement-target')).toHaveCSS(
          'background-color',
          'rgb(18, 52, 86)'
        );
        await popover.getByRole('button', { name: /^(Shadow|Тень)$/u }).click();
        await page.getByRole('option', { name: /^(Enabled|Включена)$/u }).click();
        await expect(page.locator('#measurement-target')).not.toHaveCSS('box-shadow', 'none');
      }
      if (neighbors || layout)
        await expect(layer).toHaveAttribute('data-projection-proof', 'retained');
      else await expect(layer).toHaveCount(0);
    }
    const comment = popover.getByRole('textbox', {
      name: /Element comment|Комментарий к элементу/u,
    });
    await comment.fill('Review this element');
    if (neighbors || layout)
      await expect(layer).toHaveAttribute('data-projection-proof', 'retained');
    else await expect(layer).toHaveCount(0);
    await expect(page.getByTestId('host-action-status')).toHaveText('Idle');
    await expect(popover).toBeVisible();
    await comment.press('Enter');
    await expect(popover).toHaveCount(0);
    await expect(layer).toHaveCount(0);
  }
  await popup.close();
  await page.close();
});
