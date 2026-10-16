import type { Page, TestInfo } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { test, expect } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createTextClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';
import { translate } from '../../../../apps/extension/src/platform/i18n';

const ui = (page: Page, name: string) => page.locator(`[data-ui="${name}"]`);
test.use({ actionTimeout: 10_000 });

test('authored canvas text is independent from interface family', async ({
  page,
  hostOrigin,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const project = createEmptyVideoProject('Authored font proof');
  const text = createTextClip(project.tracks[0]!.id, project.width, project.height, 0);
  text.text = 'Authored serif text';
  text.style.fontFamily = 'serif';
  project.duration = text.duration;
  project.clips.push(text);
  await applyHarnessBootstrap(page, {
    apiBehavior: { runtimeFallback: 'typed-success' },
    videoProjects: [project],
    storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
  });
  await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
  await page.goto(`${hostOrigin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`);
  const canvas = page.locator('canvas[data-preview-stage-canvas]');
  await expect(canvas).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      canvas.evaluate((node: HTMLCanvasElement) => {
        const pixels = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
        const colors = new Set<number>();
        for (let i = 0; i < pixels.length; i += 4) {
          colors.add((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!);
          if (colors.size > 3) return true;
        }
        return false;
      })
    )
    .toBe(true);
  const before = await canvas.evaluate((node: HTMLCanvasElement) => ({
    width: node.width,
    height: node.height,
    pixels: node.toDataURL(),
  }));
  const title = ui(page, 'video-editor.floating.document-bar').getByRole('textbox');
  const initialFont = await title.evaluate((node) => getComputedStyle(node).fontFamily);
  await page
    .locator('.sniptale-extension-surface')
    .first()
    .evaluate((node: HTMLElement) => {
      node.style.setProperty('--sniptale-font-sans', 'monospace');
      node.style.setProperty('--sniptale-font-interface', 'monospace');
    });
  await expect(title).not.toHaveCSS('font-family', initialFont);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
  const after = await canvas.evaluate((node: HTMLCanvasElement) => ({
    width: node.width,
    height: node.height,
    pixels: node.toDataURL(),
  }));
  expect(after).toEqual(before);
  expect(text.style.fontFamily).toBe('serif');
  await page.screenshot({ path: info.outputPath('authored-canvas-font.png'), fullPage: false });
});

type Locale = 'ru' | 'en';
type Theme = 'light' | 'dark';
const mediaPath = fileURLToPath(new URL('../fixtures/cache-source.webm', import.meta.url));

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

async function openNativeVideo(page: Page, extensionId: string, locale: Locale, theme: Theme) {
  const base = `chrome-extension://${extensionId}/apps/extension/src`;
  await page.goto(`${base}/gallery/index.html`);
  await expect(ui(page, 'gallery.page.root')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toMatch(/^(ru|en)$/);
  await page.evaluate(
    async ({ locale, theme }) => {
      localStorage.setItem('sniptale-locale-preference', locale);
      await chrome.storage.local.set({
        'sniptale-locale-preference': locale,
        'sniptale-theme-preference': theme,
      });
    },
    { locale, theme }
  );
  await page.goto(`${base}/video-editor/index.html`);
  await expect(
    page.locator('[data-ui="editor.start"], [data-ui="video-editor.workspace.root"]').first()
  ).toBeVisible();
  const start = ui(page, 'editor.start');
  if (await start.isVisible()) await start.getByRole('button').first().click();
  await expect(ui(page, 'video-editor.workspace.root')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.locator('input[type=file][accept*="video/"]').first().setInputFiles(mediaPath);
  const material = ui(page, 'video-editor.materials').getByRole('button', {
    name: 'cache-source.webm',
    exact: true,
  });
  await expect(material).toBeVisible();
  await material.click();
  await expect(ui(page, 'video-editor.source-viewer')).toBeVisible();
  await ui(page, 'video-editor.source-placement')
    .getByTitle(translate('videoEditor.app.materialsAppend', locale), { exact: true })
    .click();
  await expect(page.locator('[data-project-timeline-clip]')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
}

async function inspectMaterials(page: Page, locale: Locale, info: TestInfo) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const materials = ui(page, 'video-editor.materials');
  const material = materials.getByRole('button', { name: 'cache-source.webm', exact: true });
  await expect(material).toHaveCSS('font-size', '13px');
  expect((await material.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await ui(page, 'video-editor.materials.search').click();
  const query = materials.getByRole('textbox', {
    name: label('videoEditor.sidebar.materialsSearch'),
    exact: true,
  });
  await query.fill('missing-material');
  await expect(material).toHaveCount(0);
  await materials
    .getByRole('button', {
      name: label('shared.ui.clearField').replace(
        '{field}',
        label('videoEditor.sidebar.materialsSearch')
      ),
      exact: true,
    })
    .click();
  await expect(query).toHaveValue('');
  await expect(query).toBeFocused();
  await expect(material).toBeVisible();
  await query.press('Escape');
  await expect(query).toHaveCount(0);
  await expect(ui(page, 'video-editor.materials.search')).toBeFocused();
  const importTrigger = ui(page, 'video-editor.materials.import');
  await importTrigger.scrollIntoViewIfNeeded();
  await importTrigger.click();
  const menu = ui(page, 'video-editor.materials.import-menu');
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((node) => getComputedStyle(node).fontFamily)).toContain(
    'Sniptale Interface'
  );
  await screenshot(page, info, 'materials-import-menu');
  await expect.soft(menu.locator('.sniptale-toolbar-menu-title')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(importTrigger).toBeFocused();
}

async function inspectVideoCommands(page: Page, locale: Locale, info: TestInfo) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const clip = page.locator('[data-project-timeline-clip]');
  await clip.click();
  const inspector = ui(page, 'video-editor.inspector.content');
  await expect(inspector).toBeVisible();
  const presets = ui(page, 'video-editor.framing-presets');
  await expect(presets.getByRole('button')).toHaveCount(3);
  await screenshot(page, info, 'framing-presets');
  const captionGeometry = await presets.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const caption = [...button.querySelectorAll('span')].find(
        (span) => span.childElementCount === 0 && Boolean(span.textContent?.trim())
      )!;
      const rect = caption.getBoundingClientRect();
      const target = button.getBoundingClientRect();
      const style = getComputedStyle(caption);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const longestWord = Math.max(
        ...caption
          .textContent!.trim()
          .split(/\s+/)
          .map((word) => context.measureText(word).width)
      );
      return {
        label: caption.textContent,
        width: rect.width,
        longestWord,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        targetLeft: target.left,
        targetRight: target.right,
        targetTop: target.top,
        targetBottom: target.bottom,
      };
    })
  );
  for (const caption of captionGeometry) {
    expect
      .soft(caption.width, `${caption.label}: longest word fits`)
      .toBeGreaterThanOrEqual(caption.longestWord - 1);
    expect.soft(caption.left).toBeGreaterThanOrEqual(caption.targetLeft - 1);
    expect.soft(caption.right).toBeLessThanOrEqual(caption.targetRight + 1);
    expect.soft(caption.top).toBeGreaterThanOrEqual(caption.targetTop - 1);
    expect.soft(caption.bottom).toBeLessThanOrEqual(caption.targetBottom + 1);
  }
  const categories = inspector.locator('[data-ui="video-editor.inspector.categories"] nav');
  for (const button of await categories.getByRole('button').all()) {
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(
      await inspector.evaluate((node) => node.scrollWidth - node.clientWidth)
    ).toBeLessThanOrEqual(1);
  }
  await screenshot(page, info, 'selection-inspector');
  await ui(page, 'video-editor.timeline.toolbar.undo').click();
  await expect(clip).toHaveCount(0);
  await ui(page, 'video-editor.timeline.toolbar.redo').click();
  await expect(clip).toHaveCount(1);
  await page.keyboard.press('Control+k');
  const palette = ui(page, 'video-editor.command-palette');
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('textbox')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  const projectMenu = ui(page, 'video-editor.timeline.toolbar.project-menu');
  await projectMenu.click();
  await page
    .getByRole('button', { name: label('videoEditor.app.exportButton'), exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const cancel = dialog.getByRole('button', {
    name: label('videoEditor.exportDialog.cancel'),
    exact: true,
  });
  await cancel.scrollIntoViewIfNeeded();
  await expect(cancel).toBeInViewport({ ratio: 1 });
  await screenshot(page, info, 'export-draft-dialog');
  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await expect(clip).toHaveCount(1);
}

async function inspectPreview(page: Page, locale: Locale, theme: Theme, info: TestInfo) {
  const viewerHeader = ui(page, 'video.preview.header');
  const viewerBox = (await viewerHeader.boundingBox())!;
  for (const panel of ['video-editor.library.panel', 'video-editor.floating.context-inspector']) {
    const adjacent = (await ui(page, panel).locator(':scope > header').boundingBox())!;
    expect(Math.abs(viewerBox.y - adjacent.y)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(viewerBox.y + viewerBox.height - adjacent.y - adjacent.height)
    ).toBeLessThanOrEqual(1);
  }
  const trigger = ui(page, 'video.preview.display-settings');
  const textBounds = await trigger.locator('.sniptale-command-content > span').evaluate((text) => {
    const button = text.closest('button')!;
    const rect = text.getBoundingClientRect();
    const target = button.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      targetLeft: target.left,
      targetRight: target.right,
    };
  });
  const sceneBounds = (await ui(page, 'video-editor.viewer.scene').boundingBox())!;
  expect.soft(textBounds.left).toBeGreaterThanOrEqual(textBounds.targetLeft);
  expect.soft(textBounds.right).toBeLessThanOrEqual(textBounds.targetRight);
  expect.soft(textBounds.right).toBeLessThanOrEqual(sceneBounds.x);
  await trigger.click();
  const panel = ui(page, 'video.preview.display-settings.panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-theme', theme);
  await expect(panel).toHaveCSS('border-radius', '4px');
  expect(await panel.evaluate((node) => getComputedStyle(node).fontFamily)).toContain(
    'Sniptale Interface'
  );
  const last = panel.getByRole('radio', { name: '100%', exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport({ ratio: 1 });
  if (page.viewportSize()!.height === 560) {
    expect(
      await panel.locator('.sniptale-dropdown-menu').evaluate((node) => node.scrollTop)
    ).toBeGreaterThan(0);
  }
  await screenshot(page, info, 'preview-display-settings');
  await last.check();
  await expect(last).toBeChecked();
  await panel
    .getByRole('radio', {
      name: translate('videoEditor.stage.previewZoomFit', locale),
      exact: true,
    })
    .check();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  if (locale === 'ru' && theme === 'light' && page.viewportSize()!.height === 560) {
    const canvas = page.locator('canvas[data-preview-stage-canvas]');
    const original = await canvas.elementHandle();
    await ui(page, 'video-editor.preview.fullscreen-toggle').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    const transport = ui(page, 'video-editor.preview.fullscreen-transport');
    await expect(transport).toBeVisible();
    await expect(canvas).toBeVisible();
    await screenshot(page, info, 'preview-fullscreen');
    await transport
      .getByRole('button', {
        name: translate('videoEditor.stage.exitFullscreen', locale),
        exact: true,
      })
      .click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(ui(page, 'video-editor.preview.fullscreen-toggle')).toBeFocused();
    expect(await original?.evaluate((node) => node.isConnected)).toBe(true);
    await expect(canvas).toBeVisible();
    await expect(page.locator('[data-project-timeline-clip]')).toHaveCount(1);
  }
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
      test(`standalone video composition ${locale} ${theme} ${viewport.name}`, async ({
        page,
        extensionId,
      }, info) => {
        test.setTimeout(90_000);
        await page.setViewportSize(viewport.size);
        await openNativeVideo(page, extensionId, locale, theme);
        await screenshot(page, info, 'workspace');
        if (locale === 'ru' && theme === 'light' && viewport.name === '1280x560') {
          await ui(page, 'video-editor.viewer.scene').click();
          const parameters = ui(page, 'video-editor.inspector.content');
          await expect(parameters).toBeVisible();
          const dimensions = parameters
            .locator('[data-ui="video-editor.inspector.disclosure"]')
            .filter({
              has: page.getByText(translate('videoEditor.sidebar.canvasExactSize', locale), {
                exact: true,
              }),
            });
          const summary = dimensions.locator('summary');
          const summaryStyle = await summary.evaluate((node) => {
            const style = getComputedStyle(node);
            return {
              start: style.paddingInlineStart,
              end: style.paddingInlineEnd,
              minHeight: style.minHeight,
            };
          });
          expect.soft(summaryStyle.start).toBe('8px');
          expect.soft(summaryStyle.end).toBe('8px');
          expect.soft(summaryStyle.minHeight).toBe('32px');
          if ((await dimensions.getAttribute('open')) === null) await summary.click();
          const numericRows = parameters.locator(
            '.sniptale-parameter-stack > [data-ui="shared.ui.compact-inspector.numeric-row"]'
          );
          await numericRows.last().scrollIntoViewIfNeeded();
          for (const row of await numericRows.all()) await expect(row).toBeInViewport({ ratio: 1 });
          const layout = await parameters
            .locator('.sniptale-parameter-stack > *')
            .evaluateAll((nodes) =>
              nodes.map((node) => {
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                const name = node.querySelector('.sniptale-parameter-name');
                const nameRect = name?.getBoundingClientRect();
                return {
                  ui: node.getAttribute('data-ui'),
                  classes: node.className,
                  text: node.textContent?.slice(0, 100),
                  marginTop: style.marginTop,
                  marginBottom: style.marginBottom,
                  top: rect.top,
                  height: rect.height,
                  name: name?.textContent,
                  nameTop: nameRect?.top,
                  nameHeight: nameRect?.height,
                  nameFont: name ? getComputedStyle(name).font : null,
                };
              })
            );
          await writeFile(
            info.outputPath('scene-stack-layout.json'),
            JSON.stringify(layout, null, 2)
          );
          await screenshot(page, info, 'scene-spacing');
          const ordinaryRows = parameters.locator(
            '.sniptale-parameter-stack > .sniptale-parameter-row'
          );
          expect(await ordinaryRows.count()).toBeGreaterThan(1);
          for (const row of await ordinaryRows.all()) {
            await expect(row).toHaveCSS('margin-block-start', '0px');
          }
          const pair = await numericRows.evaluateAll((rows) =>
            rows.slice(0, 2).map((row) => ({
              height: row.getBoundingClientRect().height,
              nameTop: row.querySelector('.sniptale-parameter-name')!.getBoundingClientRect().top,
              nameHeight: row.querySelector('.sniptale-parameter-name')!.getBoundingClientRect()
                .height,
              lineHeight: Number.parseFloat(
                getComputedStyle(row.querySelector('.sniptale-parameter-name')!).lineHeight
              ),
              visibleTextBounds: (() => {
                const range = document.createRange();
                range.selectNodeContents(row.querySelector('.sniptale-parameter-name')!);
                const bounds = range.getBoundingClientRect();
                return { top: bounds.top, bottom: bounds.bottom };
              })(),
              visibleTextHeight: (() => {
                const range = document.createRange();
                range.selectNodeContents(row.querySelector('.sniptale-parameter-name')!);
                return range.getBoundingClientRect().height;
              })(),
            }))
          );
          for (const row of pair) {
            expect(row.height).toBeGreaterThanOrEqual(31.5);
            expect(row.lineHeight).toBe(18);
            expect(row.nameHeight + 0.5).toBeGreaterThanOrEqual(row.visibleTextHeight);
            expect(row.height + 0.5).toBeGreaterThanOrEqual(row.nameHeight);
            expect(row.visibleTextBounds.top + 0.5).toBeGreaterThanOrEqual(row.nameTop);
            expect(row.visibleTextBounds.bottom).toBeLessThanOrEqual(
              row.nameTop + row.nameHeight + 0.5
            );
          }
          expect(
            Math.abs(pair[1]!.nameTop - pair[0]!.nameTop - pair[0]!.height - 4)
          ).toBeLessThanOrEqual(0.5);
        }
        await inspectMaterials(page, locale, info);
        await inspectVideoCommands(page, locale, info);
        await inspectPreview(page, locale, theme, info);
      });
    }
  }
}

test('standalone timeline container thresholds and outer horizontal scroll', async ({
  page,
  extensionId,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 900 });
  await openNativeVideo(page, extensionId, 'en', 'light');
  for (const name of ['video-editor.materials.dock-toggle', 'video-editor.inspector.dock-toggle']) {
    const button = ui(page, name);
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  const timeline = ui(page, 'video-editor.timeline.surface');
  for (const target of [999, 1000, 1001, 1399, 1400, 1401, 1599, 1600, 1601]) {
    let width = target + 700;
    for (let attempt = 0; attempt < 6; attempt++) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      const measured = (await timeline.boundingBox())!.width;
      if (Math.abs(measured - target) <= 1) break;
      width += Math.round(target - measured);
    }
    expect(Math.abs((await timeline.boundingBox())!.width - target)).toBeLessThanOrEqual(1);
    await expect(ui(page, 'video-editor.timeline.toolbar.project-menu')).toBeInViewport({
      ratio: 1,
    });
    await screenshot(page, info, `timeline-container-${target}`);
  }
  await page.setViewportSize({ width: 1100, height: 560 });
  const surface = ui(page, 'video-editor.workspace.root');
  const overflow = await surface.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
    return { total: node.scrollWidth, visible: node.clientWidth, offset: node.scrollLeft };
  });
  expect(overflow.total).toBeGreaterThan(overflow.visible);
  expect(overflow.offset).toBeGreaterThan(0);
  await screenshot(page, info, 'below-desktop-minimum');
});
