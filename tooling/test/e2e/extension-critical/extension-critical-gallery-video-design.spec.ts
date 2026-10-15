import { expect, test, type Page, type Locator, type TestInfo } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  for (const locale of ['ru', 'en'] as const)
    for (const theme of ['light', 'dark'] as const) {
      test(`video inspector construction ${viewport.width} ${locale} ${theme}`, async ({
        page,
      }, info) => {
        const host = await startHostServer();
        const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
        try {
          await page.setViewportSize(viewport);
          await applyHarnessBootstrap(page, {
            preserveMediaLibrary: true,
            storage: {
              'sniptale-locale-preference': locale,
              'sniptale-theme-preference': theme,
            },
          });
          await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
          await page.locator('[data-ui="gallery.page.root"]').waitFor();
          await seedReviewVideo(
            page,
            'review-vp8-opus.webm',
            { width: 160, height: 90, duration: 12 },
            false,
            true
          );
          await page.reload();
          await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
          await page.locator('[data-ui="gallery.videoReview.enter"]').click();
          const mode = page.getByRole('button', {
            name: label('gallery.videoReview.advancedEditing'),
            exact: true,
          });
          await exerciseWorkspaceCommandPress(
            page,
            mode,
            viewport.width === 1280 && locale === 'ru' && theme === 'light'
          );
          await page.evaluate(() => document.fonts.ready);
          const inspector = page.locator('[data-ui="gallery.videoReview.inspector"]');
          const canvas = inspector.locator('[data-ui="gallery.videoReview.canvasSettings"]');
          const names = canvas.locator('.sniptale-parameter-name');
          await expect(names).toHaveCount(3);
          await checkParameterRhythm(names);
          const format = canvas.getByRole('button', {
            name: label('videoEditor.sidebar.canvasFormatLabel'),
            exact: true,
          });
          await names.first().click();
          await expect(format).toHaveAttribute('aria-expanded', 'true');
          if (viewport.width === 1280 && locale === 'ru' && theme === 'light') {
            const familyOverride = await page.addStyleTag({
              content: '* { --sniptale-font-interface: monospace !important; }',
            });
            await expect(names.first()).toHaveCSS('font-family', 'monospace');
            await expect(page.getByRole('listbox')).toHaveCSS('font-family', 'monospace');
            await familyOverride.evaluate((node) => node.remove());
          }

          await page.evaluate(() =>
            Promise.all(
              document.getAnimations().map((animation) => animation.finished.catch(() => undefined))
            )
          );
          await page.screenshot({ path: info.outputPath('canvas-menu.png'), fullPage: false });
          await names.first().click();
          await expect(format).toHaveAttribute('aria-expanded', 'false');
          const row = format.locator(
            'xpath=ancestor::*[contains(@class,"sniptale-parameter-row")][1]'
          );
          await row.click({ position: { x: 2, y: 2 } });
          await expect(format).toHaveAttribute('aria-expanded', 'true');
          await format.press('Escape');
          await expect(format).toHaveAttribute('aria-expanded', 'false');

          const header = inspector.locator('[data-ui="window-header-settings"]');
          const browser = header.getByRole('button', {
            name: label('windowHeader.browser'),
            exact: true,
          });
          if (await browser.count()) await browser.click();
          else {
            await header
              .getByRole('button', { name: label('windowHeader.type'), exact: true })
              .click();
            await page
              .getByRole('option', { name: label('windowHeader.browser'), exact: true })
              .click();
          }
          const title = header.getByRole('textbox', {
            name: label('windowHeader.tabTitle'),
            exact: true,
          });
          await title.fill('A translated document title');
          const clear = header.getByRole('button', {
            name: label('shared.ui.clearField').replace('{field}', label('windowHeader.tabTitle')),
            exact: true,
          });
          await clear.click();
          await expect(title).toHaveValue('');
          await expect(title).toBeFocused();
          await title.fill('Document title');
          await title.press('Enter');
          await title.scrollIntoViewIfNeeded();
          await page.evaluate(() =>
            Promise.all(
              document.getAnimations().map((animation) => animation.finished.catch(() => undefined))
            )
          );
          await page.screenshot({ path: info.outputPath('window-header.png'), fullPage: false });

          const background = inspector.locator(
            '[data-ui="gallery.videoReview.backgroundInspector"]'
          );
          const solid = background.getByRole('button', {
            name: label('gallery.videoReview.backgroundSolid'),
            exact: true,
          });
          if (await solid.count()) await solid.click();
          else {
            const kind = background
              .getByRole('button', { name: label('gallery.videoReview.background'), exact: true })
              .locator('xpath=ancestor::*[contains(@class,"sniptale-parameter-row")][1]');
            await kind.locator('.sniptale-parameter-name').click();
            await expect(kind.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
            await kind.locator('.sniptale-parameter-name').click();
            await expect(kind.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
            await kind.click({ position: { x: 2, y: 2 } });
            await page
              .getByRole('option', {
                name: label('gallery.videoReview.backgroundSolid'),
                exact: true,
              })
              .click();
          }
          const ordinary = background.locator('.sniptale-parameter-name').filter({
            hasText: new RegExp(
              [
                label('gallery.videoReview.backgroundPadding'),
                label('gallery.videoReview.backgroundCornerRadius'),
                label('gallery.videoReview.backgroundShadow'),
                label('gallery.videoReview.backgroundShadowColor'),
              ]
                .map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('|')
            ),
          });
          await expect(ordinary).toHaveCount(4);
          const tops = await ordinary.evaluateAll((nodes) =>
            nodes.map((node) => node.getBoundingClientRect().top)
          );
          for (let index = 1; index < tops.length; index++)
            expect(tops[index]! - tops[index - 1]!).toBeCloseTo(36, 0);
          await ordinary.last().scrollIntoViewIfNeeded();
          await page.evaluate(() =>
            Promise.all(
              document.getAnimations().map((animation) => animation.finished.catch(() => undefined))
            )
          );
          await page.screenshot({ path: info.outputPath('background.png'), fullPage: false });
          const colorRow = background.locator('.sniptale-parameter-row').filter({
            hasText: label('gallery.videoReview.backgroundShadowColor'),
          });
          const colorName = colorRow.locator('.sniptale-parameter-name');
          await colorName.click();
          const colorInput = background.getByRole('textbox', {
            name: label('gallery.videoReview.backgroundShadowColor'),
            exact: true,
          });
          await expect(colorInput).toBeFocused();
          expect(
            await colorInput.evaluate((node) => node.selectionEnd! - node.selectionStart!)
          ).toBe((await colorInput.inputValue()).length);
          await colorName.click();
          await expect(colorInput).toHaveCount(0);
          await colorRow.click({ position: { x: 2, y: 16 } });
          await expect(colorInput).toBeFocused();
          await colorInput.press('Escape');
          await colorRow
            .getByRole('button', {
              name: label('shared.ui.colorSelectorChooseColor'),
              exact: true,
            })
            .click();
          const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
          await expect(picker).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(picker).toHaveCount(0);
          await exercisePreviewCommands(page, label, info);
          await exerciseResetConfirmation(page, label, info);
          if (viewport.width === 1920 && locale === 'ru' && theme === 'light') {
            await checkInspectorWidthTransitions(page, inspector, label, info);
          }
        } finally {
          host.server.close();
        }
      });
    }
}

type Label = (key: Parameters<typeof translate>[0]) => string;

test('product catalog renders migrated parameter families', async ({ page }, info) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1280, height: 560 });
    await applyHarnessBootstrap(page, {
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
    });
    await page.goto(`${host.origin}/apps/extension/src/design-system/index.html`);
    await page.getByRole('searchbox').first().fill('compact-inspector-controls');
    const entry = page.locator('article').filter({
      has: page.getByText('Compact inspector controls', { exact: true }),
    });
    const summary = entry.locator(':scope > button');
    if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click();
    const names = entry.locator('.sniptale-parameter-name');
    await expect(names.first()).toHaveCSS('font-size', '13px');
    await expect(names.first()).toHaveCSS('font-family', /Sniptale Interface/);
    await names.first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath('product-parameter-catalog.png'),
      fullPage: false,
    });
  } finally {
    host.server.close();
  }
});

