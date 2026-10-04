import { readFile } from 'node:fs/promises';
import { GALLERY_HARNESS_PATH, applyHarnessBootstrap } from '../extension-critical.helpers';
import { expect, type Locator } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

async function expectStableOpening(dialog: Locator) {
  const geometry = await dialog.evaluate((node) => {
    const surface = node.closest<HTMLElement>('.guide-resource-drawer-surface')!;
    const animation = getComputedStyle(surface).animation;
    surface.style.animation = 'none';
    const final = surface.getBoundingClientRect().toJSON();
    surface.style.animation = animation;
    surface.style.animationPlayState = 'paused';
    const motion = surface.getAnimations()[0];
    if (motion) motion.currentTime = 100;
    const opening = surface.getBoundingClientRect().toJSON();
    surface.style.removeProperty('animation');
    surface.style.removeProperty('animation-play-state');
    return { final, opening };
  });
  for (const dimension of ['x', 'y', 'width', 'height']) {
    expect(geometry.opening[dimension]).toBeCloseTo(geometry.final[dimension], 0);
  }
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`compact resources preview and import actions remain usable in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 560 });
    await page.getByRole('button', { name: 'Ресурсы', exact: true }).click();
    const panel = page.locator('#guide-library-panel');
    const rows = panel.locator('.guide-resource-row');
    await expect(rows).toHaveCount(1);
    expect(
      await rows.first().evaluate((node) => node.getBoundingClientRect().height)
    ).toBeLessThanOrEqual(48);
    const preview = rows
      .first()
      .getByRole('button', { name: 'Посмотреть изображение', exact: true });
    await preview.click();
    const viewer = page.locator('#guide-resource-preview');
    await expectStableOpening(viewer);
    await expect(viewer.locator('[data-ui="library-media-player"] img')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(preview).toBeFocused();
    await rows
      .first()
      .getByRole('button', { name: 'Места использования (2)', exact: true })
      .click();
    await page.getByRole('button', { name: 'Compare two images · 1', exact: true }).click();
    await expect(page.locator('article#compare')).toHaveAttribute('data-selected', 'true');
    await page.setViewportSize({ width: 1280, height: 560 });
    const trigger = panel.locator('.guide-image-upload-compact .guide-action-menu-anchor > button');
    await expect(trigger).toBeInViewport();
    await testInfo.attach(`resources-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await trigger.click();
    await page
      .locator('.guide-action-menu')
      .getByRole('button', { name: 'Библиотека изображений', exact: true })
      .click();
    const drawer = page.locator('#guide-resource-drawer');
    await expectStableOpening(drawer);
    await expect(drawer.locator('.guide-resource-drawer-close')).toBeInViewport();
    await expect(
      drawer.getByRole('button', { name: 'Обновить библиотеку', exact: true })
    ).toHaveCount(0);
    const search = drawer.locator('.guide-library-search input');
    await search.fill('does-not-exist');
    await expect(drawer.locator('.guide-library-card')).toHaveCount(0);
    await search.fill('');
    const card = drawer.getByRole('button', { name: 'Library screenshot.png', exact: true });
    await expect(card).toBeVisible();
    await card.click();
    await expect(drawer.locator('.guide-library-preview img')).toBeVisible();
    const select = drawer.getByRole('button', {
      name: 'Выбрать элемент: Library screenshot.png',
      exact: true,
    });
    const submit = drawer
      .locator('.guide-resource-header-actions')
      .getByRole('button', { name: 'Импортировать выбранное', exact: true });
    await expect(submit).toBeDisabled();
    await select.focus();
    await page.keyboard.press('Space');
    await expect(select).toHaveText('1');
    await expect(submit).toBeEnabled();
    await expect(submit).toBeInViewport({ ratio: 1 });
    await card.click();
    await expect(select).toHaveText('1');
    await testInfo.attach(`library-${theme}`, {
      body: await page.screenshot({
        path: `tasks/scenario-library-selection/library-${theme}.png`,
      }),
      contentType: 'image/png',
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectStableOpening(drawer);
    await drawer.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`shared material browser grid strip and viewport width in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 560 });
    await page.getByRole('button', { name: 'Ресурсы', exact: true }).click();
    const trigger = page.locator(
      '#guide-library-panel .guide-image-upload-compact .guide-action-menu-anchor > button'
    );
    await trigger.click();
    await page
      .locator('.guide-action-menu')
      .getByRole('button', { name: 'Библиотека изображений', exact: true })
      .click();
    const drawer = page.locator('#guide-resource-drawer');
    const list = drawer.locator('[data-ui="library-materials-list"]');
    await expect(list).toHaveAttribute('data-layout', 'grid');
    await expect(drawer.locator('.guide-library-preview')).toHaveCount(0);
    await expect(
      drawer.getByRole('button', { name: 'Все материалы', exact: true }).locator('svg')
    ).toBeVisible();
    const allMaterials = drawer.getByRole('button', { name: 'Все материалы', exact: true });
    await allMaterials.hover();
    await expect(allMaterials.locator('svg')).toBeVisible();
    await allMaterials.focus();
    await page.keyboard.press('Space');
    await expect(allMaterials).toHaveAttribute('aria-pressed', 'true');
    await expect(allMaterials.locator('svg')).toBeVisible();
    for (const width of [1280, 2560]) {
      await page.setViewportSize({ width, height: width === 1280 ? 560 : 1280 });
      const geometry = (await drawer.boundingBox())!;
      expect(geometry.width).toBeGreaterThanOrEqual(width * 0.75);
      expect(geometry.width).toBeLessThanOrEqual(width - 24);
    }
    await page.setViewportSize({ width: 1280, height: 560 });
    await drawer.getByRole('button', { name: 'Library screenshot.png', exact: true }).click();
    await expect(list).toHaveAttribute('data-layout', 'strip');
    const preview = drawer.locator('.guide-library-preview');
    await expect(preview.locator('img')).toBeVisible();
    const previewBounds = (await preview.boundingBox())!;
    const listBounds = (await list.boundingBox())!;
    expect(listBounds.y + listBounds.height).toBeLessThanOrEqual(previewBounds.y);
    expect(listBounds.height).toBeLessThanOrEqual(180);
    expect(previewBounds.width).toBeGreaterThan(750);
    const hide = drawer.getByRole('button', { name: 'Скрыть материалы', exact: true });
    await hide.focus();
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(preview.locator('img')).toBeVisible();
    await expect(drawer.locator('.guide-library-card')).toHaveCount(0);
    await page.keyboard.press('Space');
    await expect(list).toBeVisible();
    const select = drawer.getByRole('button', {
      name: 'Выбрать элемент: Library screenshot.png',
      exact: true,
    });
    await select.click();
    await expect(select).toHaveText('1');
    await drawer.locator('.guide-library-search input').fill('does-not-exist');
    await expect(preview).toHaveCount(0);
    await expect(list).toHaveAttribute('data-layout', 'grid');
    await drawer.locator('.guide-library-search input').fill('');
    await expect(select).toHaveText('1');
    await drawer.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(trigger).toBeFocused();
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`ordered material selection has one pointer contour and visible keyboard focus in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 560 });
    await page.getByRole('button', { name: 'Resources', exact: true }).click();
    await page
      .locator(
        '#guide-library-panel .guide-image-upload-compact .guide-action-menu-anchor > button'
      )
      .click();
    await page
      .locator('.guide-action-menu')
      .getByRole('button', { name: 'Image library', exact: true })
      .click();
    const drawer = page.locator('#guide-resource-drawer');
    const select = drawer.getByRole('button', {
      name: 'Select item: Library screenshot.png',
      exact: true,
    });
    await select.hover();
    await expect(select).toHaveCSS('outline-style', 'none');
    await select.click();
    await expect(select).toHaveText('1');
    await expect(select).toHaveAttribute('aria-pressed', 'true');
    await expect(select).toHaveCSS('outline-style', 'none');
    await page.mouse.down();
    await expect(select).toHaveCSS('outline-style', 'none');
    await page.mouse.up();
    await expect(select).toHaveAttribute('aria-pressed', 'false');
    await select.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(select).toBeFocused();
    await expect(select).toHaveCSS('outline-style', 'solid');
    await select.press('Space');
    await expect(select).toHaveText('1');
  });
}

