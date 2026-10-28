import { writeFile } from 'node:fs/promises';
import type { BrowserContext, Locator, Page, TestInfo, ViewportSize } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { translate, type TranslationKey } from '../../../../apps/extension/src/platform/i18n';

type Composition = { locale: 'ru' | 'en'; theme: 'light' | 'dark'; viewport: ViewportSize };
const ui = (page: Page, id: string) => page.locator(`[data-ui="${id}"]`);
const tr = (composition: Composition, key: TranslationKey) => translate(key, composition.locale);
test.use({ actionTimeout: 10_000 });
test.setTimeout(90_000);

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

async function withinViewport(root: Locator) {
  await expect(root).toBeVisible();
  await root.evaluate(async (element) => {
    await Promise.allSettled(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished)
    );
  });
  const bounds = await root.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right - innerWidth,
      bottom: rect.bottom - innerHeight,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(-1);
  expect(bounds.top).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(1);
  expect(bounds.bottom).toBeLessThanOrEqual(1);
}

async function ordinaryName(name: Locator) {
  await expect(name).toHaveCSS('font-size', '13px');
  await expect(name).toHaveCSS('line-height', '18px');
  await expect.soft(name).toHaveCSS('font-weight', '400', { timeout: 500 });
  await expect(name).toHaveCSS('font-family', /Sniptale Interface/u);
}

async function textInsideTarget(button: Locator) {
  const overflow = await button.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let maximum = 0;
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const rect of range.getClientRects())
        maximum = Math.max(maximum, box.left - rect.left, rect.right - box.right);
    }
    return maximum;
  });
  expect(overflow, 'Visible caption remains inside its clickable target').toBeLessThanOrEqual(1);
}

