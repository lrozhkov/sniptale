import type { Page } from '@playwright/test';
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

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
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
      const handle = rows.first().getByRole('button', { name: /Изменить позицию|Change position/ });
      const source = (await handle.boundingBox())!;
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      for (let index = 0; index < 20; index++) {
        await page.mouse.move(
          source.x + source.width / 2,
          bounds.y + (index % 2 ? 8 : bounds.height - 8)
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
      const commitBounds = (await list.boundingBox())!;
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
      await page.mouse.up();
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
      const delay = dialog
        .locator('[data-ui="settings.control-row"]')
        .filter({ hasText: text('settings.quickActions.delayLabel') });
      await expect(delay).toContainText(text('settings.quickActions.delayNone'));
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
      if (viewport.size.height === 560) {
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
      const before = (await toolbar.boundingBox())!.y;
      const ownerBottom = (await page
        .locator('[data-ui="settings.page.content-scroll"]')
        .boundingBox())!;
      const listBounds = (await list.boundingBox())!;
      expect(listBounds.y + listBounds.height).toBeLessThanOrEqual(
        ownerBottom.y + ownerBottom.height + 1
      );
      await list.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect.poll(async () => (await toolbar.boundingBox())!.y).toBe(before);
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
      const mode = paint.locator('.paint-selector-modes [aria-pressed="true"]');
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