for (const locale of ['en', 'ru'] as const) {
  test(`import header keeps destination count and confirmation reachable in ${locale}`, async ({
    page,
    hostOrigin,
  }) => {
    const labels =
      locale === 'ru'
        ? {
            resources: 'Ресурсы',
            library: 'Библиотека изображений',
            blocks: 'Блоками в выбранный шаг',
            steps: 'Каждое в отдельный шаг',
            submit: 'Импортировать выбранное',
            close: 'Закрыть',
            choose: 'Выбрать элемент: Library screenshot.png',
            count: 'Выбрано: 1',
          }
        : {
            resources: 'Resources',
            library: 'Image library',
            blocks: 'As blocks in selected step',
            steps: 'Each as a separate step',
            submit: 'Import selected',
            close: 'Close',
            choose: 'Select item: Library screenshot.png',
            count: 'Selected: 1',
          };
    for (const viewport of [
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
    ]) {
      await openVisualHarness(
        page,
        hostOrigin,
        locale === 'ru' ? 'dark' : 'light',
        locale,
        viewport
      );
      const step = page.locator('article#compare');
      const name = 'A long selected step name that still identifies the destination correctly';
      await step.locator('.guide-step-title').fill(name);
      await step.focus();
      await page.getByRole('button', { name: labels.resources, exact: true }).click();
      await page
        .locator(
          '#guide-library-panel .guide-image-upload-compact .guide-action-menu-anchor > button'
        )
        .click();
      await page
        .locator('.guide-action-menu')
        .getByRole('button', { name: labels.library, exact: true })
        .click();
      const drawer = page.locator('#guide-resource-drawer');
      const toolbar = drawer.locator('.guide-resource-header-actions');
      const submit = toolbar.getByRole('button', { name: labels.submit, exact: true });
      await expect(submit).toBeDisabled();
      const selected = drawer.getByRole('button', { name: labels.choose, exact: true });
      await selected.click();
      await expect(toolbar.locator('.guide-import-count')).toHaveText(labels.count);
      await toolbar.getByRole('button', { name: labels.blocks, exact: true }).click();
      await expect(toolbar.locator('.guide-import-target')).toContainText(name);
      await expect(selected).toHaveText('1');
      await expect(submit).toBeEnabled();
      await expect(submit).toBeInViewport({ ratio: 1 });
      await expect(drawer.getByRole('button', { name: labels.close, exact: true })).toBeInViewport({
        ratio: 1,
      });
      const rects = await toolbar.evaluate((node) => {
        const title = node.previousElementSibling!.getBoundingClientRect();
        const row = node.getBoundingClientRect();
        const mode = node.querySelector('.guide-import-destination')!.getBoundingClientRect();
        const confirm = node.querySelector('.guide-import-submit')!.getBoundingClientRect();
        return {
          titleBottom: title.bottom,
          rowTop: row.top,
          modeRight: mode.right,
          confirmLeft: confirm.left,
          overflow: node.scrollWidth > node.clientWidth,
        };
      });
      expect(rects.rowTop).toBeGreaterThanOrEqual(rects.titleBottom);
      expect(rects.modeRight).toBeLessThanOrEqual(rects.confirmLeft);
      expect(rects.overflow).toBe(false);
      await page.screenshot({
        path: `.tmp/backlog7/b15-header-${locale}-${viewport.width}.png`,
        fullPage: false,
      });
      await submit.click();
      await expect(toolbar.locator('.guide-import-count')).toHaveText(
        locale === 'ru' ? 'Выбрано: 0' : 'Selected: 0'
      );
      await drawer.getByRole('button', { name: labels.close, exact: true }).click();
      await expect(step.locator('.guide-block[data-kind="image"]')).toHaveCount(3);
    }
  });
}

