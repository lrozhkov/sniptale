import { expect, type Page } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { SETTINGS_HARNESS_PATH } from '../extension-critical.helpers';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

async function templateId(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string | null>((resolve, reject) => {
        const request = database
          .transaction('scenario_projects')
          .objectStore('scenario_projects')
          .getAll();
        request.onsuccess = () => {
          const entries = request.result as Array<{
            id: string;
            project: { purpose?: string; name: string };
          }>;
          resolve(
            entries.find(
              (entry) =>
                entry.project.purpose === 'step-template' &&
                entry.project.name === 'Макет с изображениями'
            )?.id ?? null
          );
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`local layouts retain independent images and usable Russian controls in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1920, height: 1080 });
    const sourceUrl = page.url();
    await page.getByRole('button', { name: 'Сохранить как макет', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Название макета', exact: true })
      .fill('Макет с изображениями');
    await page.setViewportSize({ width: 1024, height: 640 });
    const controls = page.locator('.guide-template-controls');
    await expect(controls.getByRole('textbox')).toBeInViewport();
    expect(await controls.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await testInfo.attach(`template-save-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await controls.getByRole('button', { name: 'Сохранить как макет', exact: true }).click();
    await expect(controls.getByRole('status')).toContainText('Макет сохранён');
    const savedId = await templateId(page);
    if (!savedId) throw new Error('Missing saved template');
    const editUrl = new URL(sourceUrl);
    editUrl.searchParams.set('projectId', savedId);
    await page.goto(editUrl.toString());
    await expect(page.locator('article')).toHaveCount(1);
    await expect(page.locator('.guide-template-mode')).toBeVisible();
    await expect(page.locator('.guide-insertion-item')).toHaveCount(0);
    expect(
      await page
        .locator('.guide-page-header')
        .evaluate((node) => node.scrollWidth <= node.clientWidth)
    ).toBe(true);
    await testInfo.attach(`template-edit-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'ru',
      { width: 1920, height: 1080 },
      'text-only'
    );
    const targetUrl = page.url();
    await page.getByRole('button', { name: 'Мои макеты', exact: true }).click();
    await page.getByRole('option', { name: 'Макет с изображениями', exact: true }).click();
    await page.getByRole('button', { name: 'Заменить содержимое шага', exact: true }).click();
    const targetImages = page.locator('article#text-only img');
    await expect(targetImages).toHaveCount(2);
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    await expect(targetImages).toHaveCount(0);
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await expect(targetImages).toHaveCount(2);
    await expect(page.locator('.guide-page-feedback')).toHaveAttribute('data-status', 'saved');

    await page.goto(sourceUrl);
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Сценарий', exact: true })
      .click();
    await page.getByRole('button', { name: 'Удалить проект', exact: true }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Удалить', exact: true })
      .click();
    await expect(page.locator('article')).toHaveCount(0);
    await page.goto(`${hostOrigin}${SETTINGS_HARNESS_PATH}?section=scenario-layouts`);
    const row = page.locator(`[data-settings-collection-item="${savedId}"]`);
    await expect(row).toContainText('Макет с изображениями');
    await row.locator('[data-collection-inline-action="delete"]').click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Удалить', exact: true })
      .click();
    await expect(row).toHaveCount(0);
    await page.goto(targetUrl);
    await expect(targetImages).toHaveCount(2);
    await expect
      .poll(() =>
        targetImages.evaluateAll((images) =>
          images.every(
            (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
          )
        )
      )
      .toBe(true);
  });
}
