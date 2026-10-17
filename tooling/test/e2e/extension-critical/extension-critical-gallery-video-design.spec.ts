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
          await page.evaluate(() => document.fonts.ready);
          await checkCommandTypography(page, mode);
          await exerciseWorkspaceCommandPress(
            page,
            mode,
            viewport.width === 1280 && locale === 'ru' && theme === 'light'
          );
          await page.evaluate(() => document.fonts.ready);
          await checkCommandTypography(page, mode, 'indicator');
          await expect(mode).toHaveAttribute('aria-pressed', 'true');
          const cursor = page
            .locator('.review-timeline-toolbar')
            .getByRole('button', { name: label('gallery.videoReview.pointerTool'), exact: true });
          await expect(cursor).toHaveAttribute('aria-pressed', 'true');
          await checkCommandTypography(page, cursor, true);
          await checkCommandTypography(
            page,
            page.locator('[data-ui="gallery.videoReview.previewSettings"]')
          );
          await checkDisabledCommandTypography(
            page,
            page.getByRole('button', { name: label('gallery.videoReview.redo'), exact: true })
          );
          await checkTrackIndicators(page, label, info);
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
          await expect(format).toHaveAttribute('aria-expanded', 'false');
          await format.click();
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
          await expect(format).toHaveAttribute('aria-expanded', 'false');
          await format.click();
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
            await expect(kind.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
            await kind.getByRole('button').click();
            await page
              .getByRole('option', {
                name: label('gallery.videoReview.backgroundSolid'),
                exact: true,
              })
              .click();
          }
          const backgroundNames = background.locator('.sniptale-parameter-name');
          const ordinary = backgroundNames
            .filter({ hasText: label('gallery.videoReview.backgroundPadding') })
            .or(
              backgroundNames.filter({
                hasText: label('gallery.videoReview.backgroundCornerRadius'),
              })
            )
            .or(backgroundNames.filter({ hasText: label('gallery.videoReview.backgroundShadow') }))
            .or(
              backgroundNames.filter({
                hasText: label('gallery.videoReview.backgroundShadowColor'),
              })
            );
          await expect(ordinary).toHaveCount(4);
          const tops = await ordinary.evaluateAll((nodes) =>
            nodes.map((node) => {
              const text = document.createRange();
              text.selectNodeContents(node);
              return text.getBoundingClientRect().top;
            })
          );
          for (let index = 1; index < tops.length; index++)
            expect(tops[index]! - tops[index - 1]!).toBeCloseTo(44, 0);
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
          await expect(colorRow.locator('input')).toHaveCount(0);
          await colorRow.locator('[data-ui="shared.ui.color-selector.value-trigger"]').click();
          const colorInput = background.getByRole('textbox', {
            name: label('gallery.videoReview.backgroundShadowColor'),
            exact: true,
          });
          await expect(colorInput).toBeFocused();
          expect(
            await colorInput.evaluate((node) => node.selectionEnd! - node.selectionStart!)
          ).toBe((await colorInput.inputValue()).length);
          await colorInput.press('Escape');
          await colorRow.click({ position: { x: 2, y: 16 } });
          await expect(colorInput).toHaveCount(0);
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
          await checkInspectorSectionPresentation(page, inspector, info);
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

async function checkTrackIndicators(page: Page, label: Label, info: TestInfo) {
  const audio = page.locator('[data-review-header-track="originalAudio"]');
  const status = audio.locator('button[aria-pressed]').first();
  await expect(status).toHaveAttribute('aria-pressed', 'true');
  await checkTrackIndicator(page, status, 28, '--sniptale-color-text-secondary');
  await status.click();
  await expect(status).toHaveAttribute('aria-pressed', 'false');
  await checkTrackIndicator(page, status, 28, '--sniptale-color-accent');
  await status.click();
  await expect(status).toHaveAttribute('aria-pressed', 'true');
  await checkTrackIndicator(page, status, 28, '--sniptale-color-text-secondary');
  await checkTrackIndicator(
    page,
    page.locator('[data-ui="gallery.videoReview.trackControls"] button[aria-pressed="true"]'),
    24,
    '--sniptale-color-accent'
  );
  const unavailable = page
    .locator('[data-ui="gallery.videoReview.trackHeader"] button.review-track-status:disabled')
    .first();
  if (await unavailable.count()) {
    await expect(unavailable).toHaveCSS('opacity', '0.55');
    await checkTrackIndicator(page, unavailable, 28, '--sniptale-color-text-muted');
  }
  const lock = page.locator('[data-review-header-track="source"] button[aria-pressed]');
  await lock.click();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await checkTrackIndicator(page, lock, 24, '--sniptale-color-accent');
  await lock.click();
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
  const filter = page
    .locator('[data-review-header-track="actions"]')
    .getByRole('button', { name: label('gallery.videoReview.historyAnimatedOnly'), exact: true });
  await filter.click();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await checkTrackIndicator(page, filter, 32, '--sniptale-color-accent');
  await page.screenshot({ path: info.outputPath('track-indicators.png'), fullPage: false });
  await filter.click();
  await expect(filter).toHaveAttribute('aria-pressed', 'false');
}

