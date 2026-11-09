import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { resolveBrowserViewport } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

const FOREIGN_COMMENT = 'foreign-comment-secret-c63d';
const FOREIGN_PATH = 'foreign-path-secret-c63d';
const FOREIGN_TEXT = 'foreign-text-secret-c63d';
const CURRENT_COMMENT = 'current-comment-public-c63d';

function reviewPage(targetId: string, text: string, next = ''): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#f4f1e9;font:18px sans-serif}
    button,a{position:absolute;left:720px;top:180px}button{width:260px;height:70px}
    a{top:280px}</style></head><body><button id="${targetId}">${text}</button>
    <a id="review-next" href="${next}">Open next review page</a></body></html>`;
}

async function addComment(page: Page, targetId: string, value: string): Promise<void> {
  await page.locator('[data-ui="content.toolbar.review-tool.comment"]').click();
  const box = await page.locator(`#${targetId}`).boundingBox();
  if (!box) throw new Error('Comment target not found');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const popover = page.locator('[data-ui="content.design-review.popover"]');
  await popover
    .getByRole('textbox', { name: /Element comment|Комментарий к элементу/u })
    .fill(value);
  await popover
    .getByRole('textbox', { name: /Element comment|Комментарий к элементу/u })
    .press('Enter');
  await expect(popover).toBeHidden();
}

async function commandInput(input: Locator, query: string): Promise<void> {
  const result = await input.evaluate((element, value) => {
    let trusted: boolean | null = null;
    element.addEventListener(
      'input',
      (event) => {
        trusted = event.isTrusted;
      },
      { once: true }
    );
    if (!(element instanceof HTMLInputElement)) throw new Error('Search input not found');
    element.focus();
    element.select();
    const supported = document.execCommand('insertText', false, value);
    return { supported, trusted };
  }, query);
  expect(result).toEqual({ supported: true, trusted: true });
  await expect(input).toHaveValue(query);
}

test('Design Review search cannot probe retained foreign-origin feedback through native input', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const currentOrigin = hostOrigin.replace('127.0.0.1', 'localhost');
  const viewport = resolveBrowserViewport();
  await context.route(`${hostOrigin}/`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: reviewPage(FOREIGN_PATH, FOREIGN_TEXT, `${currentOrigin}/`),
    })
  );
  await context.route(`${currentOrigin}/`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: reviewPage('current-target', 'Current public target'),
    })
  );
  // Register both granted sites before the review crosses the origin boundary.
  const destination = await openDesignReview(context, extensionId, currentOrigin, viewport);
  await destination.page.close();
  await destination.popup.close();
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
  try {
    const panel = page.locator('[data-ui="content.design-review.feedback-panel"]');
    const rows = panel.locator('[data-ui="content.design-review.feedback-item"]');
    await addComment(page, FOREIGN_PATH, FOREIGN_COMMENT);
    if (!(await panel.isVisible())) {
      await page.locator('[data-ui="content.toolbar.design-review-panel-button"]').click();
    }
    await expect(rows).toHaveCount(1);
    await panel.getByRole('button', { name: /Find feedback|Найти замечание/u }).click();
    const sourceInput = panel.getByRole('textbox', { name: /Find feedback|Найти замечание/u });
    for (const query of [FOREIGN_COMMENT, FOREIGN_PATH, FOREIGN_TEXT]) {
      await commandInput(sourceInput, query);
      await expect(rows).toHaveCount(1);
      await panel.locator('.sniptale-field-clear').click();
    }
    await sourceInput.press('Escape');
    await expect(sourceInput).toBeHidden();
    await expect
      .poll(() =>
        popup.evaluate(async () =>
          JSON.stringify(await chrome.storage.local.get('sniptale_design_review_sessions'))
        )
      )
      .toContain(FOREIGN_COMMENT);
    await page.locator('[data-ui="content.toolbar.review-tool.navigate"]').click();
    await Promise.all([page.waitForURL(`${currentOrigin}/`), page.locator('#review-next').click()]);
    await expect(panel).toBeVisible();
    await expect(rows).toHaveCount(1);
    await addComment(page, 'current-target', CURRENT_COMMENT);
    await expect(rows).toHaveCount(2);
    await page.reload();
    await expect(panel).toBeVisible();
    await expect(rows).toHaveCount(2);
    const retainedIds = await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-annotation-id'))
    );
    await panel.getByRole('button', { name: /Find feedback|Найти замечание/u }).click();
    const input = panel.getByRole('textbox', { name: /Find feedback|Найти замечание/u });
    const clear = panel.locator('.sniptale-field-clear');
    for (const query of [FOREIGN_COMMENT, FOREIGN_PATH, FOREIGN_TEXT]) {
      await commandInput(input, query);
      await expect(rows).toHaveCount(0);
      await clear.click();
      await expect(input).toHaveValue('');
      await expect(rows).toHaveCount(2);
      expect(
        await rows.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-annotation-id'))
        )
      ).toEqual(retainedIds);
    }
    await commandInput(input, CURRENT_COMMENT);
    await expect(rows).toHaveCount(1);
    await clear.click();
    await input.pressSequentially(CURRENT_COMMENT);
    await expect(rows).toHaveCount(1);
    await clear.click();
    await expect(rows).toHaveCount(2);
  } finally {
    await page.close();
    await popup.close();
  }
});