async function exerciseResetConfirmation(page: Page, label: Label, info: TestInfo) {
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: label('gallery.videoReview.historyReset'), exact: true })
    .click();
  const choices = page.locator('[data-ui="gallery.videoReview.historyChoices"]');
  await expect(choices).toHaveCSS('border-radius', '4px');
  await choices.locator('[data-history-original]').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toHaveCSS('border-radius', '8px');
  await expect(dialog).toHaveCSS('font-family', /Sniptale Interface/);
  const cancel = dialog.getByRole('button', {
    name: label('gallery.videoReview.resetCancel'),
    exact: true,
  });
  await expect(cancel).toBeFocused();
  await expect(cancel).toHaveCSS('font-size', '13px');
  await expect(cancel).toHaveCSS('min-height', '32px');
  await page.screenshot({ path: info.outputPath('reset-confirmation.png'), fullPage: false });
  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('Escape');
}

async function exerciseWorkspaceCommandPress(
  page: Page,
  mode: Locator,
  checkInterruption: boolean
) {
  const initialBounds = await mode.boundingBox();
  if (!initialBounds) throw new Error('Workspace mode target is missing');
  await mode.hover();
  await page.mouse.down();
  await expect(mode).toHaveAttribute('data-pressing', 'true');
  await expect(mode).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.move(1, 1);
  await expect(mode).not.toHaveAttribute('data-pressing', 'true');
  await mode.hover();
  await expect(mode).toHaveAttribute('data-pressing', 'true');
  expect(await mode.boundingBox()).toEqual(initialBounds);
  await page.mouse.up();
  await expect(mode).toHaveAttribute('aria-pressed', 'true');
  await mode.click();
  if (checkInterruption) {
    await mode.hover();
    await page.mouse.down();
    await mode.dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up();
    await expect(mode).toHaveAttribute('aria-pressed', 'false');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mode.hover();
    await page.mouse.down();
    await expect(mode.locator('.review-command-content')).toHaveCSS('transform', 'none');
    await expect(mode.locator('.review-command-content')).toHaveCSS('opacity', '0.72');
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await expect(mode).toHaveAttribute('aria-pressed', 'false');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  await mode.focus();
  await page.keyboard.down('Space');
  // This editor reserves Space for playback, even on focused command buttons.
  await expect(mode).not.toHaveAttribute('data-pressing', 'true');
  await page.keyboard.up('Space');
  await page.keyboard.press('Space');
  await expect(mode).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.down('Enter');
  await expect(mode).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.down('Enter');
  await expect(mode).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('Enter');
}

async function checkParameterRhythm(names: Locator) {
  const geometry = await names.evaluateAll((nodes) =>
    nodes.map((node) => {
      const text = document.createRange();
      text.selectNodeContents(node);
      const bounds = text.getBoundingClientRect();
      return {
        top: bounds.bottom,
        left: bounds.left,
        font: getComputedStyle(node).fontSize,
        weight: getComputedStyle(node).fontWeight,
      };
    })
  );
  for (let index = 1; index < geometry.length; index++) {
    expect(geometry[index]!.top - geometry[index - 1]!.top).toBeCloseTo(36, 0);
    expect(geometry[index]!.left).toBeCloseTo(geometry[0]!.left, 0);
  }
  expect(geometry.map(({ font, weight }) => ({ font, weight }))).toEqual(
    Array.from({ length: 3 }, () => ({ font: '13px', weight: '500' }))
  );
}

async function exercisePreviewCommands(page: Page, label: Label, info: TestInfo) {
  await page.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
  const preview = page.locator('[data-ui="gallery.videoReview.previewInspector"]');
  const frameRate = preview.getByRole('switch', {
    name: label('gallery.videoReview.previewShowFrameRate'),
    exact: true,
  });
  await frameRate.click();
  await expect(frameRate).toHaveAttribute('aria-checked', 'true');
  const reset = preview.getByRole('button', {
    name: label('gallery.videoReview.previewReset'),
    exact: true,
  });
  await reset.focus();
  await page.keyboard.down('Space');
  await expect(reset).toHaveAttribute('data-pressing', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.up('Space');
  await expect(preview).toBeVisible();
  await expect(frameRate).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(frameRate).toHaveAttribute('aria-checked', 'false');
  await page.screenshot({ path: info.outputPath('preview-settings.png'), fullPage: false });
}

async function checkInspectorWidthTransitions(
  page: Page,
  inspector: Locator,
  label: Label,
  info: TestInfo
) {
  await inspector
    .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
    .click();
  const resize = page.locator('[data-ui="gallery.videoReview.resizeInspector"]');
  const scroll = inspector.locator('.review-inspector-scroll');
  for (const width of [523, 524, 525]) {
    const contentWidth = () =>
      scroll.evaluate((node) => {
        const style = getComputedStyle(node);
        return (
          node.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight)
        );
      });
    const current = await contentWidth();
    const handle = await resize.boundingBox();
    if (!handle) throw new Error('Inspector resize target is missing');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 12);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 - (width - current), handle.y + 12);
    await page.mouse.up();
    await expect.poll(contentWidth).toBe(width);
    const sections = inspector.locator('[data-ui="gallery.videoReview.inspectorSections"]').first();
    await expect(sections).toHaveCSS('display', width < 524 ? 'block' : 'grid');
    const clipped = await inspector
      .locator('.sniptale-parameter-row')
      .evaluateAll(
        (nodes) =>
          nodes.filter(
            (node) =>
              node.getBoundingClientRect().width > 0 && node.scrollWidth > node.clientWidth + 1
          ).length
      );
    expect(clipped).toBe(0);
    await page.screenshot({
      path: info.outputPath(`inspector-${width}.png`),
      fullPage: false,
    });
  }
  await page.setViewportSize({ width: 1100, height: 560 });
  const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
  const workspaceScroll = dialog.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
  await expect(workspaceScroll).toHaveCSS('overflow-x', 'auto');
  expect(await workspaceScroll.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  await workspaceScroll.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await expect(
    dialog.getByRole('button', { name: label('common.actions.close'), exact: true })
  ).toBeInViewport();
  await page.screenshot({ path: info.outputPath('below-minimum.png'), fullPage: false });
}
