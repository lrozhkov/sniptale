import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

const editTextLabel = /^(Edit element text|Изменить текст элемента)$/u;
const propertiesLabel = /^(Edit element properties|Изменить свойства элемента)$/u;

async function readElementStyles(target: Locator) {
  return target.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      position: style.position,
      left: style.left,
      top: style.top,
      width: style.width,
      height: style.height,
      margin: style.margin,
      padding: style.padding,
      background: style.backgroundColor,
      color: style.color,
      textAlign: style.textAlign,
    };
  });
}

async function selectTarget(page: Page, target: Locator): Promise<void> {
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error('Text target has no rendered bounds');
  await page.mouse.click(bounds.x + 8, bounds.y + 8);
  await expect(page.locator('[data-ui="content.design-review.popover"]')).toBeVisible();
}

async function beginTextEdit(page: Page, target: Locator): Promise<void> {
  const popover = page.locator('[data-ui="content.design-review.popover"]');
  await popover.getByRole('button', { name: editTextLabel }).click();
  await expect(popover).toHaveCount(0);
  await expect(target).toHaveAttribute('contenteditable', 'true');
  await expect(target).toBeFocused();
  await expect(target).toHaveCSS('outline-style', 'none');
  await expect(target).toHaveCSS('box-shadow', 'none');
  const activeFrame = page.locator('.sniptale-quick-edit-active-frame');
  await expect(activeFrame).toBeVisible();
  await expect(activeFrame).toHaveCSS('border-top-width', '1px');
  await expect(activeFrame).toHaveCSS('border-top-style', 'dashed');
  await expect(activeFrame).toHaveCSS('box-shadow', 'none');
  const targetBounds = await target.boundingBox();
  const frameBounds = await activeFrame.boundingBox();
  if (!targetBounds || !frameBounds) throw new Error('Active edit frame has no rendered bounds');
  const expectedBounds = {
    x: targetBounds.x - 4,
    y: targetBounds.y - 4,
    width: targetBounds.width + 8,
    height: targetBounds.height + 8,
  };
  for (const edge of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(frameBounds[edge] - expectedBounds[edge])).toBeLessThanOrEqual(1);
  }
  await expect(target).not.toHaveCSS('cursor', /none|crosshair|url\(/u);
  await expect
    .poll(() =>
      target.evaluate(
        (node) => node.ownerDocument.getElementById('sniptale-design-review-cursor-style') === null
      )
    )
    .toBe(true);
}

