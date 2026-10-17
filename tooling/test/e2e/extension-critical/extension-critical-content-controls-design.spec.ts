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
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

async function withinViewport(root: Locator) {
  await expect(root).toBeVisible();
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
            observation.orientation === 'vertical'
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
          expect.soft(button.glyph, label).toEqual({ width: 16, height: 16 });
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
  await expect(modal).toHaveCSS('width', '780px');
  await expect(modal).toHaveCSS('border-radius', '8px');
  for (const value of ['first@example.org', 'second@example.org', 'third@example.org'])
    await modal.getByRole('checkbox', { name: value, exact: true }).uncheck();
  await first.check();
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
