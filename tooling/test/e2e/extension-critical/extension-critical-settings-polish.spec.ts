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
      probe.style.color = 'var(--sniptale-color-text-primary)';
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