for (const { theme, locale } of [
  { theme: 'light', locale: 'en' },
  { theme: 'dark', locale: 'ru' },
] as const) {
  const viewports =
    theme === 'light'
      ? [...PRIMARY_BROWSER_VIEWPORTS, { name: '1100x560', size: { width: 1100, height: 560 } }]
      : PRIMARY_BROWSER_VIEWPORTS;
  for (const viewport of viewports) {
    test(`Design Review inline text ${theme} ${locale} ${viewport.name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const setup = await context.newPage();
      await setup.setViewportSize(viewport.size);
      await setup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
      await setup.evaluate(
        async ({ theme, locale }) => {
          await chrome.storage.local.set({
            'sniptale-locale-preference': locale,
            'sniptale-theme-preference': theme,
          });
        },
        { theme, locale }
      );
      await setup.close();
      const { page, popup } = await openDesignReview(
        context,
        extensionId,
        hostOrigin,
        viewport.size
      );
      try {
        await page.evaluate(() => {
          const target = document.createElement('p');
          target.id = 'review-inline-text';
          target.style.cssText =
            'position:absolute;left:620px;top:170px;width:260px;height:56px;margin:0;padding:8px;background:#dbeafe;color:#172554';
          const strong = document.createElement('strong');
          strong.textContent = 'rich';
          target.append('Original ', strong, ' text');
          const image = document.createElement('img');
          image.id = 'review-unsupported-text';
          image.alt = 'Image without editable text';
          image.src =
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="60"%3E%3Crect width="100" height="60" fill="%238b5cf6"/%3E%3C/svg%3E';
          image.style.cssText = 'position:absolute;left:970px;top:170px;width:100px;height:60px';
          document.body.append(target, image);
        });
        const target = page.locator('#review-inline-text');
        const originalMarkup = await target.evaluate((node) => node.innerHTML);
        const popover = page.locator('[data-ui="content.design-review.popover"]');
        const preview = popover.locator('[data-ui="content.design-review.element-text"]');
        const reset = popover.locator('[data-ui="content.design-review.reset-text"]');
        await selectTarget(page, target);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          viewport.size.width
        );
        const popoverBounds = await popover.boundingBox();
        if (!popoverBounds) throw new Error('Selected text popover has no rendered bounds');
        expect(popoverBounds.x).toBeGreaterThanOrEqual(0);
        expect(popoverBounds.x + popoverBounds.width).toBeLessThanOrEqual(viewport.size.width);
        await popover.getByRole('button', { name: propertiesLabel }).click();
        await popover.getByRole('button', { name: /^(Center|По центру)$/u }).click();
        await expect(target).toHaveCSS('text-align', 'center');
        await popover.getByRole('button', { name: propertiesLabel }).click();
        await beginTextEdit(page, target);
        await target.fill('Edited with Enter');
        await page.screenshot({ path: info.outputPath('text-editing.png'), fullPage: false });
        await target.press('Enter');
        await expect(popover).toBeVisible();
        await expect(preview).toHaveText('Edited with Enter');
        await expect(reset).toBeEnabled();
        await expect(preview).toHaveAttribute(
          'title',
          locale === 'ru' ? 'Текст изменён' : 'Text edited'
        );

        await beginTextEdit(page, target);
        await target.fill('Edited with Escape');
        await target.press('Escape');
        await expect(popover).toBeVisible();
        await expect(preview).toHaveText('Edited with Escape');

        await beginTextEdit(page, target);
        await target.fill('Edited with outside click');
        await page.getByRole('button', { name: 'Host action', exact: true }).click();
        await expect(page.getByTestId('host-action-status')).toHaveText('Idle');
        await expect(popover).toBeVisible();
        await expect(preview).toHaveText('Edited with outside click');
        await page.screenshot({ path: info.outputPath('text-edited.png'), fullPage: false });
        const preservedStyles = await readElementStyles(target);

        await reset.click();
        await expect
          .poll(() => readElementStyles(target), 'Text reset retains independent element styles')
          .toEqual(preservedStyles);
        await expect(target).toHaveText('Original rich text');
        await expect.poll(() => target.evaluate((node) => node.innerHTML)).toBe(originalMarkup);
        await expect(target).toHaveCSS('text-align', 'center');
        await expect(reset).toHaveCount(0);
        await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
        await expect
          .poll(
            () => readElementStyles(target),
            'Undo text reset retains independent element styles'
          )
          .toEqual(preservedStyles);
        await expect(target).toHaveText('Edited with outside click');
        await expect(target).toHaveCSS('text-align', 'center');
        await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
        await expect
          .poll(
            () => readElementStyles(target),
            'Redo text reset retains independent element styles'
          )
          .toEqual(preservedStyles);
        await expect(target).toHaveText('Original rich text');
        await expect.poll(() => target.evaluate((node) => node.innerHTML)).toBe(originalMarkup);
        await expect(target).toHaveCSS('text-align', 'center');
        if (await popover.count()) {
          await popover.getByRole('button', { name: /^(Close|Закрыть)$/u }).click();
        }
        await selectTarget(page, target);
        await expect(reset).toHaveCount(0);
        await page.screenshot({ path: info.outputPath('text-reset.png'), fullPage: false });
        await popover.getByRole('button', { name: /^(Close|Закрыть)$/u }).click();
        await selectTarget(page, page.locator('#review-unsupported-text'));
        await expect(popover.getByRole('button', { name: editTextLabel })).toBeDisabled();
        await page.screenshot({ path: info.outputPath('unsupported-text.png'), fullPage: false });
        await popover.getByRole('button', { name: /^(Close|Закрыть)$/u }).click();

        const frame = page.frameLocator('[data-testid="host-same-origin-frame"]');
        await frame.locator('body').evaluate((body) => {
          const paragraph = body.ownerDocument.createElement('p');
          paragraph.id = 'review-frame-text';
          paragraph.textContent = 'Frame original text';
          paragraph.style.cssText = 'margin:4px;height:40px;padding:8px';
          body.replaceChildren(paragraph);
        });
        const frameText = frame.locator('#review-frame-text');
        await selectTarget(page, frameText);
        await expect(popover.getByRole('button', { name: editTextLabel })).toBeEnabled();
        await beginTextEdit(page, frameText);
        await frameText.fill('Frame edited text');
        await frameText.press('Enter');
        await expect(popover).toBeVisible();
        await expect(preview).toHaveText('Frame edited text');
        await expect(reset).toBeEnabled();
        await reset.click();
        await expect(frameText).toHaveText('Frame original text');
        await page.screenshot({ path: info.outputPath('frame-text-reset.png'), fullPage: false });
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }
}