test('video import hides image selection toolbar and keeps frame action reachable at minimum height', async ({
  page,
  hostOrigin,
}) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await applyHarnessBootstrap(page, { preserveMediaLibrary: true });
  await page.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`);
  const name = `toolbar-video-${crypto.randomUUID()}.webm`;
  await page.locator('input[type="file"][accept*="video/"]').setInputFiles({
    name,
    mimeType: 'video/webm',
    buffer: await readFile(new URL('../fixtures/cache-source.webm', import.meta.url)),
  });
  await expect(page.getByRole('button', { name, exact: true }).first()).toBeVisible();
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 560 });
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  await page
    .locator('#guide-library-panel .guide-image-upload-compact .guide-action-menu-anchor > button')
    .click();
  await page
    .locator('.guide-action-menu')
    .getByRole('button', { name: 'Image library', exact: true })
    .click();
  const drawer = page.locator('#guide-resource-drawer');
  await drawer.getByRole('button', { name: 'Video', exact: true }).click();
  await drawer.getByRole('button', { name, exact: true }).click();
  await expect(drawer.locator('.guide-resource-header-actions')).toBeHidden();
  const video = drawer.locator('video');
  await expect.poll(() => video.evaluate((node) => node.readyState)).toBeGreaterThanOrEqual(2);
  const submit = drawer.getByRole('button', { name: 'Add frame as step', exact: true });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport({ ratio: 1 });
  await submit.click();
  await expect(drawer.getByRole('status')).toContainText('Frame added');
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(3);
});

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`image preview controls and return preserve selection in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'en',
      { width: theme === 'light' ? 1280 : 1920, height: theme === 'light' ? 560 : 900 },
      'compare',
      { videoFixture: '1' }
    );
    await page.getByRole('button', { name: 'Resources', exact: true }).click();
    await page
      .locator(
        '#guide-library-panel .guide-image-upload-compact .guide-action-menu-anchor > button'
      )
      .click();
    await page
      .locator('.guide-action-menu')
      .getByRole('button', { name: 'Image library', exact: true })
      .click();
    const drawer = page.locator('#guide-resource-drawer');
    const selected = drawer.getByRole('button', {
      name: 'Select item: Library screenshot.png',
      exact: true,
    });
    await selected.click();
    await drawer.locator('.guide-library-search input').fill('Library');
    const card = drawer.getByRole('button', { name: 'Library screenshot.png', exact: true });
    await card.click();
    const preview = drawer.locator('.guide-library-preview');
    const player = preview.locator('[data-ui="library-media-player"]');
    const transport = player.locator('[data-ui="library-media-transport"]');
    await expect(transport.locator('p')).toHaveCount(0);
    for (const button of await transport.getByRole('button').all()) {
      await expect(button).toBeInViewport({ ratio: 1 });
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(28);
    }
    expect((await transport.boundingBox())!.height).toBeLessThanOrEqual(44);
    await player.getByRole('button', { name: '100%', exact: true }).click();
    expect(await player.locator('img').evaluate((node) => node.getBoundingClientRect().width)).toBe(
      960
    );
    await player.getByRole('button', { name: 'Fit', exact: true }).click();
    await player.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await player.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await page.screenshot({ path: `.tmp/backlog7/b16-preview-${theme}.png`, fullPage: false });
    await player.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
    await expect
      .poll(() => player.evaluate((node) => document.fullscreenElement === node))
      .toBe(true);
    await expect(player.getByRole('button', { name: 'Fit', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await page.screenshot({ path: `.tmp/backlog7/b16-fullscreen-${theme}.png`, fullPage: false });
    await player.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await preview.getByRole('button', { name: 'Back to materials', exact: true }).click();
    await expect(preview).toHaveCount(0);
    await expect(card).toBeFocused();
    await expect(selected).toHaveText('1');
    await expect(drawer.locator('.guide-library-search input')).toHaveValue('Library');
    await drawer.getByRole('button', { name: 'Video', exact: true }).click();
    await drawer.getByRole('button', { name: 'Library motion.webm', exact: true }).click();
    await expect(drawer.locator('.guide-resource-header-actions')).toBeHidden();
    await preview.getByRole('button', { name: 'Back to materials', exact: true }).click();
    await expect(preview).toHaveCount(0);
    await expect(drawer.locator('.guide-resource-header-actions')).toBeVisible();
    await expect(drawer.locator('.guide-import-count')).toHaveText('Selected: 1');
    await drawer.getByRole('button', { name: 'Images', exact: true }).click();
    await expect(selected).toHaveText('1');
  });
}

