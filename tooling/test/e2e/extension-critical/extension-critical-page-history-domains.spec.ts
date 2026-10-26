import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

test.setTimeout(120_000);
test.use({ actionTimeout: 10_000 });

type WorkingMode = 'drawing' | 'quick-edit' | 'highlighter' | 'design-review' | 'cursor';

async function switchMode(page: Page, mode: WorkingMode): Promise<void> {
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
}

async function clickTarget(page: Page, target: Locator): Promise<void> {
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error('History target has no rendered bounds');
  await page.mouse.click(bounds.x + 12, bounds.y + 12);
}

async function editText(page: Page, target: Locator, text: string): Promise<void> {
  await clickTarget(page, target);
  await expect(target).toHaveAttribute('contenteditable', 'true');
  await target.fill(text);
}

async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath(name), fullPage: false, animations: 'disabled' });
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  const locale = viewport.size.width === 1280 ? 'ru' : 'en';
  const theme = locale === 'ru' ? 'dark' : 'light';
  const modifier = locale === 'ru' ? 'Control' : 'Meta';

  test(`page history follows the active domain ${viewport.name} ${locale} ${theme}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const setup = await context.newPage();
    await setup.setViewportSize(viewport.size);
    await setup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
    await setup.evaluate(
      async ({ locale, theme }) => {
        await chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        });
      },
      { locale, theme }
    );
    await setup.close();

    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport.size);
    try {
      await page.evaluate(() => {
        const paragraph = document.createElement('p');
        paragraph.id = 'history-page-text';
        paragraph.textContent = 'Original page text';
        paragraph.style.cssText =
          'position:absolute;left:620px;top:170px;width:280px;height:56px;margin:0;' +
          'padding:8px;background:#dbeafe;color:#172554;text-align:left';
        document.body.append(paragraph);
      });
      const text = page.locator('#history-page-text');
      const drawing = page.locator('[data-ui="content.drawing.text-object"]');
      const frames = page.locator('.sniptale-frame-container');
      const undo = page.locator('[data-ui="content.toolbar.history-undo-button"]');
      const redo = page.locator('[data-ui="content.toolbar.history-redo-button"]');

      await switchMode(page, 'drawing');
      await expect(undo).toBeDisabled();
      await expect(redo).toBeDisabled();
      await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
      await page.mouse.click(350, 250);
      const draft = page.locator('[data-ui="content.drawing.text-input"]');
      await draft.fill('Drawing domain');
      await draft.press('Enter');
      await expect(drawing).toHaveText('Drawing domain');
      await expect(drawing).toBeVisible();
      await expect(redo).toBeDisabled();
      await page.keyboard.press(`${modifier}+Shift+z`);
      await expect(drawing).toHaveText('Drawing domain');
      await page.mouse.click(450, 210);
      await draft.fill('Temporary draft');
      await draft.press(`${modifier}+z`);
      await expect(drawing).toHaveText('Drawing domain');
      await expect(draft).toBeVisible();
      await draft.press('Escape');
      await expect(draft).toHaveCount(0);
      await expect(drawing).toHaveText('Drawing domain');

      await switchMode(page, 'quick-edit');
      await expect(undo).toBeDisabled();
      await expect(redo).toBeDisabled();
      await editText(page, text, 'First page edit');
      await switchMode(page, 'drawing');
      await expect(text).not.toHaveAttribute('contenteditable', 'true');
      await undo.click();
      await expect(drawing).toHaveCount(0);
      await expect(text).toHaveText('First page edit');
      await expect(undo).toBeDisabled();
      await expect(redo).toBeEnabled();
      await redo.hover();
      await capture(page, info, 'drawing-undone-text-preserved.png');
      await page.keyboard.press(`${modifier}+Shift+z`);
      await expect(drawing).toHaveText('Drawing domain');
      await page.keyboard.press(`${modifier}+z`);
      await expect(drawing).toHaveCount(0);

      await switchMode(page, 'quick-edit');
      await expect(undo).toBeEnabled();
      await editText(page, text, 'Second page edit');
      await switchMode(page, 'drawing');
      await expect(redo).toBeEnabled();
      await page.keyboard.press('Control+y');
      await expect(drawing).toHaveText('Drawing domain');
      await expect(text).toHaveText('Second page edit');

      await switchMode(page, 'highlighter');
      await expect(undo).toBeDisabled();
      await expect(redo).toBeDisabled();
      await clickTarget(page, page.locator('#measurement-target'));
      await expect(frames).toHaveCount(1);
      await page.keyboard.press(`${modifier}+z`);
      await expect(frames).toHaveCount(0);
      await expect(drawing).toHaveText('Drawing domain');
      await expect(text).toHaveText('Second page edit');
      await expect(redo).toBeEnabled();

      await switchMode(page, 'quick-edit');
      await undo.click();
      await expect(text).toHaveText('First page edit');
      await expect(redo).toBeEnabled();
      await switchMode(page, 'drawing');
      const reset = page.locator('[data-ui="content.toolbar.reset-all-button"]');
      await reset.click();
      const confirmation = page.getByRole('alertdialog');
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole('button', { name: /^(Cancel|Отмена)$/u }).click();
      await expect(drawing).toHaveText('Drawing domain');
      await expect(text).toHaveText('First page edit');
      await reset.click();
      await capture(page, info, 'clear-drawing-confirmation.png');
      await confirmation
        .getByRole('button', { name: /^(Clear drawings|Очистить рисунки)$/u })
        .click();
      await expect(confirmation).toHaveCount(0);
      await expect(drawing).toHaveCount(0);
      await expect(text).toHaveText('First page edit');
      await expect(undo).toBeDisabled();
      await expect(redo).toBeDisabled();

      await switchMode(page, 'highlighter');
      await expect(redo).toBeEnabled();
      await redo.click();
      await expect(frames).toHaveCount(1);
      await expect(drawing).toHaveCount(0);
      await switchMode(page, 'quick-edit');
      await expect(redo).toBeEnabled();
      await page.keyboard.press(`${modifier}+Shift+z`);
      await expect(text).toHaveText('Second page edit');

      await switchMode(page, 'design-review');
      await clickTarget(page, text);
      const popover = page.locator('[data-ui="content.design-review.popover"]');
      await popover
        .getByRole('button', {
          name: /^(Edit element properties|Изменить свойства элемента)$/u,
        })
        .click();
      await popover.getByRole('button', { name: /^(Center|По центру)$/u }).click();
      await expect(text).toHaveCSS('text-align', 'center');
      await switchMode(page, 'quick-edit');
      await undo.click();
      await expect(text).toHaveCSS('text-align', 'left');
      await expect(text).toHaveText('Second page edit');
      await undo.click();
      await expect(text).toHaveText('First page edit');
      await redo.click();
      await expect(text).toHaveText('Second page edit');
      await redo.click();
      await expect(text).toHaveCSS('text-align', 'center');
      await expect(frames).toHaveCount(1);
      await capture(page, info, 'page-editing-shared-chronology.png');

      await switchMode(page, 'cursor');
      await expect(undo).toHaveCount(0);
      await expect(redo).toHaveCount(0);
      await page.evaluate(() => {
        const observation = document.createElement('output');
        observation.id = 'history-host-key-observation';
        observation.hidden = true;
        document.body.append(observation);
        const prevented: boolean[] = [];
        document.addEventListener('keydown', (event) => {
          if (!(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(event.key.toLowerCase()))
            return;
          queueMicrotask(() => {
            prevented.push(event.defaultPrevented);
            observation.textContent = JSON.stringify(prevented);
          });
        });
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      for (const shortcut of [
        'Control+z',
        'Meta+z',
        'Control+Shift+z',
        'Meta+Shift+z',
        'Control+y',
      ])
        await page.keyboard.press(shortcut);
      await expect(page.locator('#history-host-key-observation')).toHaveText(
        '[false,false,false,false,false]'
      );
      await expect(text).toHaveText('Second page edit');
      await expect(text).toHaveCSS('text-align', 'center');
      await expect(frames).toHaveCount(1);
      await expect(drawing).toHaveCount(0);
      await capture(page, info, 'navigation-preserves-page-and-annotations.png');
    } finally {
      await popup.close();
      await page.close();
    }
  });
}
