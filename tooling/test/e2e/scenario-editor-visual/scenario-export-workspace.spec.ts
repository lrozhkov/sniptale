import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { createPageIssueCollector, openVisualHarness } from './scenario-editor-visual.helpers';

test('guide HTML export keeps image selection inside the inspector at minimum width', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'dark', 'ru', { width: 1024, height: 640 });
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить автономный HTML', exact: true }).click();
  const workspace = page.locator('main.guide-export-workspace.guide-html-workbench');
  await expect(workspace).toBeVisible();
  await expect(workspace.locator('.guide-page-header')).toHaveCount(0);
  const stage = workspace.locator('.guide-export-stage');
  const inspector = workspace.locator('.guide-export-inspector');
  await expect(inspector.locator('.guide-html-thumbnail')).toHaveCount(2);
  await expect(stage.locator('.guide-html-preview-image img')).toBeVisible();
  const stageBox = await stage.boundingBox();
  const inspectorBox = await inspector.boundingBox();
  expect(stageBox!.width).toBeGreaterThan(600);
  expect(inspectorBox!.width).toBeGreaterThan(200);
  await testInfo.attach('guide-workspace-idle-ru-dark-minimum', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Рассчитать размер', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить HTML', exact: true })).toBeEnabled();
  await expect(inspector.locator('.guide-export-heading output')).not.toBeEmpty();
  await testInfo.attach('guide-workspace-measured-ru-dark-minimum', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(workspace).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Сохранить автономный HTML', exact: true })
  ).toBeFocused();
  issues.assertClean();
});

test('tour HTML export prepares the sandboxed preview inside the shared workspace', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(
    page,
    hostOrigin,
    'light',
    'en',
    { width: 1024, height: 640 },
    'compare',
    { tourFixture: '1' }
  );
  await page.getByRole('button', { name: 'Interactive tour', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const workspace = page.locator('main.guide-export-workspace.tour-export');
  await expect(workspace).toBeVisible();
  await expect(workspace.locator('.guide-page-header')).toHaveCount(0);
  const stage = workspace.locator('.guide-export-stage');
  const inspector = workspace.locator('.guide-export-inspector');
  await expect(stage.locator('iframe')).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: 'Replay animation' })).toBeDisabled();
  await expect(
    stage.getByRole('button', { name: 'Prepare and preview', exact: true })
  ).toBeVisible();
  await testInfo.attach('tour-workspace-idle-en-light-minimum', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await stage.getByRole('button', { name: 'Prepare and preview', exact: true }).click();
  await expect(stage.locator('.tour-export-frame iframe')).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
  await expect(inspector.locator('.guide-export-heading output')).not.toBeEmpty();
  await expect(inspector.getByRole('button', { name: 'Replay animation' })).toBeEnabled();
  await testInfo.attach('tour-workspace-ready-en-light-minimum', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(workspace).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeFocused();
  issues.assertClean();
});