async function activateHost(
  context: BrowserContext,
  extensionId: string,
  origin: string,
  composition: Composition
) {
  const popup = await context.newPage();
  await popup.goto(
    `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=interface-browser&view=interface`
  );
  await expect(popup.locator('#settings-interface-language')).toBeEnabled();
  await expect
    .poll(() =>
      popup.evaluate(
        async () =>
          typeof (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toBe('string');
  await popup.locator('#settings-interface-language').click();
  await popup
    .getByRole('option', {
      name: composition.locale === 'ru' ? /^(Russian|Русский)$/u : 'English',
      exact: true,
    })
    .click();
  await popup.evaluate(async ({ locale, theme }) => {
    await chrome.storage.local.set({
      'sniptale-locale-preference': locale,
      'sniptale-theme-preference': theme,
    });
  }, composition);
  await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
  const page = await context.newPage();
  await page.setViewportSize(composition.viewport);
  await page.goto(origin);
  const tabId = await popup.evaluate(async (hostOrigin) => {
    const tab = (await chrome.tabs.query({})).find(
      (candidate) => candidate.url === `${hostOrigin}/`
    );
    if (tab?.id === undefined) throw new Error('Host tab not found');
    return tab.id;
  }, origin);
  await popup.evaluate((hostOrigin) => {
    const grant = document.createElement('button');
    grant.textContent = 'Grant test origin';
    grant.onclick = async () => {
      grant.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${hostOrigin}/*`] })
      );
    };
    document.body.append(grant);
  }, origin);
  await popup.getByRole('button', { name: 'Grant test origin' }).click();
  await expect(popup.getByRole('button', { name: 'Grant test origin' })).toHaveAttribute(
    'data-granted',
    'true'
  );
  await page.reload();
  const registered = await popup.evaluate(
    async (targetTabId) =>
      chrome.runtime.sendMessage({
        type: 'PAGE_ACCESS',
        operation: 'register-granted-site',
        tabId: targetTabId,
        __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
      }),
    tabId
  );
  expect(registered).toMatchObject({ success: true, result: 'registered' });
  const enabled = await popup.evaluate(
    async (targetTabId) =>
      chrome.tabs.sendMessage(targetTabId, {
        type: 'ENABLE_SCREENSHOT_MODE',
        workingMode: 'design-review',
      }),
    tabId
  );
  expect(enabled).toMatchObject({ success: true });
  await page.bringToFront();
  await expect(page.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
  return { page, popup };
}

async function selectTarget(page: Page, id: string) {
  const target = page.locator(id);
  const rect = await target.boundingBox();
  if (!rect) throw new Error(`Host target missing: ${id}`);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await expect(ui(page, 'content.design-review.popover')).toBeVisible();
}

async function inspectModeParity(page: Page, info: TestInfo, suffix: string) {
  const observations = [];
  for (const mode of [
    'cursor',
    'drawing',
    'highlighter',
    'quick-edit',
    'design-review',
    'video-recording',
  ]) {
    await ui(page, 'content.toolbar.mode-selector-button').click();
    const menu = page.locator('.sniptale-content-menu-adopted.sniptale-toolbar-menu');
    await expect(menu).toBeVisible();
    await menu.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished)
      );
    });
    const menuMetrics = await menu.evaluate((element) => {
      const css = getComputedStyle(element);
      const title = element.querySelector('.sniptale-toolbar-menu-title');
      const rows = Array.from(element.querySelectorAll('.sniptale-toolbar-menu-item'));
      return {
        padding: css.padding,
        weight: css.fontWeight,
        gap: getComputedStyle(element.querySelector('.sniptale-toolbar-menu-list')!).gap,
        heading: title
          ? {
              size: getComputedStyle(title).fontSize,
              line: getComputedStyle(title).lineHeight,
              weight: getComputedStyle(title).fontWeight,
            }
          : null,
        rows: rows.map((row) => ({
          height: row.getBoundingClientRect().height,
          minimum: getComputedStyle(row).minHeight,
          padding: getComputedStyle(row).padding,
          size: getComputedStyle(row).fontSize,
          line: getComputedStyle(row).lineHeight,
          weight: getComputedStyle(row).fontWeight,
        })),
      };
    });
    await capture(page, info, `parity-${suffix}-${mode}-menu`);
    await ui(page, `content.toolbar.mode-option.${mode}`).click();
    await expect(menu).toHaveCount(0);
    const toolbar = ui(page, 'content.toolbar.root');
    await capture(page, info, `parity-${suffix}-${mode}-toolbar`);
    await withinViewport(toolbar);
    const buttons = await toolbar.locator('button.sniptale-btn').evaluateAll((elements) =>
      elements
        .filter((element) => element.getBoundingClientRect().width > 0)
        .map((element) => {
          const box = element.getBoundingClientRect();
          const icon = element.querySelector('svg');
          const glyph = icon?.getBoundingClientRect();
          return {
            id: element.getAttribute('data-ui'),
            name: element.getAttribute('aria-label'),
            classes: element.className,
            specialized: element.closest('.sniptale-drawing-options-popover') !== null,
            splitDirection: element.closest('.sniptale-split-action')
              ? getComputedStyle(element.closest('.sniptale-split-action')!).flexDirection
              : null,
            width: box.width,
            height: box.height,
            glyph: glyph ? { width: glyph.width, height: glyph.height } : null,
          };
        })
    );
    const targetSize = await toolbar.evaluate((element) =>
      Number.parseFloat(
        getComputedStyle(element).getPropertyValue('--sniptale-toolbar-button-size')
      )
    );
    observations.push({
      mode,
      targetSize,
      orientation: await toolbar.getAttribute('data-display-mode'),
      menu: menuMetrics,
      buttons,
    });
  }
  const metricsPath = info.outputPath(`native-six-mode-parity-${suffix}.json`);
  await writeFile(metricsPath, JSON.stringify(observations, null, 2));
  await info.attach(`native-six-mode-parity-${suffix}`, {
    path: metricsPath,
    contentType: 'application/json',
  });
  for (const observation of observations) {
    expect.soft(observation.menu.padding, `${observation.mode} menu shell inset`).toBe('5px');
    expect.soft(observation.menu.gap, `${observation.mode} menu row gap`).toBe('2px');
    expect.soft(observation.menu.weight).toBe('400');
    expect.soft(observation.menu.heading).toEqual({ size: '12px', line: '16px', weight: '500' });
    for (const row of observation.menu.rows) {
      expect.soft(row.minimum, `${observation.mode} menu row minimum`).toBe('32px');
      expect.soft(row.height).toBeGreaterThanOrEqual(31.9);
      expect.soft(row.padding).toBe('6px 8px');
      expect.soft([row.size, row.line]).toEqual(['13px', '18px']);
      expect.soft(row.weight, `${observation.mode} ordinary and selected options`).toBe('400');
    }
    for (const button of observation.buttons) {
      const label = `${suffix} ${observation.mode}: ${button.id ?? button.name}`;
      if (button.specialized) {
        expect.soft(button.width, label).toBeCloseTo(28, 0);
        expect.soft(button.height, label).toBeCloseTo(28, 0);
      } else if (button.classes.includes('sniptale-full-page-chevron')) {
        expect
          .soft([button.width, button.height], label)
          .toEqual(
            button.splitDirection === 'column'
              ? [observation.targetSize, 18]
              : [18, observation.targetSize]
          );
        expect.soft(button.glyph, label).toEqual({ width: 12, height: 12 });
      } else if (!button.classes.includes('sniptale-btn-outline')) {
        expect
          .soft([button.width, button.height], label)
          .toEqual([observation.targetSize, observation.targetSize]);
        if (
          button.glyph &&
          !/video-recording\.(start|pause|resume|stop|cancel)$/u.test(button.id ?? '')
        )
          expect.soft(button.glyph, label).toEqual({
            width: observation.targetSize === 24 ? 14 : observation.targetSize === 25 ? 15 : 16,
            height: observation.targetSize === 24 ? 14 : observation.targetSize === 25 ? 15 : 16,
          });
      }
    }
  }
  await ui(page, 'content.toolbar.mode-selector-button').click();
  await ui(page, 'content.toolbar.mode-option.design-review').click();
}

async function inspectDesignReview(page: Page, composition: Composition, info: TestInfo) {
  const target = page.locator('#review-target');
  const before = await target.evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      text: element.textContent,
      font: css.fontFamily,
      size: css.fontSize,
      line: css.lineHeight,
    };
  });
  await selectTarget(page, '#review-target');
  const popover = ui(page, 'content.design-review.popover');
  await popover
    .getByRole('button', { name: tr(composition, 'content.designReview.editProperties') })
    .click();
  const settings = ui(page, 'content.design-review.settings');
  await expect(settings).toBeVisible();
  for (const key of [
    'content.designReview.sectionText',
    'content.designReview.sectionFrame',
    'content.designReview.sectionAppearance',
    'content.designReview.sectionBorder',
  ] as const) {
    await settings
      .getByRole('navigation')
      .getByRole('button', { name: tr(composition, key), exact: true })
      .click();
    await withinViewport(popover);
    if (key === 'content.designReview.sectionBorder') {
      const label = tr(composition, 'content.designReview.borderWidth');
      await ordinaryName(
        settings
          .locator('[data-side-field-label]')
          .filter({ has: page.getByText(label, { exact: true }) })
          .getByText(label, { exact: true })
      );
    } else await ordinaryName(settings.locator('.sniptale-parameter-name').first());
    await capture(page, info, `review-${key.split('.').at(-1)}`);
  }
  const widthLabel = tr(composition, 'content.designReview.width');
  await settings
    .getByRole('navigation')
    .getByRole('button', {
      name: tr(composition, 'content.designReview.sectionFrame'),
      exact: true,
    })
    .click();
  const width = settings.getByRole('textbox', { name: widthLabel, exact: true });
  await expect.soft(width).toHaveCSS('font-weight', '400', { timeout: 500 });
  await expect
    .soft(width.locator('..').locator(':scope > span[id]'))
    .toHaveCSS('font-weight', '400', { timeout: 500 });
  await width.fill('210');
  await expect(target).toHaveCSS('width', '210px');
  await settings
    .getByRole('button', {
      name: `${widthLabel}: ${tr(composition, 'content.designReview.resetProperty')}`,
      exact: true,
    })
    .click();
  await expect(target).toHaveCSS('width', '200px');
  const comment = popover.getByRole('textbox', {
    name: tr(composition, 'content.designReview.commentLabel'),
  });
  await comment.fill(
    'Review composition: a long synthetic comment that must remain readable in the collection preview.'
  );
  await comment.press('Enter');
  await expect(popover).toHaveCount(0);
  await selectTarget(page, '#review-image');
  await popover
    .getByRole('button', { name: tr(composition, 'content.designReview.editProperties') })
    .click();
  await expect(
    settings.getByRole('navigation').getByRole('button', {
      name: tr(composition, 'content.designReview.sectionImage'),
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'true');
  await capture(page, info, 'review-image');
  await comment.fill('Image composition feedback');
  await comment.press('Enter');
  await ui(page, 'content.toolbar.design-review-panel-button').click();
  const panel = ui(page, 'content.design-review.feedback-panel');
  await withinViewport(panel);
  const search = panel.getByRole('textbox', {
    name: tr(composition, 'content.designReview.panelSearch'),
  });
  await search.fill('no matching synthetic feedback');
  await expect(ui(page, 'content.design-review.feedback-item')).toHaveCount(0);
  await search.fill('composition');
  await expect(ui(page, 'content.design-review.feedback-item')).toHaveCount(2);
  const clear = panel.getByRole('button', {
    name: tr(composition, 'shared.ui.clearField').replace(
      '{field}',
      tr(composition, 'content.designReview.panelSearch')
    ),
    exact: true,
  });
  const clearBox = (await clear.boundingBox())!;
  await page.mouse.move(clearBox.x + clearBox.width / 2, clearBox.y + clearBox.height / 2);
  await page.mouse.down();
  await expect(search).toHaveValue('composition');
  await expect(clear).toHaveAttribute('data-pressing', 'true');
  await page.mouse.up();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(search).toHaveCSS('height', '32px');
  await expect(search).toHaveCSS('border-radius', '4px');
  const filter = panel.getByRole('button', {
    name: tr(composition, 'content.designReview.panelFilter'),
  });
  await filter.click();
  const menu = ui(page, 'content.design-review.feedback-filter-menu');
  await withinViewport(menu);
  await menu.getByRole('menuitemradio').nth(1).click();
  await filter.click();
  await menu.getByRole('menuitemradio').first().click();
  const item = ui(page, 'content.design-review.feedback-item').first();
  await item.hover();
  const preview = ui(page, 'content.design-review.feedback-preview');
  await withinViewport(preview);
  await expect(preview).toHaveAttribute('data-theme', composition.theme);
  await expect(preview).toHaveCSS('font-family', /Sniptale Interface/u);
  await expect(preview).toHaveCSS('border-radius', '4px');
  await expect(preview).toContainText('Review composition:');
  await capture(page, info, 'review-feedback-preview');
  await item.click();
  await expect(popover).toBeVisible();
  await page.keyboard.press('Escape');
  await panel
    .getByRole('button', { name: tr(composition, 'content.designReview.panelClose') })
    .click();
  expect(
    await target.evaluate((element) => {
      const css = getComputedStyle(element);
      return {
        text: element.textContent,
        font: css.fontFamily,
        size: css.fontSize,
        line: css.lineHeight,
      };
    })
  ).toEqual(before);
}

async function blurSelectionDrawing(checkbox: Locator) {
  const drawing = await checkbox.evaluate((node) => {
    const target = node.getBoundingClientRect();
    const disc = getComputedStyle(node, '::before');
    return {
      appearance: getComputedStyle(node).appearance,
      target: [target.width, target.height],
      disc: [disc.width, disc.height, disc.borderRadius],
    };
  });
  expect.soft(drawing.appearance).toBe('none');
  expect.soft(drawing.target).toEqual([28, 28]);
  expect.soft(drawing.disc).toEqual(['18px', '18px', '50%']);
}

async function opaqueBlurSurface(modal: Locator) {
  const alpha = await modal.evaluate((node) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = getComputedStyle(node).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data[3];
  });
  expect.soft(alpha, 'Blur settings hide underlying page content').toBe(255);
}

async function inspectAutoBlur(page: Page, composition: Composition, info: TestInfo) {
  await ui(page, 'content.toolbar.mode-selector-button').click();
  await ui(page, 'content.toolbar.mode-option.highlighter').click();
  await ui(page, 'content.toolbar.future-frame-style.menu').click();
  const appearanceSurface = page.locator('.sniptale-content-appearance-surface');
  await expect(appearanceSurface).toBeVisible();
  await capture(page, info, 'parity-appearance-header');
  const appearanceMetrics = await appearanceSurface.evaluate((element) => {
    const title = getComputedStyle(element.querySelector('.sniptale-toolbar-menu-title')!);
    return {
      size: title.fontSize,
      line: title.lineHeight,
      weight: title.fontWeight,
      transform: title.textTransform,
      tracking: title.letterSpacing,
      radius: getComputedStyle(element).borderRadius,
    };
  });
  const appearancePath = info.outputPath('native-appearance-header.json');
  await writeFile(appearancePath, JSON.stringify(appearanceMetrics, null, 2));
  await info.attach('native-appearance-header', {
    path: appearancePath,
    contentType: 'application/json',
  });
  expect.soft(appearanceMetrics).toEqual({
    size: '12px',
    line: '16px',
    weight: '500',
    transform: 'none',
    tracking: 'normal',
    radius: '4px',
  });
  await page.keyboard.press('Escape');
  await ui(page, 'content.toolbar.auto-blur-button').click();
  const menu = ui(page, 'content.toolbar.auto-blur-menu').locator('.sniptale-toolbar-menu');
  await capture(page, info, 'parity-auto-blur-menu');
  await menu.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished)
    );
  });
  const metrics = await menu.evaluate((element) => ({
    padding: getComputedStyle(element).padding,
    heading: getComputedStyle(element.querySelector('.sniptale-toolbar-menu-title')!).font,
    rows: Array.from(element.querySelectorAll('.sniptale-toolbar-menu-item')).map((row) => ({
      height: row.getBoundingClientRect().height,
      minimum: getComputedStyle(row).minHeight,
      padding: getComputedStyle(row).padding,
      glyph: row.querySelector('svg')?.getBoundingClientRect().width,
    })),
  }));
  const metricsPath = info.outputPath('native-auto-blur-parity.json');
  await writeFile(metricsPath, JSON.stringify(metrics, null, 2));
  await info.attach('native-auto-blur-parity', {
    path: metricsPath,
    contentType: 'application/json',
  });
  expect.soft(metrics.padding).toBe('5px');
  await expect.soft(menu.locator('.sniptale-toolbar-menu-title')).toHaveCSS('font-size', '12px');
  await expect.soft(menu.locator('.sniptale-toolbar-menu-title')).toHaveCSS('line-height', '16px');
  for (const row of metrics.rows) {
    expect.soft(row.minimum).toBe('32px');
    expect.soft(row.padding).toBe('6px 8px');
    expect.soft(row.glyph).toBeCloseTo(16, 0);
  }
  await ui(page, 'content.toolbar.auto-blur-configure').click();
  const modal = page.locator('.sniptale-auto-blur-modal');
  await expect(modal.getByRole('treegrid')).toBeVisible();
  await withinViewport(modal);
  const first = modal.getByRole('checkbox', { name: 'first@example.org', exact: true });
  await expect(first).toBeVisible();
  await opaqueBlurSurface(modal);
  await blurSelectionDrawing(first);
  await expect(modal).toHaveCSS('width', '780px');
  await expect(modal).toHaveCSS('border-radius', '8px');
  for (const value of ['first@example.org', 'second@example.org', 'third@example.org'])
    await modal.getByRole('checkbox', { name: value, exact: true }).uncheck();
  await first.focus();
  await first.press('Space');
  await expect(first).toBeChecked();
  await expect(first).toBeFocused();
  const checkedMark = await first.evaluate((node) => getComputedStyle(node, '::after').opacity);
  expect.soft(checkedMark).toBe('1');
  await first.press('Space');
  await expect(first).not.toBeChecked();
  expect.soft(await first.evaluate((node) => getComputedStyle(node, '::after').opacity)).toBe('0');
  await first.press('Space');
  await expect(first).toBeChecked();
  await first.click({ position: { x: 2, y: 14 } });
  await expect(first).not.toBeChecked();
  await first.click({ position: { x: 2, y: 14 } });
  await expect(first).toBeChecked();
  const category = modal
    .getByRole('treegrid')
    .getByRole('row')
    .filter({
      has: page.getByRole('checkbox', {
        name: tr(composition, 'content.autoBlur.categoryEmail'),
        exact: true,
      }),
    });
  await expect(category.getByRole('checkbox')).toHaveJSProperty('indeterminate', true);
  await blurSelectionDrawing(category.getByRole('checkbox'));
  const mixedMark = await category.getByRole('checkbox').evaluate((node) => {
    const mark = getComputedStyle(node, '::after');
    return [mark.width, mark.height, mark.opacity];
  });
  expect.soft(mixedMark).toEqual(['8px', '2px', '1']);
  await capture(page, info, 'auto-blur-mixed-selection');
  expect((await category.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  const child = first.locator('..');
  expect((await child.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  await modal
    .getByRole('button', {
      name: tr(composition, 'content.autoBlur.collapseAllButton'),
      exact: true,
    })
    .click();
  await expect(first).toHaveCount(0);
  await modal
    .getByRole('button', { name: tr(composition, 'content.autoBlur.expandAllButton'), exact: true })
    .click();
  await expect(first).toBeChecked();
  const appearance = modal.locator('.sniptale-auto-blur-appearance');
  const strength = appearance.getByRole('textbox', {
    name: tr(composition, 'content.autoBlur.blurStrength'),
    exact: true,
  });
  await strength.scrollIntoViewIfNeeded();
  await strength.fill('7');
  await strength.press('Enter');
  await expect(strength).toHaveValue('7');
  await ordinaryName(appearance.locator('.sniptale-parameter-name').first());
  const templateRow = appearance.locator('.sniptale-parameter-row').filter({
    has: page.locator('.sniptale-parameter-name', {
      hasText: tr(composition, 'content.autoBlur.frameTemplate'),
    }),
  });
  const template = templateRow.getByRole('button', {
    name: tr(composition, 'content.autoBlur.frameTemplate'),
    exact: true,
  });
  await expect(template).toBeEnabled();
  await template.scrollIntoViewIfNeeded();
  await template.click();
  const choices = page.getByRole('listbox');
  await withinViewport(choices);
  await expect(choices).toHaveCSS('font-family', /Sniptale Interface/u);
  await page.keyboard.press('Escape');
  await expect(template).toBeFocused();
  await capture(page, info, 'auto-blur-review');
  const cancel = modal
    .getByRole('button', { name: tr(composition, 'content.autoBlur.cancel'), exact: true })
    .last();
  await cancel.scrollIntoViewIfNeeded();
  await cancel.click();
  await expect(modal).toHaveCount(0);
  await ui(page, 'content.toolbar.auto-blur-button').click();
  await ui(page, 'content.toolbar.auto-blur-toggle').click();
  await expect(modal).toBeVisible();
  await withinViewport(modal);
  await expect(modal).toHaveCSS('width', '450px');
  await expect(modal.getByRole('treegrid')).toHaveCount(0);
  await expect(modal).not.toContainText('first@example.org');
  const categories = ui(page, 'content.auto-blur.auto-apply-categories');
  await expect(categories.getByRole('checkbox')).toHaveCount(6);
  const checkbox = categories.getByRole('checkbox').first();
  await opaqueBlurSurface(modal);
  await blurSelectionDrawing(checkbox);
  const checked = await checkbox.isChecked();
  await checkbox.click();
  expect(await checkbox.isChecked()).toBe(!checked);
  await ordinaryName(categories.locator('.sniptale-parameter-name').first());
  const apply = modal.getByRole('button', {
    name: tr(composition, 'content.autoBlur.apply'),
    exact: true,
  });
  await expect(apply).toBeEnabled();
  await capture(page, info, 'auto-blur-configuration');
  await cancel.scrollIntoViewIfNeeded();
  await cancel.click();
  await expect(modal).toHaveCount(0);
}

async function inspectDrawing(page: Page, popup: Page, composition: Composition, info: TestInfo) {
  await ui(page, 'content.toolbar.mode-selector-button').click();
  await ui(page, 'content.toolbar.mode-option.drawing').click();
  for (const tool of ['pencil', 'marker', 'shape', 'arrow', 'text', 'blur']) {
    const toolTrigger = ui(page, `content.toolbar.drawing.${tool}`);
    if ((await toolTrigger.getAttribute('aria-expanded')) !== 'true') await toolTrigger.click();
    await expect(toolTrigger).toHaveAttribute('aria-pressed', 'true');
    await expect(toolTrigger).toHaveAttribute('aria-expanded', 'true');
    const panel = ui(page, `content.toolbar.drawing-options.${tool}`);
    await withinViewport(panel);
    const preview = panel.locator('button.sniptale-btn:has(svg)').first();
    if (await preview.count()) {
      expect((await preview.boundingBox())!.width).toBeCloseTo(28, 0);
      expect((await preview.boundingBox())!.height).toBeCloseTo(28, 0);
      await expect(preview.locator('svg').first()).toHaveCSS('width', '18px');
      await expect(preview.locator('svg').first()).toHaveCSS('height', '18px');
    }
    if (tool === 'blur')
      await expect(panel.locator('[data-ui="shared.ui.color-selector"]')).toHaveCount(0);
    if (tool === 'pencil') {
      const width = panel.locator('[data-ui="content.toolbar.drawing-options.pencil.width-16"]');
      await width.click();
      await expect(width).toHaveAttribute('aria-pressed', 'true');
      const trigger = panel.locator('[data-ui="shared.ui.color-selector.picker-trigger"]');
      const accepted = await trigger.getAttribute('style');
      await trigger.click();
      const picker = ui(page, 'shared.ui.color-selector.picker-layer');
      await withinViewport(picker);
      await expect(picker).toHaveCSS('font-family', /Sniptale Interface/u);
      await page.getByRole('button', { name: /^(Cancel|Отмена)$/u }).click();
      await expect(picker).toHaveCount(0);
      expect(await trigger.getAttribute('style')).toBe(accepted);
    }
    if (tool === 'text') {
      const size = panel.locator('[data-ui="content.toolbar.drawing-options.text.size-36"]');
      await size.click();
      await expect(size).toHaveAttribute('aria-pressed', 'true');
      await textInsideTarget(size);
    }
    if (tool === 'pencil' || tool === 'text') {
      await expect
        .poll(() =>
          popup.evaluate(async () => {
            const stored = await chrome.storage.local.get('sniptale_drawing_tool_preferences');
            return stored['sniptale_drawing_tool_preferences'];
          })
        )
        .toMatchObject({
          schemaVersion: 1,
          defaults: tool === 'pencil' ? { pencil: { width: 16 } } : { text: { fontSize: 36 } },
        });
      await expect(
        page.getByRole('alert').filter({
          hasText: tr(composition, 'content.toolbar.drawingPreferencesSaveError'),
        })
      ).toHaveCount(0);
      await capture(page, info, `drawing-${tool}`);
    }
  }
  await page.keyboard.press('Escape');
}

const compositions: Composition[] = [
  { locale: 'ru', theme: 'light', viewport: { width: 1280, height: 560 } },
  { locale: 'en', theme: 'dark', viewport: { width: 1280, height: 560 } },
  { locale: 'en', theme: 'light', viewport: { width: 1920, height: 900 } },
  { locale: 'ru', theme: 'dark', viewport: { width: 1920, height: 900 } },
];
for (const width of [1280, 1920]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`drawing picker shadow styles ${width} ${theme}`, async ({
      context,
      extensionId,
    }, info) => {
      const origin = 'https://sniptale-picker-shadow.test';
      const composition: Composition = {
        locale: 'ru',
        theme,
        viewport: { width, height: width === 1280 ? 560 : 900 },
      };
      await context.route(`${origin}/**`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><body><p>Drawing picker style boundary</p></body></html>',
        })
      );
      const { page, popup } = await activateHost(context, extensionId, origin, composition);
      try {
        await ui(page, 'content.toolbar.mode-selector-button').click();
        await ui(page, 'content.toolbar.mode-option.drawing').click();
        const pencil = ui(page, 'content.toolbar.drawing.pencil');
        if ((await pencil.getAttribute('aria-expanded')) !== 'true') await pencil.click();
        await ui(page, 'content.toolbar.drawing-options.pencil')
          .locator('[data-ui="shared.ui.color-selector.picker-trigger"]')
          .click();
        const picker = ui(page, 'shared.ui.color-selector.picker');
        await expect(picker).toBeVisible();
        await expect(picker.locator('.sniptale-color-plane-ring')).toHaveCSS('width', '18px');
        await expect(picker.locator('.sniptale-color-plane-ring')).toHaveCSS(
          'border-top-width',
          '2px'
        );
        await expect(picker.locator('.sniptale-color-plane-ring')).toHaveCSS(
          'border-top-color',
          'rgb(255, 255, 255)'
        );
        await expect(picker.locator('.sniptale-color-plane-ring')).toHaveCSS(
          'box-shadow',
          'rgba(0, 0, 0, 0.4) 0px 0px 1px 1px'
        );
        const range = picker.locator('.sniptale-picker-range').first();
        await expect(range).toHaveCSS('appearance', 'none');
        await expect(range).toHaveCSS('height', '32px');
        const alpha = picker.locator(
          '[data-ui="shared.ui.color-selector.opacity"] .sniptale-picker-number'
        );
        await expect(alpha).toHaveCSS('display', 'flex');
        await expect(alpha).toHaveCSS('height', '32px');
        const checker = picker.locator('.sniptale-picker-checker').first();
        await expect(checker).toHaveCSS('background-image', /conic-gradient/);
        for (const mode of ['compact', 'full']) {
          const toggle = picker.getByRole('button', {
            name: mode === 'compact' ? 'Компактный режим' : 'Полный режим',
            exact: true,
          });
          if (await toggle.count()) await toggle.click();
          await withinViewport(ui(page, 'shared.ui.color-selector.picker-layer'));
          await alpha.hover();
          const steppers = alpha.locator('.sniptale-picker-steppers');
          await expect(steppers).toHaveCSS('opacity', '1');
          const bounds = (await alpha.boundingBox())!;
          for (const button of await steppers.locator('button').all()) {
            const box = (await button.boundingBox())!;
            expect(box.width).toBeCloseTo(24, 0);
            expect(box.height).toBeCloseTo(16, 0);
            expect(box.y).toBeGreaterThanOrEqual(bounds.y - 1);
            expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
          }
          await capture(page, info, `drawing-picker-${mode}`);
        }
        await picker.getByRole('button', { name: 'Отмена', exact: true }).click();
        await expect(picker).toHaveCount(0);
      } finally {
        await page.close();
        await popup.close();
        await context.unroute(`${origin}/**`);
      }
    });
  }
}

for (const composition of compositions) {
  test(`native content controls ${composition.locale} ${composition.theme} ${composition.viewport.width}`, async ({
    context,
    extensionId,
  }, info) => {
    const origin = 'https://sniptale-content-controls.test';
    const imageSource = [
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='60'%3E",
      "%3Crect width='100' height='60' fill='%239e795d'/%3E%3C/svg%3E",
    ].join('');
    await context.route(`${origin}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html>
      <html><head><meta charset="utf-8"><style>
      body{margin:0;background:#f0e9df;color:#17293d;font:18px Georgia,serif}
      #review-target{position:absolute;left:220px;top:180px;width:200px;height:48px;font:18px Georgia,serif}
      #review-image{position:absolute;left:540px;top:180px;width:100px;height:60px}
      #synthetic-values{position:absolute;left:80px;top:380px;font:16px Georgia,serif}
      </style></head><body><button id="review-target">Authored host target</button>
      <img id="review-image" alt="Synthetic example" src="${imageSource}">
      <div id="synthetic-values"><div>first@example.org</div><div>second@example.org</div>
      <div>third@example.org</div></div></body></html>`,
      })
    );
    const { page, popup } = await activateHost(context, extensionId, origin, composition);
    try {
      expect(await page.evaluate(() => isSecureContext)).toBe(true);
      expect(await page.evaluate(() => typeof navigator.locks?.request)).toBe('function');
      await inspectModeParity(page, info, 'primary');
      await page.setViewportSize({ width: 960, height: 560 });
      await ui(page, 'content.toolbar.settings-button').click();
      const free = page.getByRole('button', {
        name: /Free toolbar placement|Свободное размещение панели/u,
      });
      if (
        !(await free.evaluate((node) => node.classList.contains('sniptale-popover-item-selected')))
      )
        await free.click();
      await page.getByRole('button', { name: /Vertical view|Вертикальный вид/u }).click();
      await inspectModeParity(page, info, 'vertical-960');
      await expect
        .poll(async () => (await ui(page, 'content.toolbar.root').boundingBox())?.y ?? -Infinity)
        .toBeGreaterThanOrEqual(-1);
      await withinViewport(ui(page, 'content.toolbar.root'));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await ui(page, 'content.toolbar.settings-button').click();
      await page.getByRole('button', { name: /Horizontal view|Горизонтальный вид/u }).click();
      await page.setViewportSize(composition.viewport);
      await inspectDesignReview(page, composition, info);
      await inspectAutoBlur(page, composition, info);
      await inspectDrawing(page, popup, composition, info);
    } catch (error) {
      await capture(page, info, 'failure-ui').catch(() => undefined);
      throw error;
    } finally {
      await page.close();
      await popup.close();
      await context.unroute(`${origin}/**`);
    }
  });
}

for (const width of [1280, 1920]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`video feedback toolbar ${width} ${theme}`, async ({ context, extensionId }, info) => {
      const origin = 'https://sniptale-toolbar-feedback.test';
      const composition: Composition = {
        locale: 'ru',
        theme,
        viewport: { width, height: width === 1280 ? 560 : 900 },
      };
      await context.route(`${origin}/**`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body:
            '<!doctype html><html><body style="margin:0;background:#808080">' +
            '<div style="font:32px sans-serif;line-height:40px">' +
            'HOST BACKDROP '.repeat(200) +
            '</div></body></html>',
        })
      );
      const { page, popup } = await activateHost(context, extensionId, origin, composition);
      try {
        const toolbar = ui(page, 'content.toolbar.root');
        const trigger = ui(page, 'content.toolbar.mode-selector-button');
        await ui(page, 'content.toolbar.settings-button').click();
        const initialFreePlacement = page.getByRole('button', {
          name: /Free toolbar placement|Свободное размещение панели/u,
        });
        if (
          await initialFreePlacement.evaluate((node) =>
            node.classList.contains('sniptale-popover-item-selected')
          )
        )
          await initialFreePlacement.click();
        const compactMenuView = page.getByRole('button', {
          name: tr(composition, 'content.toolbar.compactMenus'),
          exact: false,
        });
        if (
          !(await compactMenuView.evaluate((node) =>
            node.classList.contains('sniptale-popover-item-selected')
          ))
        )
          await compactMenuView.click();
        await page.keyboard.press('Escape');
        await trigger.click();
        const menu = page.locator('.sniptale-content-menu-adopted.sniptale-toolbar-menu');
        await expect(menu).toHaveClass(/sniptale-toolbar-menu--compact/u);
        await expect(menu).toBeVisible();
        const appearance = await menu.evaluate((element) => {
          const surface = element as HTMLElement;
          const previousAnimation = surface.style.animation;
          surface.style.animation = 'none';
          void surface.offsetWidth;
          surface.style.animation = previousAnimation;
          const animation = element.getAnimations()[0];
          const positions: number[] = [];
          if (animation) {
            animation.pause();
            for (const time of [0, 100, 200]) {
              animation.currentTime = time;
              positions.push(
                element.querySelector('.sniptale-toolbar-menu-title')!.getBoundingClientRect().x
              );
            }
            animation.finish();
          }
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d')!;
          context.fillStyle = getComputedStyle(element).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          return {
            alpha: context.getImageData(0, 0, 1, 1).data[3],
            drift: positions.length ? Math.max(...positions) - Math.min(...positions) : 0,
            weights: Array.from(element.querySelectorAll('.sniptale-toolbar-menu-item')).map(
              (row) => getComputedStyle(row).fontWeight
            ),
            strokes: Array.from(
              element.querySelectorAll('.sniptale-toolbar-menu-item svg.lucide')
            ).map((icon) => getComputedStyle(icon).strokeWidth),
          };
        });
        expect.soft(appearance.alpha, 'Page content cannot show through the menu').toBe(255);
        expect
          .soft(appearance.drift, 'Menu text keeps its horizontal position while opening')
          .toBeLessThanOrEqual(0.5);
        expect.soft(appearance.weights.every((weight) => weight === '400')).toBe(true);
        expect
          .soft(appearance.strokes.every((stroke) => Number.parseFloat(stroke) === 1.75))
          .toBe(true);
        await capture(page, info, 'feedback-menu');
        await page.keyboard.press('Escape');
        await ui(page, 'content.toolbar.capture-full-settings-button').click();
        const fullPageMenu = ui(page, 'content.toolbar.full-page-menu').locator(
          '.sniptale-toolbar-menu'
        );
        await expect(fullPageMenu).toBeVisible();
        await fullPageMenu.locator('[data-ui="content.toolbar.full-capture-parameters"]').click();
        const retainedMenu = await fullPageMenu.elementHandle();
        for (const mode of ['hide', 'repeat', 'once']) {
          const option = ui(page, `content.toolbar.full-page-floating.${mode}`);
          await option.click();
          await expect(option).toBeEnabled();
          await expect(option).toHaveClass(/sniptale-popover-item-selected/u);
          expect(await retainedMenu!.evaluate((element) => element.isConnected)).toBe(true);
          await expect(fullPageMenu).toHaveCount(1);
        }
        await capture(page, info, 'feedback-full-page-preferences');
        await page.keyboard.press('Escape');
        for (const size of [24, 32]) {
          const overlap = await toolbar.evaluate((element, buttonSize) => {
            const previous = element.getAttribute('style');
            (element as HTMLElement).style.setProperty(
              '--sniptale-toolbar-button-size',
              `${buttonSize}px`
            );
            const intersections = Array.from(
              element.querySelectorAll<HTMLElement>('[data-menu-indicator="true"]')
            ).map((button) => {
              const box = button.getBoundingClientRect();
              const icon = button.querySelector('svg')?.getBoundingClientRect();
              if (!icon) return 0;
              const css = getComputedStyle(button, '::before');
              const triangleWidth =
                parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth);
              const triangleHeight =
                parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
              const right =
                box.right -
                parseFloat(css.right) -
                parseFloat(getComputedStyle(button).borderRightWidth);
              const explicitTop = parseFloat(css.top);
              const bottom = Number.isFinite(explicitTop)
                ? box.top +
                  parseFloat(getComputedStyle(button).borderTopWidth) +
                  explicitTop +
                  triangleHeight
                : box.bottom -
                  parseFloat(css.bottom) -
                  parseFloat(getComputedStyle(button).borderBottomWidth);
              return (
                Math.max(
                  0,
                  Math.min(right, icon.right) - Math.max(right - triangleWidth, icon.left)
                ) *
                Math.max(
                  0,
                  Math.min(bottom, icon.bottom) - Math.max(bottom - triangleHeight, icon.top)
                )
              );
            });
            if (previous === null) element.removeAttribute('style');
            else element.setAttribute('style', previous);
            return Math.max(0, ...intersections);
          }, size);
          expect.soft(overlap, `Menu indicators clear icons at ${size}px targets`).toBe(0);
        }
        await capture(page, info, 'feedback-fitted-indicators');
        const handle = ui(page, 'shared.ui.content-toolbar-drag-handle');
        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(width / 2, 90, { steps: 5 });
        const guides = ui(page, 'content.toolbar.dock-guides');
        await expect(guides).toBeVisible();
        const guideAppearance = await ui(page, 'content.toolbar.dock-zone.left').evaluate(
          (element) => ({
            opacity: getComputedStyle(element).opacity,
            border: getComputedStyle(element).borderLeftColor,
            outline: getComputedStyle(element).outlineWidth,
          })
        );
        expect
          .soft(guideAppearance.opacity, 'Guide borders are not faded with their fill')
          .toBe('1');
        expect
          .soft(
            parseFloat(guideAppearance.outline),
            'A contrasting outer boundary survives gray backdrops'
          )
          .toBeGreaterThanOrEqual(1);
        await capture(page, info, 'feedback-docking-guides');
        await page.mouse.move(width / 2, 20, { steps: 4 });
        await expect(ui(page, 'content.toolbar.dock-zone.top')).toHaveAttribute(
          'data-active',
          'true'
        );
        await capture(page, info, 'feedback-docking-active');
        await page.mouse.up();
        await expect(guides).toHaveCount(0);
        await ui(page, 'content.toolbar.settings-button').click();
        const free = page.getByRole('button', {
          name: /Free toolbar placement|Свободное размещение панели/u,
        });
        if (
          !(await free.evaluate((node) =>
            node.classList.contains('sniptale-popover-item-selected')
          ))
        )
          await free.click();
        await page.getByRole('button', { name: /Vertical view|Вертикальный вид/u }).click();
        const direction = await trigger.evaluate((element) => {
          const css = getComputedStyle(element, '::before');
          return {
            top: parseFloat(css.borderTopWidth),
            right: parseFloat(css.borderRightWidth),
            left: parseFloat(css.borderLeftWidth),
            bottom: parseFloat(css.borderBottomWidth),
          };
        });
        expect
          .soft(direction.left, 'Vertical disclosure points toward the side menu')
          .toBeGreaterThan(direction.top);
        expect.soft(direction.left).toBeGreaterThan(direction.bottom);
        await trigger.click();
        await capture(page, info, 'feedback-vertical-menu');
        await page.keyboard.press('Escape');
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(menu).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        await trigger.click();
        await ui(page, 'content.toolbar.mode-option.drawing').click();
        await ui(page, 'content.toolbar.drawing.shape').click();
        const drawingCanvas = page.locator(
          '[data-ui="content.drawing.surface"] canvas.sniptale-drawing-canvas[tabindex="0"]'
        );
        await expect(drawingCanvas).toBeVisible();
        const drawingStart = { x: width - 400, y: 280 };
        expect(
          await drawingCanvas.evaluate((node, point) => {
            const root = node.getRootNode();
            return (
              (root instanceof ShadowRoot
                ? root.elementFromPoint(point.x, point.y)
                : node.ownerDocument.elementFromPoint(point.x, point.y)) === node
            );
          }, drawingStart)
        ).toBe(true);
        await page.mouse.move(drawingStart.x, drawingStart.y);
        await page.mouse.down();
        await page.mouse.move(drawingStart.x + 170, 400, { steps: 8 });
        await page.mouse.up();
        await ui(page, 'content.toolbar.drawing.select').click();
        await page.mouse.click(drawingStart.x + 50, 300);
        const deleteSelection = ui(page, 'drawing.selection.actions.delete');
        await expect(deleteSelection).toBeEnabled();
        await deleteSelection.hover();
        await expect
          .soft(deleteSelection)
          .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)', { timeout: 500 });
        await expect
          .soft(deleteSelection)
          .toHaveCSS('border-color', 'rgba(0, 0, 0, 0)', { timeout: 500 });
        await expect.soft(deleteSelection).toHaveCSS('box-shadow', 'none', { timeout: 500 });
        await capture(page, info, 'feedback-drawing-delete-hover');
        await deleteSelection.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(deleteSelection).toBeFocused();
        await expect(deleteSelection).toHaveCSS('outline-style', 'solid');
        await deleteSelection.click();
        await expect(deleteSelection).toHaveCount(0);
        if (width === 1280 && theme === 'light') {
          await page.setViewportSize({ width: 960, height: 560 });
          await withinViewport(toolbar);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
          ).toBe(true);
          await trigger.click();
          await withinViewport(menu);
          await capture(page, info, 'feedback-below-minimum-menu');
          await page.keyboard.press('Escape');
        }
      } finally {
        await page.close();
        await popup.close();
        await context.unroute(`${origin}/**`);
      }
    });
  }
}

for (const width of [1280, 1920]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`toolbar followup frame spacing and neutral docking ${width} ${theme}`, async ({
      context,
      extensionId,
    }, info) => {
      const origin = 'https://sniptale-toolbar-followup.test';
      const composition: Composition = {
        locale: 'ru',
        theme,
        viewport: { width, height: width === 1280 ? 560 : 900 },
      };
      await context.route(`${origin}/**`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body:
            '<!doctype html><html><body style="margin:0;background:#808080"><p>Toolbar ' +
            'contrast backdrop</p></body></html>',
        })
      );
      const { page, popup } = await activateHost(context, extensionId, origin, composition);
      const toolbar = ui(page, 'content.toolbar.root');
      const settings = ui(page, 'content.toolbar.settings-button');
      const free = page.getByRole('button', {
        name: /Free toolbar placement|Свободное размещение панели/u,
      });
      try {
        await settings.click();
        if (
          await free.evaluate((node) => node.classList.contains('sniptale-popover-item-selected'))
        )
          await free.click();
        await page.keyboard.press('Escape');
        await ui(page, 'content.toolbar.mode-selector-button').click();
        await ui(page, 'content.toolbar.mode-option.drawing').click();
        const pencil = ui(page, 'content.toolbar.drawing.pencil');
        await pencil.click();
        await expect(pencil).toHaveAttribute('data-active', 'true');
        for (const orientation of ['horizontal', 'vertical']) {
          if (orientation === 'vertical') {
            await settings.click();
            await free.click();
            await page.getByRole('button', { name: /Vertical view|Вертикальный вид/u }).click();
          }
          for (const size of [24, 32]) {
            await toolbar.evaluate((chrome, buttonSize) => {
              let style = chrome.querySelector<HTMLStyleElement>('style[data-indicator-proof]');
              if (!style) {
                style = document.createElement('style');
                style.dataset['indicatorProof'] = 'true';
                chrome.append(style);
              }
              style.textContent =
                `.sniptale-content-toolbar-adopted { ` +
                `--sniptale-toolbar-button-size: ${buttonSize}px !important; transition: none ` +
                `!important; }`;
            }, size);
            await pencil.hover();
            await capture(page, info, `inside-indicators-${orientation}-${size}`);
            const toolbarBounds = (await toolbar.boundingBox())!;
            const viewport = page.viewportSize()!;
            const clipX = Math.max(0, toolbarBounds.x);
            const clipY = Math.max(0, toolbarBounds.y);
            await page.screenshot({
              path: info.outputPath(`inside-toolbar-closeup-${orientation}-${size}.png`),
              clip: {
                x: clipX,
                y: clipY,
                width: Math.min(viewport.width, toolbarBounds.x + toolbarBounds.width) - clipX,
                height: Math.min(viewport.height, toolbarBounds.y + toolbarBounds.height) - clipY,
              },
              fullPage: false,
              animations: 'disabled',
            });
            expect((await pencil.boundingBox())!.width).toBe(size);
            expect((await pencil.boundingBox())!.height).toBe(size);
            const measurements = await toolbar.evaluate(async (chrome) => {
              // Resolve visible SVG ink at 1/8 CSS px; padding also captures the rejected outside position.
              const scale = 8;
              const padding = 8;
              const shell = chrome.getBoundingClientRect();
              const results = [];
              for (const button of chrome.querySelectorAll<HTMLElement>(
                '[data-menu-indicator="true"]'
              )) {
                const box = button.getBoundingClientRect();
                if (box.width === 0 || box.height === 0) continue;
                const svg = button.querySelector('svg');
                if (!svg) throw new Error('Disclosure trigger has no glyph');
                const glyph = svg.getBoundingClientRect();
                const css = getComputedStyle(button, '::before');
                const buttonCss = getComputedStyle(button);
                const width = parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth);
                const height = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
                const explicitLeft = parseFloat(css.left);
                const explicitTop = parseFloat(css.top);
                const left =
                  (Number.isFinite(explicitLeft)
                    ? box.left + parseFloat(buttonCss.borderLeftWidth) + explicitLeft
                    : box.right -
                      parseFloat(buttonCss.borderRightWidth) -
                      parseFloat(css.right) -
                      width) - box.left;
                const top =
                  (Number.isFinite(explicitTop)
                    ? box.top + parseFloat(buttonCss.borderTopWidth) + explicitTop
                    : box.bottom -
                      parseFloat(buttonCss.borderBottomWidth) -
                      parseFloat(css.bottom) -
                      height) - box.top;
                const clone = svg.cloneNode(true);
                if (!(clone instanceof SVGSVGElement)) throw new Error('Glyph clone is not SVG');
                clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                clone.setAttribute('width', String(glyph.width));
                clone.setAttribute('height', String(glyph.height));
                const originalNodes = [svg, ...svg.querySelectorAll('*')];
                const clonedNodes = [clone, ...clone.querySelectorAll('*')];
                const paints = [];
                for (const [index, original] of originalNodes.entries()) {
                  const computed = getComputedStyle(original);
                  paints.push({ stroke: computed.stroke, fill: computed.fill });
                  const copied = clonedNodes[index]!;
                  if (!(copied instanceof SVGElement)) throw new Error('Glyph child is not SVG');
                  for (const property of [
                    'color',
                    'stroke',
                    'stroke-width',
                    'stroke-linecap',
                    'stroke-linejoin',
                    'stroke-miterlimit',
                    'fill',
                    'fill-rule',
                    'fill-opacity',
                    'stroke-opacity',
                    'opacity',
                    'vector-effect',
                  ]) {
                    copied.style.setProperty(property, computed.getPropertyValue(property));
                  }
                }
                clone.style.width = `${glyph.width}px`;
                clone.style.height = `${glyph.height}px`;
                const image = new Image();
                const loaded = new Promise<void>((resolve, reject) => {
                  image.onload = () => resolve();
                  image.onerror = () => reject(new Error('Native SVG ink mask failed to load'));
                });
                image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
                await loaded;
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil((box.width + padding * 2) * scale);
                canvas.height = Math.ceil((box.height + padding * 2) * scale);
                const context = canvas.getContext('2d')!;
                context.scale(scale, scale);
                context.drawImage(
                  image,
                  padding + glyph.left - box.left,
                  padding + glyph.top - box.top,
                  glyph.width,
                  glyph.height
                );
                const glyphPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                context.clearRect(0, 0, canvas.width / scale, canvas.height / scale);
                const side = chrome.getAttribute('data-display-mode') === 'vertical';
                context.beginPath();
                context.moveTo(padding + left, padding + top);
                if (side) {
                  context.lineTo(padding + left, padding + top + height);
                  context.lineTo(padding + left + width, padding + top + height / 2);
                } else {
                  context.lineTo(padding + left + width, padding + top);
                  context.lineTo(padding + left + width / 2, padding + top + height);
                }
                context.closePath();
                context.fillStyle = 'white';
                context.fill();
                const markerPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                const glyphInk = [];
                const markerInk = [];
                let overlap = 0;
                for (let pixel = 0; pixel < canvas.width * canvas.height; pixel++) {
                  const point = {
                    x: ((pixel % canvas.width) + 0.5) / scale - padding,
                    y: (Math.floor(pixel / canvas.width) + 0.5) / scale - padding,
                  };
                  if (glyphPixels[pixel * 4 + 3]! > 0) glyphInk.push(point);
                  if (markerPixels[pixel * 4 + 3]! > 0) markerInk.push(point);
                  if (glyphPixels[pixel * 4 + 3]! > 0 && markerPixels[pixel * 4 + 3]! > 0)
                    overlap++;
                }
                const border = parseFloat(buttonCss.borderTopWidth);
                const radius = Math.max(0, parseFloat(buttonCss.borderBottomRightRadius) - border);
                let frameClearance = Infinity;
                let glyphDistanceSquared = Infinity;
                for (const point of markerInk) {
                  const centerX = Math.max(
                    border + radius,
                    Math.min(point.x, box.width - border - radius)
                  );
                  const centerY = Math.max(
                    border + radius,
                    Math.min(point.y, box.height - border - radius)
                  );
                  frameClearance = Math.min(
                    frameClearance,
                    radius > 0
                      ? radius - Math.hypot(point.x - centerX, point.y - centerY)
                      : Math.min(
                          point.x - border,
                          box.width - border - point.x,
                          point.y - border,
                          box.height - border - point.y
                        )
                  );
                  for (const ink of glyphInk) {
                    glyphDistanceSquared = Math.min(
                      glyphDistanceSquared,
                      (point.x - ink.x) ** 2 + (point.y - ink.y) ** 2
                    );
                  }
                }
                const intersects = (other: DOMRect) =>
                  Math.max(
                    0,
                    Math.min(box.left + left + width, other.right) -
                      Math.max(box.left + left, other.left)
                  ) *
                  Math.max(
                    0,
                    Math.min(box.top + top + height, other.bottom) -
                      Math.max(box.top + top, other.top)
                  );
                results.push({
                  id: button.dataset['ui'],
                  resolvedPaint: paints.every(
                    (paint) => !/currentcolor|var\(/iu.test(paint.stroke + paint.fill)
                  ),
                  glyphInkPixels: glyphInk.length,
                  markerInkPixels: markerInk.length,
                  glyphOverlapPixels: overlap,
                  // Subtract pixel-cell radii so reported distances are conservative lower bounds.
                  glyphClearance: Math.sqrt(glyphDistanceSquared) - Math.SQRT2 / scale,
                  frameClearance: frameClearance - Math.SQRT2 / (2 * scale),
                  insideButton:
                    left >= 0 &&
                    top >= 0 &&
                    left + width <= box.width &&
                    top + height <= box.height,
                  withinChrome:
                    box.left + left >= shell.left &&
                    box.top + top >= shell.top &&
                    box.left + left + width <= shell.right &&
                    box.top + top + height <= shell.bottom,
                  neighboringOverlap: Math.max(
                    0,
                    ...Array.from(chrome.querySelectorAll('button'))
                      .filter((other) => other !== button)
                      .map((other) => intersects(other.getBoundingClientRect()))
                  ),
                });
              }
              return results;
            });
            expect(measurements.length).toBeGreaterThan(0);
            const metricsPath = info.outputPath(`inside-indicators-${orientation}-${size}.json`);
            await writeFile(metricsPath, JSON.stringify(measurements));
            await info.attach(`inside-indicators-${orientation}-${size}`, {
              path: metricsPath,
              contentType: 'application/json',
            });
            for (const geometry of measurements) {
              const label = `${geometry.id} ${orientation} ${size}px`;
              expect.soft(geometry.resolvedPaint, `${label} resolves real SVG paint`).toBe(true);
              expect
                .soft(geometry.glyphInkPixels, `${label} glyph actually rasterized`)
                .toBeGreaterThan(0);
              expect
                .soft(geometry.markerInkPixels, `${label} marker actually rasterized`)
                .toBeGreaterThan(0);
              expect
                .soft(geometry.insideButton, `${label} indicator stays inside its button`)
                .toBe(true);
              expect
                .soft(geometry.frameClearance, `${label} clears the rounded active frame`)
                .toBeGreaterThanOrEqual(0.9);
              expect.soft(geometry.glyphOverlapPixels, `${label} does not cover glyph ink`).toBe(0);
              expect
                .soft(geometry.glyphClearance, `${label} has visible glyph clearance`)
                .toBeGreaterThanOrEqual(0.5);
              expect.soft(geometry.neighboringOverlap).toBe(0);
              expect.soft(geometry.withinChrome).toBe(true);
            }
            await toolbar.evaluate((chrome) =>
              chrome.querySelector('style[data-indicator-proof]')?.remove()
            );
          }
          await pencil.hover();
          await capture(page, info, `followup-active-tool-${orientation}`);
          const expanded = await pencil.getAttribute('aria-expanded');
          await pencil.click();
          await expect(pencil).toHaveAttribute(
            'aria-expanded',
            expanded === 'true' ? 'false' : 'true'
          );
        }
        await settings.click();
        await free.click();
        await page.keyboard.press('Escape');
        const backdrops = width === 1280 ? ['#808080', '#f5f5f5', '#181818'] : ['#808080'];
        for (const [index, backdrop] of backdrops.entries()) {
          await page.evaluate((background) => {
            document.body.style.background = background;
          }, backdrop);
          await capture(page, info, `followup-backdrop-${index}`);
          const handle = ui(page, 'shared.ui.content-toolbar-drag-handle');
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(width / 2, 100, { steps: 5 });
          const guides = ui(page, 'content.toolbar.dock-guides');
          await expect(guides).toBeVisible();
          for (const state of ['inactive', 'active']) {
            if (state === 'active') await page.mouse.move(width / 2, 20, { steps: 4 });
            const zone = ui(page, 'content.toolbar.dock-zone.top');
            const paint = await zone.evaluate((element) => {
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 1;
              const context = canvas.getContext('2d')!;
              const css = getComputedStyle(element);
              const read = (color: string) => {
                context.clearRect(0, 0, 1, 1);
                context.fillStyle = color;
                context.fillRect(0, 0, 1, 1);
                return Array.from(context.getImageData(0, 0, 1, 1).data);
              };
              return {
                border: read(css.borderTopColor),
                outline: read(css.outlineColor),
                fill: read(css.backgroundColor),
                opacity: css.opacity,
              };
            });
            expect.soft(paint.opacity).toBe('1');
            expect
              .soft(
                Math.max(...paint.border.slice(0, 3)) - Math.min(...paint.border.slice(0, 3)),
                'Dock guides use neutral gray in both states'
              )
              .toBeLessThanOrEqual(5);
            expect
              .soft(Math.max(...paint.border.slice(0, 3)), 'Guide border avoids bright white')
              .toBeLessThanOrEqual(210);
            expect
              .soft(paint.outline[3], 'Outer edge uses a subdued opacity')
              .toBeLessThanOrEqual(100);
            expect
              .soft(Math.max(...paint.fill.slice(0, 3)) - Math.min(...paint.fill.slice(0, 3)))
              .toBeLessThanOrEqual(5);
            await capture(page, info, `followup-guide-${index}-${state}`);
          }
          await page.mouse.up();
          await expect(guides).toHaveCount(0);
        }
      } finally {
        await page.close();
        await popup.close();
        await context.unroute(`${origin}/**`);
      }
    });
  }
}