async function checkTrackIndicator(page: Page, button: Locator, size: number, colorToken: string) {
  await button.scrollIntoViewIfNeeded();
  await page.mouse.move(1, 1);
  await button.evaluate((node) => node.blur());
  const color = await button.evaluate((node, token) => {
    const reference = document.createElement('span');
    reference.style.color = `var(${token})`;
    node.append(reference);
    const value = getComputedStyle(reference).color;
    reference.remove();
    return value;
  }, colorToken);
  await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(button).toHaveCSS('color', color);
  await expect(button).toHaveCSS('border-top-width', '0px');
  await expect(button).toHaveCSS('width', `${size}px`);
  await expect(button).toHaveCSS('height', `${size}px`);
  await expect(button.locator('svg')).toHaveCSS('width', '14px');
  await expect(button.locator('svg')).toHaveCSS('height', '14px');
  const idle = await button.boundingBox();
  await button.hover();
  await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(button).toHaveCSS('border-top-width', '0px');
  expect(await button.boundingBox()).toEqual(idle);
  await page.mouse.move(1, 1);
}

async function checkInspectorSectionPresentation(page: Page, inspector: Locator, info: TestInfo) {
  const presentation = inspector.locator('[data-ui="gallery.videoReview.inspectorPresentation"]');
  const sections = inspector.locator('[data-ui="gallery.videoReview.inspectorSections"]').first();
  await sections.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await expect(sections).toHaveAttribute('data-presentation', 'all');
  const inset = await sections.evaluate((node) => {
    const heading = node.querySelector('.review-inspector-section > details > summary');
    if (!heading) throw new Error('First inspector section heading is missing');
    return heading.getBoundingClientRect().top - node.getBoundingClientRect().top;
  });
  expect(Math.abs(inset - 4)).toBeLessThanOrEqual(1);
  const boundaryGaps = await inspector.evaluate((node) => {
    const navigation = node.querySelector('.review-inspector-navigation');
    const headings = node.querySelectorAll('.review-inspector-section > details > summary');
    const first = headings[0];
    const next = headings[1];
    if (!navigation || !first || !next) throw new Error('Section boundaries are missing');
    const nextSection = next.closest('.review-inspector-section')!;
    return {
      first: first.getBoundingClientRect().top - navigation.getBoundingClientRect().bottom,
      next: next.getBoundingClientRect().top - nextSection.getBoundingClientRect().top,
    };
  });
  // One pixel accounts for the separator border. Compare visible boundaries, not wrappers.
  expect(Math.abs(boundaryGaps.first - boundaryGaps.next)).toBeLessThanOrEqual(1);
  await presentation.click();
  await expect(sections).toHaveAttribute('data-presentation', 'sections');
  const rail = sections.locator('nav');
  await rail.getByRole('button').last().click();
  await checkSelectedSectionColors(rail.locator('button[aria-pressed="true"]'));
  await rail.getByRole('button').last().press('Home');
  await expect(rail.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await checkSelectedSectionColors(rail.getByRole('button').first());
  await page.mouse.move(1, 1);
  await page.screenshot({ path: info.outputPath('inspector-section-rail.png'), fullPage: false });
  await presentation.click();
  await expect(sections).toHaveAttribute('data-presentation', 'all');
}

async function checkSelectedSectionColors(button: Locator) {
  const colors = await button.evaluate((node) => {
    const reference = document.createElement('span');
    reference.style.color = 'var(--sniptale-color-text-primary)';
    reference.style.backgroundColor = 'var(--sniptale-color-surface-hover)';
    node.append(reference);
    const expected = getComputedStyle(reference);
    const result = {
      expectedForeground: expected.color,
      expectedBackground: expected.backgroundColor,
    };
    reference.remove();
    return result;
  });
  await expect(button).toHaveCSS('color', colors.expectedForeground);
  await expect(button).toHaveCSS('background-color', colors.expectedBackground);
  await expect(button.locator('svg')).toHaveCSS('stroke', colors.expectedForeground);
}

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
  await checkCommandTypography(page, cancel);
  await checkCommandTypography(page, dialog.locator('[data-command-tone="danger"]'));
  await page.screenshot({ path: info.outputPath('reset-confirmation.png'), fullPage: false });
  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('Escape');
}

