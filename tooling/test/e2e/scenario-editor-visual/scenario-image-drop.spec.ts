import { expect, type Locator } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { createPageIssueCollector, openVisualHarness } from './scenario-editor-visual.helpers';

async function dropImage(target: Locator, type: 'dragover' | 'drop' = 'drop') {
  await target.evaluate((element, eventType) => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Missing canvas');
    ctx.fillStyle = '#186858';
    ctx.fillRect(0, 0, 120, 80);
    const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]!), (char) =>
      char.charCodeAt(0)
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'Dropped.png', { type: 'image/png' }));
    element.dispatchEvent(
      new DragEvent(eventType, { bubbles: true, cancelable: true, dataTransfer: transfer })
    );
  }, type);
}

for (const theme of ['light', 'dark'] as const) {
  test(`image drops target steps, boundaries, slots and canvas in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 720 });
    const articles = page.locator('.guide-document > article');
    const first = articles.first();
    const firstId = await first.getAttribute('id');
    const imageCount = await first.locator('[data-kind="image"]').count();
    await dropImage(first.locator('header'), 'dragover');
    await expect(first).toHaveAttribute('data-image-drop', 'blocks');
    await testInfo.attach(`step-target-${theme}`, {
      body: await page.screenshot({ path: `tasks/scenario-image-drop/target-${theme}.png` }),
      contentType: 'image/png',
    });
    await dropImage(first.locator('header'));
    await expect(first.locator('[data-kind="image"]')).toHaveCount(imageCount + 1);
    await expect(articles).toHaveCount(2);
    const boundary = page.locator(`.guide-insertion-item[data-insert-before="${firstId}"]`);
    await dropImage(boundary, 'dragover');
    await expect(boundary).toHaveAttribute('data-image-drop', 'steps');
    await testInfo.attach(`boundary-target-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await dropImage(boundary);
    await expect(articles).toHaveCount(3);
    await expect(articles.first().locator('[data-kind="image"]')).toHaveCount(1);
    await expect(articles.nth(1)).toHaveAttribute('id', firstId!);
    await dropImage(page.locator('.guide-document-scroll'), 'dragover');
    await expect(page.locator('.guide-document-scroll')).toHaveAttribute(
      'data-image-drop',
      'steps'
    );
    await dropImage(page.locator('.guide-document-scroll'));
    await expect(articles).toHaveCount(4);
    await expect(articles.last().locator('[data-kind="image"]')).toHaveCount(1);
    await dropImage(articles.last().locator('[data-kind="image"]'));
    await expect(articles).toHaveCount(4);
    await expect(articles.last().locator('[data-kind="image"]')).toHaveCount(1);
    await expect(page.locator('[data-image-drop]')).toHaveCount(0);
    await expect(
      page.locator('.guide-page-header').getByRole('button', { name: 'Экспорт', exact: true })
    ).toBeEnabled();
    await page.reload();
    await expect(page.locator('.guide-document > article')).toHaveCount(4);
    await page
      .locator('.guide-insertion-item[data-end="true"]')
      .getByRole('button', { name: 'Добавить шаг', exact: true })
      .click({ force: true });
    await expect(articles).toHaveCount(5);
    const empty = articles.last().locator('.guide-image-slot');
    await expect(
      empty.getByRole('button', { name: 'Загрузить изображение', exact: true })
    ).toBeVisible();
    await expect(
      empty.getByRole('button', { name: 'Библиотека изображений', exact: true })
    ).toBeVisible();
    await empty.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `tasks/scenario-image-drop/empty-${theme}.png` });
    await dropImage(empty);
    await expect(articles.last().locator('[data-kind="image"]')).toHaveCount(1);
    await expect(articles).toHaveCount(5);
    while (await page.locator('.guide-document > article, .guide-document > section').count()) {
      const item = page.locator('.guide-document > article, .guide-document > section').first();
      await item.locator('.guide-item-actions button').click({ force: true });
      await page.getByRole('button', { name: 'Удалить элемент', exact: true }).click();
    }
    await page.setViewportSize({ width: 1024, height: 640 });
    const canvasEmpty = page.locator('.guide-document-empty .guide-image-slot');
    await expect(canvasEmpty).toBeVisible();
    await page.screenshot({ path: `tasks/scenario-image-drop/canvas-empty-${theme}.png` });
    await dropImage(canvasEmpty);
    await expect(articles).toHaveCount(1);
    await expect(articles.first().locator('[data-kind="image"]')).toHaveCount(1);
    issues.assertClean();
  });
}