test('return from preview restores the material grid scroll position', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 560 });
  const bytes = await page
    .locator('article img')
    .first()
    .evaluate(async (node) => {
      const blob = await (await fetch(node.src)).blob();
      return [...new Uint8Array(await blob.arrayBuffer())];
    });
  await page.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`);
  await page.locator('input[type="file"][accept*="image/"]').setInputFiles(
    Array.from({ length: 12 }, (_, index) => ({
      name: `Scroll material ${String(index).padStart(2, '0')}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(bytes),
    }))
  );
  await expect(
    page.getByRole('button', { name: 'Scroll material 11.png', exact: true }).first()
  ).toBeVisible();
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 560 });
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  await page
    .locator('#guide-library-panel .guide-image-upload-compact .guide-action-menu-anchor > button')
    .click();
  await page
    .locator('.guide-action-menu')
    .getByRole('button', { name: 'Image library', exact: true })
    .click();
  const drawer = page.locator('#guide-resource-drawer');
  await drawer.locator('.guide-library-search input').fill('Scroll material');
  const list = drawer.locator('[data-ui="library-materials-list"]');
  await expect(list.locator('.guide-library-card')).toHaveCount(12);
  const before = await list.evaluate((node) => {
    node.scrollTop = 300;
    const bounds = node.getBoundingClientRect();
    const card = [...node.querySelectorAll<HTMLButtonElement>('.guide-library-card')].find(
      (item) => {
        const rect = item.getBoundingClientRect();
        return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
      }
    );
    return { top: node.scrollTop, name: card?.textContent ?? '' };
  });
  expect(before.top).toBeGreaterThan(100);
  expect(before.name).not.toBe('');
  await drawer.getByRole('button', { name: before.name, exact: true }).click();
  await expect(list).toHaveAttribute('data-layout', 'strip');
  await drawer.getByRole('button', { name: 'Back to materials', exact: true }).click();
  await expect(list).toHaveAttribute('data-layout', 'grid');
  await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBe(before.top);
});