async function commandGeometry(button: Locator) {
  return button.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const text = document.createRange();
    text.selectNodeContents(
      node.querySelector('[data-review-toolbar-label]') ??
        node.querySelector('.sniptale-command-content') ??
        node
    );
    const caption = text.getBoundingClientRect();
    const icon = node.querySelector('svg.lucide')?.getBoundingClientRect();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      textX: caption.x,
      textY: caption.y,
      textWidth: caption.width,
      iconX: icon?.x ?? 0,
      iconY: icon?.y ?? 0,
      iconWidth: icon?.width ?? 0,
      iconHeight: icon?.height ?? 0,
    };
  });
}

async function checkCommandTypography(
  page: Page,
  button: Locator,
  selected: boolean | 'indicator' = false
) {
  const idleWeight = selected ? '500' : '400';
  const hoverWeight = selected ? '500' : '450';
  const idleStroke = selected ? '2px' : '1.75px';
  const hoverStroke = selected ? '2px' : '1.875px';
  await button.scrollIntoViewIfNeeded();
  await page.mouse.move(1, 1);
  await button.evaluate((node) => node.blur());
  await expect(button).toHaveCSS('font-weight', idleWeight);
  const caption = button.locator('.sniptale-command-content');
  await expect(caption).toHaveCSS('font-weight', idleWeight);
  for (const label of await caption.locator('span, strong, b').all())
    await expect(label).toHaveCSS('font-weight', idleWeight);
  const icon = button.locator('svg.lucide');
  if (await icon.count()) await expect(icon).toHaveCSS('stroke-width', idleStroke);
  if (selected === true) await checkSelectedSectionColors(button);
  if (selected === 'indicator') {
    await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(button).toHaveCSS('width', '24px');
    await expect(button).toHaveCSS('height', '24px');
    await expect(icon).toHaveCSS('width', '14px');
    await expect(icon).toHaveCSS('height', '14px');
  }
  const selectedFill = await button.evaluate((node) => getComputedStyle(node).backgroundColor);
  if (selected === true) expect(selectedFill).not.toBe('rgba(0, 0, 0, 0)');
  const idle = await commandGeometry(button);
  await button.hover();
  await expect(button).toHaveCSS('font-weight', hoverWeight);
  await expect(caption).toHaveCSS('font-weight', hoverWeight);
  for (const label of await caption.locator('span, strong, b').all())
    await expect(label).toHaveCSS('font-weight', hoverWeight);
  if (await icon.count()) await expect(icon).toHaveCSS('stroke-width', hoverStroke);
  if ((await button.getAttribute('aria-pressed')) !== null)
    await expect(button).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  if (selected) await expect(button).toHaveCSS('background-color', selectedFill);
  const hovered = await commandGeometry(button);
  // One CSS pixel allows rasterization rounding while retaining stable target/content placement.
  for (const key of Object.keys(idle) as Array<keyof typeof idle>)
    expect(Math.abs(hovered[key] - idle[key]), key).toBeLessThanOrEqual(1);
  await page.mouse.move(1, 1);
  await expect(button).toHaveCSS('font-weight', idleWeight);
  await button.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS('font-weight', hoverWeight);
  if (await icon.count()) await expect(icon).toHaveCSS('stroke-width', hoverStroke);
  await button.evaluate((node) => node.blur());
  await expect(button).toHaveCSS('font-weight', idleWeight);
  if (await icon.count()) await expect(icon).toHaveCSS('stroke-width', idleStroke);
}

