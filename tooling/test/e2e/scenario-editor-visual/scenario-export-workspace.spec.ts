import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { createPageIssueCollector, openVisualHarness } from './scenario-editor-visual.helpers';

test('guide export opens the shared reader workspace on the first click', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'dark', 'ru', { width: 1024, height: 640 });
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const reader = page.locator('main.guide-export-workspace');
  await expect(reader).toBeVisible();
  await expect(page.locator('.guide-page-header')).toHaveCount(0);
  const stage = reader.locator('.guide-export-stage');
  await expect(stage.locator('.guide-reading-nav')).toBeVisible();
  await expect(stage.locator('.guide-read-document article')).toHaveCount(2);
  const inspector = reader.locator('.guide-export-inspector');
  await expect(inspector).toBeVisible();
  const inspectorBox = await inspector.boundingBox();
  expect(inspectorBox).not.toBeNull();
  expect(inspectorBox!.height).toBeGreaterThanOrEqual(640 - 16 - 1);
  await expect(
    inspector.getByRole('button', { name: 'Вернуться к редактированию', exact: true })
  ).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Документ', exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'По шагам', exact: true })).toBeVisible();
  await expect(
    inspector.getByRole('button', { name: 'Навигация по шагам', exact: true })
  ).toBeVisible();
  await expect(
    inspector.getByRole('button', { name: 'Сохранить автономный HTML', exact: true })
  ).toBeVisible();
  await expect(
    inspector.getByRole('button', { name: 'Сохранить Markdown с изображениями (ZIP)', exact: true })
  ).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Печать / PDF', exact: true })).toBeVisible();
  await testInfo.attach('guide-reader-workspace-ru-dark-minimum', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Экспорт', exact: true })).toBeFocused();
  issues.assertClean();
});

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

test('tour preview paints the selected slide in the browser', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(
    page,
    hostOrigin,
    'light',
    'en',
    { width: 1280, height: 900 },
    'compare',
    { tourFixture: '1' }
  );
  await page.getByRole('button', { name: 'Interactive tour', exact: true }).click();
  const slide = page.locator('.tour-slide-select:has(img)').nth(1);
  await expect(slide).toBeVisible();
  await slide.click();
  const controls = page.locator('.tour-header-controls');
  await controls.getByRole('button', { name: 'Preview', exact: true }).click();
  const stage = page.locator('.tour-stage-host');
  await expect(stage).toHaveAttribute('data-view', 'preview');
  const readPaint = () =>
    page.evaluate(() => {
      const host = document.querySelector('.tour-stage-host');
      const root = host?.shadowRoot;
      if (!root) return { missing: true } as const;
      const scene = root.querySelector<HTMLElement>('[data-tour-scene]');
      const plane = root.querySelector<HTMLElement>('[data-tour-stage]');
      const image = root.querySelector<HTMLImageElement>('img.tour-image');
      if (!scene || !plane) return { missing: true } as const;
      const sceneRect = scene.getBoundingClientRect();
      const planeRect = plane.getBoundingClientRect();
      const imageRect = image?.getBoundingClientRect();
      return {
        missing: false as const,
        motion: plane.dataset.motion ?? null,
        inert: scene.inert,
        opacity: getComputedStyle(scene).opacity,
        stage: { width: planeRect.width, height: planeRect.height },
        scene: { width: sceneRect.width, height: sceneRect.height },
        image: image
          ? {
              width: imageRect!.width,
              height: imageRect!.height,
              complete: image.complete,
              naturalWidth: image.naturalWidth,
              src: image.src.slice(0, 40),
            }
          : null,
      };
    });
  const painted = async () => {
    const paint = await readPaint();
    if (paint.missing || !paint.image) return false;
    return (
      paint.image.complete &&
      paint.image.naturalWidth > 0 &&
      paint.image.width > 0 &&
      paint.image.height > 0 &&
      paint.scene.width > 0 &&
      paint.scene.height > 0 &&
      paint.stage.width > 0 &&
      paint.stage.height > 0 &&
      paint.opacity === '1' &&
      !paint.inert
    );
  };
  await expect.poll(painted, { message: 'preview paints a decoded visible image' }).toBe(true);
  await expect(stage.locator('.tour-toolbar')).toBeVisible();
  await expect(stage.locator('[data-tour-play]')).toHaveAttribute('aria-pressed', 'true');
  await expect(stage.locator('[data-tour-counter]')).toHaveText('2 / 2');
  await stage.locator('[data-tour-contents]').click();
  await expect(stage.locator('[data-tour-navigation]')).toBeVisible();
  await stage.locator('[data-tour-navigation] button').first().click();
  await expect(stage.locator('[data-tour-counter]')).toHaveText('1 / 2');
  await stage.locator('[data-tour-next]').click();
  await expect.poll(painted).toBe(true);
  await stage.locator('[data-tour-previous]').click();
  await expect(stage.locator('[data-tour-counter]')).toHaveText('1 / 2');
  await stage.locator('[data-tour-next]').click();
  await expect(stage.locator('[data-tour-counter]')).toHaveText('2 / 2');
  await expect.poll(painted).toBe(true);
  await testInfo.attach('full-editor-tour-player', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const paint = await readPaint();
  expect(paint.missing).toBe(false);
  await expect(page.locator('.tour-preview-status')).toHaveCount(0);
  await controls.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(stage).toHaveAttribute('data-view', 'preview');
  await expect
    .poll(painted, { message: 'replayed preview paints a decoded visible image' })
    .toBe(true);
  await controls.getByRole('button', { name: 'Return to editing', exact: true }).click();
  await expect(stage).toHaveAttribute('data-view', 'edit');
  await expect(controls.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
  issues.assertClean();
});
