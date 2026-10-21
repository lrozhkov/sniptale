import type { Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { expect, test } from '../support/extension-fixture';

const text = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');

async function settle(page: Page) {
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

async function holdWrite(page: Page, domain?: string) {
  await page.evaluate((domain) => {
    void navigator.locks.request(
      `sniptale:persistence:privacy-erasure${domain ? `:${domain}` : ''}`,
      async () => {
        document.documentElement.setAttribute('data-write-held', '');
        await new Promise<void>((resolve) =>
          document.addEventListener('release-write', () => resolve(), { once: true })
        );
      }
    );
  }, domain);
  await expect(page.locator('html')).toHaveAttribute('data-write-held', '');
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`settings six follow-ups ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport.size);
      const base = `chrome-extension://${extensionId}/apps/extension/src/settings/index.html`;
      await page.goto(`${base}?section=interface-browser&view=interface`);
      await expect(page.locator('#settings-interface-language')).toBeEnabled();
      await page.evaluate(async (theme) => {
        localStorage.setItem('sniptale-locale-preference', 'ru');
        await chrome.storage.local.set({
          'sniptale-locale-preference': 'ru',
          'sniptale-theme-preference': theme,
        });
      }, theme);
      const open = async (section: string, view?: string) => {
        await page.goto(`${base}?section=${section}${view ? `&view=${view}` : ''}`);
        await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
        await expect(
          page.locator('[data-ui="settings.page.content-scroll"] .animate-pulse')
        ).toHaveCount(0);
        await settle(page);
      };
      for (const view of ['callouts', 'numbering'] as const) {
        await open('annotations', view);
        const rows = page.locator('[data-settings-collection-item]');
        await expect(rows.first()).toBeVisible();
        const toggle = rows.nth(2).getByRole('switch');
        const neighborId = await rows.nth(1).getAttribute('data-settings-collection-item');
        const neighbor = page.locator(`[data-settings-collection-item="${neighborId}"]`);
        await neighbor.evaluate((element) => element.setAttribute('data-preserved-row', ''));
        const controls = neighbor.locator('button').filter({ visible: true });
        const before = await controls.evaluateAll((elements) =>
          elements.map((element) => getComputedStyle(element).opacity)
        );
        const defaults = page.getByRole('switch').first();
        const beforeDefault = await defaults.evaluate(
          (element) => getComputedStyle(element).opacity
        );
        await holdWrite(page, view === 'callouts' ? 'callout-presets' : 'step-badge-presets');
        await toggle.click();
        await expect(toggle).toBeDisabled();
        await expect(neighbor.getByRole('switch')).toBeDisabled();
        await settle(page);
        expect(
          await controls.evaluateAll((elements) =>
            elements.map((element) => getComputedStyle(element).opacity)
          )
        ).toEqual(before);
        expect(await defaults.evaluate((element) => getComputedStyle(element).opacity)).toBe(
          beforeDefault
        );
        await page.screenshot({ path: info.outputPath(`${view}-pending.png`), fullPage: false });
        await page.evaluate(() => document.dispatchEvent(new Event('release-write')));
        await expect(toggle).toBeEnabled();
        await expect(neighbor).toHaveAttribute('data-preserved-row', '');
        await settle(page);
        await page.screenshot({ path: info.outputPath(`${view}-saved.png`), fullPage: false });
      }
      await open('video-effects');
      const filters = page.locator('[data-ui="effect-catalog.filters"]');
      await expect(filters).toBeVisible();
      await filters.evaluate((element) => element.setAttribute('data-preserved-filters', ''));
      const effectToggle = page
        .locator('[data-settings-collection-item]')
        .first()
        .getByRole('switch');
      await expect(effectToggle).toBeVisible();
      await holdWrite(page);
      await effectToggle.click();
      await expect(effectToggle).toBeDisabled();
      for (const category of await filters.locator('button.effect-catalog-category').all())
        await expect(category).toBeEnabled();
      await expect(filters).toHaveAttribute('data-preserved-filters', '');
      await settle(page);
      await page.screenshot({ path: info.outputPath('effects-pending.png'), fullPage: false });
      await page.evaluate(() => document.dispatchEvent(new Event('release-write')));
      await expect(effectToggle).toBeEnabled();

      await open('access-data', 'permissions');
      const categoryIcon = page.locator('[data-ui="settings.permissions.microphone"] div.h-7.w-7');
      expect(await categoryIcon.evaluate((element) => getComputedStyle(element).color)).toBe(
        await page
          .locator('[data-ui="settings.permissions.microphone"] p')
          .evaluate((element) => getComputedStyle(element).color)
      );
      await page.screenshot({ path: info.outputPath('permissions-neutral.png'), fullPage: false });
      await page
        .getByRole('button', {
          name: text('settings.permissions.requiredGrantsTitle'),
          exact: true,
        })
        .click();
      await expect(
        page.getByText(
          'Доступ к сайтам и приложению Sniptale остаётся отдельным опциональным разрешением.'
        )
      ).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('permissions-required.png'), fullPage: false });

      await open('access-data', 'privacy');
      const remove = page.getByRole('button', {
        name: text('settings.privacy.startDelete'),
        exact: true,
      });
      expect((await remove.boundingBox())!.height).toBeCloseTo(32, 1);
      await remove.click();
      await expect(
        page.getByRole('button', { name: text('settings.privacy.confirmDelete'), exact: true })
      ).toBeVisible();
      await settle(page);
      await page.screenshot({
        path: info.outputPath('privacy-compact-confirmation.png'),
        fullPage: false,
      });
      await page.setViewportSize({ width: 960, height: 560 });
      const viewportRoot = page.locator('.sniptale-settings-viewport');
      expect(
        await viewportRoot.evaluate((element) => element.scrollWidth > element.clientWidth)
      ).toBe(true);
      await viewportRoot.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      await expect(
        page.getByRole('button', { name: text('settings.privacy.startFactoryReset'), exact: true })
      ).toBeInViewport({ ratio: 1 });
    });
  }
}