async function checkDisabledCommandTypography(page: Page, button: Locator) {
  await expect(button).toBeDisabled();
  await page.mouse.move(1, 1);
  await expect(button).toHaveCSS('font-weight', '400');
  const icon = button.locator('svg.lucide');
  await expect(icon).toHaveCSS('stroke-width', '1.75px');
  const idle = await commandGeometry(button);
  await button.hover();
  await expect(button).toHaveCSS('font-weight', '400');
  await expect(icon).toHaveCSS('stroke-width', '1.75px');
  expect(await commandGeometry(button)).toEqual(idle);
  await page.mouse.move(1, 1);
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
    expect(geometry[index]!.top - geometry[index - 1]!.top).toBeCloseTo(44, 0);
    expect(geometry[index]!.left).toBeCloseTo(geometry[0]!.left, 0);
  }
  expect(geometry.map(({ font, weight }) => ({ font, weight }))).toEqual(
    Array.from({ length: 3 }, () => ({ font: '13px', weight: '400' }))
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
    const geometry = await scroll.evaluate((viewport) => {
      const viewportBox = viewport.getBoundingClientRect();
      const viewportStyle = getComputedStyle(viewport);
      const viewportLeft = viewportBox.left + Number.parseFloat(viewportStyle.borderLeftWidth);
      const viewportRight = viewportLeft + viewport.clientWidth;
      const rows = [...viewport.querySelectorAll<HTMLElement>('.sniptale-parameter-row')]
        .filter((row) => row.getBoundingClientRect().width > 0)
        .map((row) => {
          const rowBox = row.getBoundingClientRect();
          const steppers = [
            ...row.querySelectorAll<HTMLElement>(
              '[data-ui="shared.ui.compact-inspector.numeric-stepper"]'
            ),
          ];
          const stepperBounds = steppers.map((stepper) => {
            const box = stepper.getBoundingClientRect();
            return {
              left: box.left,
              right: box.right,
              width: box.width,
              overhang: box.right - rowBox.right,
              withinViewport: box.left >= viewportLeft - 1 && box.right <= viewportRight + 1,
            };
          });
          const originalDisplay = steppers.map((stepper) => ({
            value: stepper.style.getPropertyValue('display'),
            priority: stepper.style.getPropertyPriority('display'),
          }));
          // Absolute steppers may use the 8px gutter; other row content must fit unchanged.
          steppers.forEach((stepper) => stepper.style.setProperty('display', 'none', 'important'));
          const contentOverflow = row.scrollWidth - row.clientWidth;
          steppers.forEach((stepper, index) => {
            const display = originalDisplay[index]!;
            if (display.value)
              stepper.style.setProperty('display', display.value, display.priority);
            else stepper.style.removeProperty('display');
          });
          return {
            name: row.querySelector('.sniptale-parameter-name')?.textContent,
            left: rowBox.left,
            right: rowBox.right,
            totalOverflow: row.scrollWidth - row.clientWidth,
            contentOverflow,
            stepperBounds,
          };
        });
      return {
        viewportLeft,
        viewportRight,
        viewportOverflow: viewport.scrollWidth - viewport.clientWidth,
        rows,
      };
    });
    await info.attach(`inspector-${width}-overflow-geometry`, {
      body: JSON.stringify(geometry, null, 2),
      contentType: 'application/json',
    });
    expect(geometry.viewportOverflow).toBeLessThanOrEqual(1);
    for (const row of geometry.rows) {
      expect(row.contentOverflow, JSON.stringify(row)).toBeLessThanOrEqual(1);
      expect(row.totalOverflow, JSON.stringify(row)).toBeLessThanOrEqual(
        row.stepperBounds.length ? 9 : 1
      );
      for (const stepper of row.stepperBounds) {
        expect(stepper.width, JSON.stringify(row)).toBe(20);
        expect(stepper.overhang, JSON.stringify(row)).toBeLessThanOrEqual(9);
        expect(stepper.withinViewport, JSON.stringify(row)).toBe(true);
      }
    }
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
