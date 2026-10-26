import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTION_VIEWS,
} from '../../../../apps/extension/src/platform/navigation/extension-pages/settings-route/codec';

async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
}

async function route(page: Page, extensionId: string, section: string, view?: string) {
  await page.goto(
    `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=${section}${view ? `&view=${view}` : ''}`
  );
  const content = page.locator('[data-ui="settings.page.content-scroll"]');
  await expect.poll(async () => (await content.innerText()).trim().length).toBeGreaterThan(0);
  await expect(content.locator('.animate-pulse')).toHaveCount(0);
  await settled(page);
}

async function verifyReorderCursor(page: Page, handle: Locator) {
  await handle.scrollIntoViewIfNeeded();
  await handle.hover();
  await expect(handle).toHaveCSS('cursor', 'grab');
  const bounds = (await handle.boundingBox())!;
  const hitCursor = await page.evaluate(
    ({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return hit ? getComputedStyle(hit).cursor : null;
    },
    { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  );
  expect(hitCursor).toBe('grab');
  await page.mouse.down();
  await expect(handle).toHaveCSS('cursor', 'grabbing');
  await page.mouse.move(bounds.x + bounds.width / 2 + 16, bounds.y + bounds.height / 2 + 3);
  await expect(handle).toHaveCSS('cursor', 'grabbing');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await handle.hover();
  await expect(handle).toHaveCSS('cursor', 'grab');
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    test(`settings reorder cursor ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await route(page, extensionId, 'quick-actions');
      await page.evaluate(async (theme) => {
        localStorage.setItem('sniptale-theme-preference', theme);
        await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
      }, theme);
      for (const [section, view] of [
        ['quick-actions', undefined],
        ['screen-sizes', undefined],
        ['editor-resources', 'palettes'],
      ] as const) {
        await route(page, extensionId, section, view);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const handle = page
          .locator('[data-settings-collection-item]')
          .first()
          .getByRole('button', { name: /Изменить позицию|Change position/ });
        await verifyReorderCursor(page, handle);
      }
      await route(page, extensionId, 'interface-browser', 'context-menu');
      await verifyReorderCursor(page, page.locator('[data-context-menu-source="tree"]').first());
      await verifyReorderCursor(page, page.locator('[data-context-menu-source="catalog"]').first());
      await page.screenshot({
        path: info.outputPath('settings-reorder-cursor.png'),
        fullPage: false,
      });
      await page.setViewportSize({ width: 960, height: viewport.size.height });
      await route(page, extensionId, 'quick-actions');
      await verifyReorderCursor(
        page,
        page
          .locator('[data-settings-collection-item]')
          .first()
          .getByRole('button', { name: /Изменить позицию|Change position/ })
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
    });
  }
  for (const view of ['backgrounds', 'palettes'] as const) {
    test(`${view} drop preserves focus while saving ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await route(page, extensionId, 'editor-resources', view);
      const rows = page.locator('[data-settings-collection-item]');
      const secondId = await rows.nth(1).getAttribute('data-settings-collection-item');
      const secondText = (await rows.nth(1).innerText()).split('\n')[0]!;
      const source = rows.first().getByRole('button', { name: /Изменить позицию|Change position/ });
      await source.scrollIntoViewIfNeeded();
      await source.evaluate((element) =>
        element.setAttribute('data-preserved-background-handle', '')
      );
      const preserved = page.locator('[data-preserved-background-handle]');
      await source.focus();
      await page.evaluate(
        (domain) => {
          void navigator.locks.request(
            `sniptale:persistence:privacy-erasure:${domain}`,
            async () => {
              document.documentElement.setAttribute('data-background-write-held', '');
              await new Promise<void>((resolve) =>
                document.addEventListener('sniptale-release-background-write', () => resolve(), {
                  once: true,
                })
              );
            }
          );
        },
        view === 'backgrounds' ? 'background-presets' : 'drawing-palette'
      );
      await expect(page.locator('html')).toHaveAttribute('data-background-write-held', '');
      const from = (await source.boundingBox())!;
      const target = (await rows.nth(1).boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height - 4, {
        steps: 4,
      });
      await page.mouse.up();
      if (view === 'backgrounds') await expect(preserved).toHaveAttribute('aria-disabled', 'true');
      expect(await preserved.evaluate((element) => element.matches(':disabled'))).toBe(false);
      await expect(preserved).toBeFocused();
      await expect(rows.first()).toHaveAttribute('data-settings-collection-item', secondId!);
      await settled(page);
      await page.screenshot({
        path: info.outputPath(`${view}-drop-pending.png`),
        fullPage: false,
      });
      const stableOrder = await rows.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-settings-collection-item'))
      );
      const frameOrders = await page.evaluate(async () => {
        document.dispatchEvent(new Event('sniptale-release-background-write'));
        const orders: (string | null)[][] = [];
        for (let frame = 0; frame < 24; frame++) {
          await new Promise(requestAnimationFrame);
          orders.push(
            [...document.querySelectorAll('[data-settings-collection-item]')].map((element) =>
              element.getAttribute('data-settings-collection-item')
            )
          );
        }
        return orders;
      });
      expect(
        frameOrders.every((order) => JSON.stringify(order) === JSON.stringify(stableOrder))
      ).toBe(true);
      await expect(preserved).not.toHaveAttribute('aria-disabled', 'true');
      await expect(rows.first()).toContainText(secondText);
      await settled(page);
      await expect(preserved).toBeFocused();
      await expect(rows.nth(1).locator('[data-preserved-background-handle]')).toHaveCount(1);
      await page.screenshot({ path: info.outputPath(`${view}-drop-saved.png`), fullPage: false });
      await page.reload();
      await expect(rows.first()).toContainText(secondText);
    });
  }

  test(`rapid collection drag stays bounded ${viewport.name}`, async ({
    page,
    extensionId,
  }, info) => {
    await page.setViewportSize(viewport.size);
    for (const section of ['quick-actions', 'screen-sizes']) {
      await route(page, extensionId, section);
      const list = page.locator('[data-ui="settings.collection.list-scroll"]');
      const rows = list.locator('[data-settings-collection-item]');
      const original = await rows.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-settings-collection-item'))
      );
      expect(original.length).toBeGreaterThan(3);
      const height = await list.evaluate((element) => element.scrollHeight);
      const bounds = (await list.boundingBox())!;
      const scrollBounds = (await page
        .locator('[data-ui="settings.page.content-scroll"]')
        .boundingBox())!;
      const visibleBottom = Math.min(
        bounds.y + bounds.height,
        scrollBounds.y + scrollBounds.height
      );
      const handle = rows.first().getByRole('button', { name: /Изменить позицию|Change position/ });
      const source = (await handle.boundingBox())!;
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      for (let index = 0; index < 20; index++) {
        await page.mouse.move(
          source.x + source.width / 2,
          index % 2 ? bounds.y + 8 : visibleBottom - 8
        );
        expect(await list.evaluate((element) => element.scrollHeight)).toBeLessThanOrEqual(
          height + 1
        );
        await expect(rows).toHaveCount(original.length);
      }
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await settled(page);
      expect(
        await rows.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-settings-collection-item'))
        )
      ).toEqual(original);
      await page.screenshot({
        path: info.outputPath(`rapid-drag-cancelled-${section}.png`),
        fullPage: false,
      });
      await page.reload();
      await expect(rows).toHaveCount(original.length);
      await settled(page);
      expect(
        await rows.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-settings-collection-item'))
        )
      ).toEqual(original);
      const commitSource = (await handle.boundingBox())!;
      const commitBounds = (await rows.nth(2).boundingBox())!;
      await page.mouse.move(
        commitSource.x + commitSource.width / 2,
        commitSource.y + commitSource.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        commitSource.x + commitSource.width / 2,
        commitBounds.y + commitBounds.height - 4,
        { steps: 4 }
      );
      const previewOrder = await rows.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-settings-collection-item'))
      );
      expect(previewOrder).not.toEqual(original);
      const [releaseOrders] = await Promise.all([
        page.evaluate(async () => {
          const orders: (string | null)[][] = [];
          for (let frame = 0; frame < 24; frame++) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            orders.push(
              [...document.querySelectorAll('[data-settings-collection-item]')].map((element) =>
                element.getAttribute('data-settings-collection-item')
              )
            );
          }
          return orders;
        }),
        page.mouse.up(),
      ]);
      for (const order of releaseOrders) expect(order).toEqual(previewOrder);
      await expect
        .poll(() => rows.first().getAttribute('data-settings-collection-item'))
        .not.toBe(original[0]);
      const committed = await rows.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-settings-collection-item'))
      );
      await page.reload();
      await expect(rows).toHaveCount(original.length);
      await expect
        .poll(() =>
          rows.evaluateAll((elements) =>
            elements.map((element) => element.getAttribute('data-settings-collection-item'))
          )
        )
        .toEqual(committed);
    }
  });

  test(`AI model drop keeps handle geometry and focus ${viewport.name}`, async ({
    page,
    extensionId,
    hostOrigin,
  }, info) => {
    await page.setViewportSize(viewport.size);
    await route(page, extensionId, 'ai-connections');
    const locale = (await page.locator('html').getAttribute('lang')) === 'ru' ? 'ru' : 'en';
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const providerName = `Drag fixture ${viewport.name}`;
    const providers = page.getByRole('region', { name: /^(Providers|Провайдеры)$/ });
    await providers.getByRole('button', { name: /^(Add|Добавить)$/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(providerName);
    await dialog.locator('input').nth(1).fill(`${hostOrigin}/v1`);
    await dialog.locator('input').nth(2).fill('synthetic-drag-fixture-key');
    await dialog.getByRole('button', { name: /^(Add|Добавить)$/ }).click();
    await expect(providers).toContainText(providerName);
    const models = page.getByRole('region', { name: /^(Models|Модели)$/ });
    for (const number of [1, 2]) {
      await models.getByRole('button', { name: /^(Add|Добавить)$/ }).click();
      await dialog
        .getByRole('button', {
          name: label('settings.aiProviders.modelProviderPlaceholder'),
          exact: true,
        })
        .click();
      await page.getByRole('option', { name: providerName, exact: true }).click();
      await dialog
        .getByPlaceholder(label('settings.aiProviders.modelNamePlaceholder'), { exact: true })
        .fill(`Model ${number} ${viewport.name}`);
      await dialog
        .getByPlaceholder(label('settings.aiProviders.modelCodePlaceholder'), { exact: true })
        .fill(`fixture-${number}`);
      await dialog.getByRole('button', { name: /^(Add|Добавить)$/ }).click();
      await expect(
        models.getByText(`Model ${number} ${viewport.name}`, { exact: true })
      ).toBeVisible();
    }
    const list = models.locator('[data-settings-collection-root]');
    const rows = list.locator('[data-settings-collection-item]').filter({ hasText: viewport.name });
    await expect(rows).toHaveCount(2);
    const secondModelId = await rows.last().getAttribute('data-settings-collection-item');
    if (!secondModelId) throw new Error('Model ID is missing');
    const source = rows.first().getByRole('button', { name: /Изменить позицию|Change position/ });
    await source.scrollIntoViewIfNeeded();
    await source.evaluate((element) => element.setAttribute('data-review-preserved-handle', ''));
    await source.focus();
    const preserved = page.locator('[data-review-preserved-handle]');
    const title = page.getByText(`Model 1 ${viewport.name}`, { exact: true });
    const before = (await title.boundingBox())!.x;
    await page.evaluate(() => {
      const send = chrome.runtime.sendMessage.bind(chrome.runtime);
      const release = new Promise<void>((resolve) =>
        document.addEventListener('sniptale-test-release-move', () => resolve(), { once: true })
      );
      Object.defineProperty(chrome.runtime, 'sendMessage', {
        configurable: true,
        value: (message: unknown) => {
          if (
            message &&
            typeof message === 'object' &&
            'type' in message &&
            message.type === 'AI_SETTINGS_MUTATION' &&
            'operation' in message &&
            message.operation === 'move-model'
          )
            return release.then(() => send(message));
          return send(message);
        },
      });
    });
    const from = (await source.boundingBox())!;
    const to = (await rows.last().boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + to.height - 4, { steps: 4 });
    await page.mouse.up();
    await expect(preserved).toHaveAttribute('aria-disabled', 'true');
    await expect(
      rows.getByRole('button', { name: /Изменить позицию|Change position/ })
    ).toHaveCount(2);
    await expect(preserved).toBeFocused();
    await preserved.press('Enter');
    await settled(page);
    expect(Math.abs((await title.boundingBox())!.x - before)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('model-drop-pending.png'), fullPage: false });
    await page.evaluate(() => document.dispatchEvent(new Event('sniptale-test-release-move')));
    await expect(preserved).not.toHaveAttribute('aria-disabled', 'true');
    await expect(preserved).toBeFocused();
    await expect(rows.first()).toHaveAttribute('data-settings-collection-item', secondModelId);
    expect(Math.abs((await title.boundingBox())!.x - before)).toBeLessThanOrEqual(1);
    await page.reload();
    await expect(rows.first()).toHaveAttribute('data-settings-collection-item', secondModelId);
  });

  test(`context menu drag gap stays aligned ${viewport.name}`, async ({
    page,
    extensionId,
  }, info) => {
    await page.setViewportSize(viewport.size);
    await route(page, extensionId, 'interface-browser', 'context-menu');
    const theme = viewport.size.width === 1280 ? 'light' : 'dark';
    await page.evaluate(async (theme) => {
      localStorage.setItem('sniptale-theme-preference', theme);
      await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
    }, theme);
    await route(page, extensionId, 'interface-browser', 'context-menu');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const row = page.locator('[data-tree-key]').first();
    const handle = row.locator('[data-context-menu-source="tree"]');
    await expect(handle).toBeVisible();
    const activeRoute = page.locator(
      '[data-ui="settings.sidebar.nav-list"] button[aria-current="page"]'
    );
    const selectedSurface = await activeRoute.evaluate((element) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--sniptale-color-surface-hover)';
      element.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await expect(activeRoute).toHaveCSS('background-color', selectedSurface);
    const bounds = (await row.boundingBox())!;
    const source = (await handle.boundingBox())!;
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 10, bounds.y + 2, { steps: 4 });
    const indicator = page.locator('[data-drop-edge="before"]');
    await expect(indicator).toBeVisible();
    expect(Math.abs((await indicator.boundingBox())!.y - bounds.y)).toBeLessThanOrEqual(1);
    await expect(page.locator('.context-menu-drag-preview')).toHaveCSS('opacity', '0.6');
    await page.screenshot({
      path: info.outputPath('context-menu-original-gap.png'),
      fullPage: false,
    });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(indicator).toHaveCount(0);
    await expect(page.locator('.context-menu-drag-preview')).toHaveCount(0);
    for (const control of await page.locator('button:disabled, input:disabled').all())
      await expect(control).toHaveCSS('cursor', 'default');
  });
  for (const variant of [
    { locale: 'ru', theme: 'light' },
    { locale: 'en', theme: 'dark' },
  ] as const) {
    test(`video feedback corrections ${viewport.name} ${variant.locale}-${variant.theme}`, async ({
      page,
      extensionId,
    }, info) => {
      test.setTimeout(180_000);
      page.setDefaultTimeout(10_000);
      await page.setViewportSize(viewport.size);
      await route(page, extensionId, 'interface-browser', 'interface');
      await page.evaluate(async (variant) => {
        localStorage.setItem('sniptale-theme-preference', variant.theme);
        localStorage.setItem('sniptale-locale-preference', variant.locale);
        await chrome.storage.local.set({
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        });
      }, variant);
      const text = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
      await route(page, extensionId, 'interface-browser', 'interface');
      const tab = page.locator('[data-ui="settings.subpage-tabs"] button').last();
      const span = tab.locator('.sniptale-command-content');
      await tab.hover();
      await page.mouse.down();
      await expect(span).toHaveCSS('transform', 'none');
      await expect(span).toHaveCSS('opacity', '1');
      await page.mouse.up();
      await settled(page);
      const addSection = page.getByRole('button', {
        name: text('common.actions.add'),
        exact: true,
      });
      await expect(addSection).toHaveCSS('height', '32px');
      await expect(addSection).toHaveCSS('border-radius', '4px');

      await route(page, extensionId, 'quick-actions');
      await page
        .getByRole('button', { name: text('settings.quickActions.addButton'), exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog
        .getByRole('button', { name: text('settings.quickActions.appearanceCapture'), exact: true })
        .click();
      const delay = dialog
        .locator('[data-ui="settings.control-row"]')
        .filter({ hasText: text('settings.quickActions.delayLabel') });
      await expect(delay).toContainText(text('settings.quickActions.delayNone'));
      await dialog
        .getByRole('button', { name: text('settings.quickActions.appearanceAction'), exact: true })
        .click();
      const checkbox = dialog.getByRole('checkbox');
      const header = dialog.locator('.sniptale-modal-header-sm');
      const footer = dialog.locator('.sniptale-modal-footer-sm');
      const modalBody = dialog.locator('.sniptale-modal-body-sm');
      await settled(page);
      const headerBefore = await header.boundingBox();
      const footerBefore = await footer.boundingBox();
      await expect(modalBody).toHaveCSS('overflow-y', 'auto');
      await expect(checkbox).toHaveCSS('appearance', 'none');
      expect(
        await checkbox.evaluate((element) => getComputedStyle(element, '::before').borderRadius)
      ).toBe('50%');
      await checkbox.check();
      await expect(checkbox).toBeChecked();
      await settled(page);
      expect((await header.boundingBox())!.y).toBeCloseTo(headerBefore!.y, 0);
      expect((await footer.boundingBox())!.y).toBeCloseTo(footerBefore!.y, 0);
      await expect(header).toBeInViewport();
      await expect(footer).toBeInViewport();
      if (
        viewport.size.height === 560 &&
        (await modalBody.evaluate((element) => element.scrollHeight > element.clientHeight))
      ) {
        expect(await modalBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        await modalBody.hover();
        await page.mouse.wheel(0, -10_000);
        await expect.poll(() => modalBody.evaluate((element) => element.scrollTop)).toBe(0);
        expect((await header.boundingBox())!.y).toBeCloseTo(headerBefore!.y, 0);
        expect((await footer.boundingBox())!.y).toBeCloseTo(footerBefore!.y, 0);
      }
      await page.screenshot({
        path: info.outputPath('quick-action-circular-check.png'),
        fullPage: false,
      });
      await dialog
        .getByRole('button', { name: text('common.actions.cancel'), exact: true })
        .click();

      await route(page, extensionId, 'screen-sizes');
      await page
        .getByRole('button', { name: text('viewportPresets.section.addButton'), exact: true })
        .click();
      const name = dialog.getByRole('textbox', {
        name: text('viewportPresets.editor.nameLabel'),
        exact: true,
      });
      const nameRow = dialog
        .locator('[data-ui="settings.control-row"]')
        .filter({ hasText: text('viewportPresets.editor.nameLabel') });
      await expect(nameRow.locator('[data-layout]')).toHaveAttribute('data-layout', 'inline');
      await name.fill('Test viewport');
      await name.press('Tab');
      await settled(page);
      await expect(nameRow.locator('[data-layout]')).toHaveAttribute('data-layout', 'inline');
      await dialog
        .getByRole('button', { name: text('common.actions.cancel'), exact: true })
        .click();

      await route(page, extensionId, 'media-quality', 'image');
      for (const row of await page
        .locator('[data-ui="settings.control-row"] > [data-layout]')
        .all())
        await expect(row).toHaveAttribute('data-layout', 'inline');
      const numericRows = page
        .locator('[data-ui="settings.control-row"]')
        .filter({ has: page.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]') });
      for (const row of await numericRows.all())
        expect((await row.boundingBox())!.width).toBeLessThanOrEqual(560);
      await settled(page);
      await page.screenshot({
        path: info.outputPath('compact-image-parameters.png'),
        fullPage: false,
      });

      await route(page, extensionId, 'saving', 'templates');
      await expect(page.getByRole('searchbox')).toHaveCount(0);
      await expect(
        page.getByText(text('savePresets.section.listDescription'), { exact: true })
      ).toHaveCount(0);

      await route(page, extensionId, 'annotations', 'callouts');
      await expect(
        page.getByRole('heading', {
          name: text('highlighter.calloutPresets.newSession.sectionTitle'),
          exact: true,
        })
      ).toBeVisible();
      const list = page.locator('[data-ui="settings.collection.list-scroll"]');
      const toolbar = page.locator('[data-ui="settings.collection.toolbar"]');
      await expect(list).toHaveCSS('overflow-y', 'visible');
      await list.locator('[data-settings-collection-item]').last().scrollIntoViewIfNeeded();
      expect(await list.evaluate((element) => element.scrollTop)).toBe(0);
      await toolbar.scrollIntoViewIfNeeded();
      const filter = page.getByRole('button', {
        name: text('highlighter.templateTags.filterLabel'),
        exact: true,
      });
      await filter.click();
      const option = page.getByRole('menuitemcheckbox').first();
      const initiallySelected = (await option.getAttribute('aria-checked')) === 'true';
      await option.click();
      await expect(option).toHaveAttribute('aria-checked', String(!initiallySelected));
      if (initiallySelected) await option.click();
      await expect(option).toHaveAttribute('aria-checked', 'true');
      const accent = await option.evaluate((element) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--sniptale-color-accent)';
        element.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      await expect(option).not.toHaveCSS('color', accent);
      await page.keyboard.press('Escape');
      await settled(page);
      await page.screenshot({
        path: info.outputPath('fixed-annotation-controls.png'),
        fullPage: false,
      });

      await route(page, extensionId, 'editor-resources', 'tools');
      await expect(
        page
          .locator('[data-ui="settings.subpage-tabs"]')
          .getByRole('button', { name: text('settings.navigation.views.tools'), exact: true })
      ).toHaveCount(0);
      await expect(
        page.locator('[data-ui="settings.subpage-tabs"] [aria-current="page"]')
      ).toHaveText(text('settings.navigation.views.palettes'));
      await route(page, extensionId, 'editor-resources', 'surfaces');
      await page
        .getByRole('button', { name: text('settings.editor.surfaceStyles.add'), exact: true })
        .click();
      await dialog.locator('[data-ui="shared.ui.color-selector.value-trigger"]').click();
      const colorEditor = dialog.locator('[data-ui="shared.ui.color-selector.value-editor"]');
      await expect(colorEditor).not.toHaveCSS('border-color', accent);
      await colorEditor.getByRole('textbox').press('Escape');
      await dialog.locator('[data-ui="shared.ui.paint-selector.trigger"]').click();
      const paint = page.locator('[data-ui="shared.ui.paint-selector.popup"]');
      const mode = paint.locator(
        '[data-ui="shared.ui.paint-selector.modes"] [aria-pressed="true"]'
      );
      await mode.hover();
      await expect(mode).not.toHaveCSS('color', accent);
      await settled(page);
      await page.screenshot({
        path: info.outputPath('neutral-paint-selection.png'),
        fullPage: false,
      });
      await page.keyboard.press('Escape');
      await dialog
        .getByRole('button', { name: text('common.actions.cancel'), exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await page.setViewportSize({ width: 1100, height: 560 });
      await route(page, extensionId, 'media-quality', 'image');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true);
    });

    test(`settings dropdown typography ${viewport.name} ${variant.locale}-${variant.theme}`, async ({
      page,
      extensionId,
    }, info) => {
      test.setTimeout(180_000);
      await page.setViewportSize(viewport.size);
      await route(page, extensionId, 'interface-browser', 'interface');
      await page.evaluate(async (variant) => {
        localStorage.setItem('sniptale-theme-preference', variant.theme);
        localStorage.setItem('sniptale-locale-preference', variant.locale);
        await chrome.storage.local.set({
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        });
      }, variant);
      for (const section of SETTINGS_SECTION_IDS) {
        const views = SETTINGS_SECTION_VIEWS[section];
        for (const view of views.length ? views : [undefined]) {
          await route(page, extensionId, section, view);
          const triggers = page.locator('.sniptale-select:visible');
          for (const trigger of await triggers.all()) {
            await expect(trigger).toHaveCSS('font-weight', '400');
            await expect(trigger).toHaveCSS('font-size', '13px');
            await expect(trigger).toHaveCSS('line-height', '18px');
          }
          const trigger = page.locator('.sniptale-select:visible:enabled').first();
          if (!(await trigger.count())) continue;
          await trigger.click();
          const menu = page.getByRole('listbox');
          await expect(menu).toBeVisible();
          for (const option of await menu.getByRole('option').all()) {
            await expect(option).toHaveCSS('font-weight', '400');
            await expect(option).toHaveCSS('font-size', '13px');
            await expect(option).toHaveCSS('line-height', '18px');
          }
          const family = await trigger.evaluate((element) => getComputedStyle(element).fontFamily);
          await expect(menu).toHaveCSS('font-family', family);
          if (section === 'interface-browser' || section === 'media-quality') {
            await settled(page);
            await page.screenshot({
              path: info.outputPath(`dropdown-${section}-${view ?? 'main'}.png`),
              fullPage: false,
            });
          }
          await page.keyboard.press('Escape');
          await expect(menu).toHaveCount(0);
        }
      }
    });

    test(`settings polish ${viewport.name} ${variant.locale}-${variant.theme}`, async ({
      page,
      extensionId,
    }, info) => {
      test.setTimeout(180_000);
      await page.setViewportSize(viewport.size);
      await route(page, extensionId, 'interface-browser', 'interface');
      await page.evaluate(async (variant) => {
        localStorage.setItem('sniptale-theme-preference', variant.theme);
        localStorage.setItem('sniptale-locale-preference', variant.locale);
        await chrome.storage.local.set({
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        });
      }, variant);
      const text = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
      await route(page, extensionId, 'quick-actions');
      await page
        .getByRole('button', { name: text('settings.quickActions.addButton'), exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      const icons = dialog.locator('[data-ui="settings.quick-actions.icons"]');
      await expect(icons.getByRole('button')).toHaveCount(24);
      await expect(dialog.getByRole('checkbox')).toHaveCount(1);
      const name = dialog.getByRole('textbox', {
        name: text('settings.quickActions.nameLabel'),
        exact: true,
      });
      await name.fill('A stable editable name');
      await settled(page);
      const before = await name.boundingBox();
      await name.fill('A');
      await settled(page);
      const after = await name.boundingBox();
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(Math.abs(after![key] - before![key])).toBeLessThanOrEqual(1);
      await dialog
        .getByRole('button', { name: text('settings.quickActions.moreIcons'), exact: true })
        .click();
      await expect(icons.getByRole('button')).toHaveCount(60);
      expect((await icons.boundingBox())!.height).toBeLessThanOrEqual(161);
      await settled(page);
      await page.screenshot({ path: info.outputPath('quick-action-icons.png'), fullPage: false });
      await dialog
        .getByRole('button', { name: text('common.actions.cancel'), exact: true })
        .click();
      await expect(dialog).toHaveCount(0);

      await route(page, extensionId, 'annotations', 'tags');
      await page
        .getByRole('button', { name: text('highlighter.templateTags.add'), exact: true })
        .click();
      await expect(
        dialog.getByRole('button', {
          name: text('highlighter.templateTags.mergeTarget'),
          exact: true,
        })
      ).toHaveCount(0);
      await settled(page);
      await page.screenshot({ path: info.outputPath('new-tag.png'), fullPage: false });
      await dialog
        .getByRole('button', { name: text('common.actions.cancel'), exact: true })
        .click();

      await route(page, extensionId, 'interface-browser', 'context-menu');
      const toggle = page.getByRole('switch').first();
      await expect(toggle).not.toHaveAttribute('data-command-press');
      await toggle.hover();
      await expect(toggle).toHaveAttribute('aria-label', /\S/);
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await page.evaluate(() => {
        const probe = document.createElement('button');
        probe.id = 'settings-native-hint-proof';
        probe.textContent = 'Visible label';
        probe.title = 'Visible label';
        probe.style.cssText =
          'position:fixed;left:400px;top:140px;width:180px;overflow:hidden;white-space:nowrap';
        document.body.append(probe);
      });
      const probe = page.locator('#settings-native-hint-proof');
      await probe.hover();
      await expect(probe).toHaveAttribute('title', '');
      await probe.evaluate((element) => {
        element.style.width = '30px';
      });
      await expect(probe).toHaveAttribute('title', 'Visible label');
      await probe.focus();
      await expect(probe).toHaveAccessibleName('Visible label');
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await probe.evaluate((element) => {
        element.style.width = '180px';
      });
      await expect(probe).toHaveAttribute('title', '');
      await probe.evaluate((element) => {
        element.removeAttribute('title');
        element.textContent = 'Updated label';
      });
      await expect(probe).not.toHaveAttribute('title');
      await expect(probe).toHaveAccessibleName('Updated label');
      await probe.evaluate((element) => element.remove());

      for (const section of SETTINGS_SECTION_IDS) {
        const views = SETTINGS_SECTION_VIEWS[section];
        for (const view of views.length ? views : [undefined]) {
          await route(page, extensionId, section, view);
          await expect(page.locator('html')).toHaveAttribute('lang', variant.locale);
          await expect(page.locator('html')).toHaveAttribute('data-theme', variant.theme);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
          ).toBe(true);
          const unnamed = await page
            .locator('[data-ui="settings.page.root"] button:visible')
            .evaluateAll((buttons) =>
              buttons
                .filter(
                  (button) =>
                    !button.textContent?.trim() &&
                    !button.getAttribute('aria-label') &&
                    !button.getAttribute('aria-labelledby')
                )
                .map((button) => button.outerHTML)
            );
          expect(unnamed).toEqual([]);
          await page.screenshot({
            path: info.outputPath(`${section}-${view ?? 'main'}.png`),
            fullPage: false,
          });
        }
      }
    });
  }
}
