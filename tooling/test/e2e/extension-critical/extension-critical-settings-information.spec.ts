import type { Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { test, expect } from '../support/extension-fixture';
const text = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
async function configure(page: Page, extensionId: string, theme: 'light' | 'dark') {
  const base = `chrome-extension://${extensionId}/apps/extension/src/settings/index.html`;
  await page.goto(`${base}?section=interface-browser&view=interface`);
  await expect(page.locator('#settings-interface-language')).toBeEnabled();
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
  await page.evaluate(async (theme) => {
    localStorage.setItem('sniptale-locale-preference', 'ru');
    await chrome.storage.local.set({
      'sniptale-locale-preference': 'ru',
      'sniptale-theme-preference': theme,
    });
  }, theme);
  return base;
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`settings information and retention ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      const base = await configure(page, extensionId, theme);
      await page.goto(`${base}?section=saving&view=files`);
      const overrides = page.locator('details').filter({
        has: page.locator('summary').filter({ hasText: text('settings.filenameRules.overrides') }),
      });
      const summary = overrides.locator('summary');
      await expect(summary).toBeVisible();
      await summary.scrollIntoViewIfNeeded();
      await settle(page);
      await page.screenshot({ path: info.outputPath('filename-before.png'), fullPage: false });
      await expect(summary).toHaveCSS('display', 'flex');
      await expect(summary).toHaveCSS('padding-left', '8px');
      await summary.focus();
      await page.keyboard.press('Enter');
      const imageName = overrides.getByRole('textbox').first();
      await imageName.fill('Draft_{date}');
      await summary.click();
      await summary.click();
      await expect(imageName).toHaveValue('Draft_{date}');
      const preview = page.locator('details').filter({
        has: page.locator('summary').filter({ hasText: text('settings.filenameRules.preview') }),
      });
      await preview.locator('summary').click();
      await expect(preview.locator('output').first()).toBeVisible();
      await preview.locator('summary').click();
      await imageName.fill('{bad}');
      await expect(overrides.getByRole('alert').first()).toBeVisible();
      await expect(
        page.getByRole('button', { name: text('settings.filenameRules.save'), exact: true })
      ).toBeDisabled();
      await imageName.fill('Draft_{date}');
      await preview.locator('summary').click();
      await settle(page);
      await page.screenshot({ path: info.outputPath('filename-expanded.png'), fullPage: false });
      await page.goto(`${base}?section=saving&view=drafts`);
      for (const key of ['cleanupEnabled', 'trashCleanupEnabled'] as const) {
        const control = page.getByRole('switch', {
          name: text(`settings.storageDrafts.${key}`),
          exact: true,
        });
        await control.scrollIntoViewIfNeeded();
        const row = control.locator(
          'xpath=ancestor::*[contains(@class,"sniptale-parameter-row")][1]'
        );
        const label = row.locator('.sniptale-parameter-name');
        const a = await label.boundingBox();
        const b = await control.boundingBox();
        expect(Math.abs(a!.y + a!.height / 2 - (b!.y + b!.height / 2))).toBeLessThan(3);
      }
      for (const key of [
        'retentionConsequence',
        'trashRetentionConsequence',
        'trashCleanupDescription',
      ] as const) {
        await expect(
          page.getByText(text(`settings.storageDrafts.${key}`), { exact: true })
        ).toBeVisible();
      }
      await page
        .getByText(text('settings.storageDrafts.newItemsTitle'), { exact: true })
        .scrollIntoViewIfNeeded();
      await settle(page);
      await page.screenshot({ path: info.outputPath('draft-retention.png'), fullPage: false });
    });
  }
}

test('settings disclosure stays reachable at narrow viewport and layout boundary', async ({
  page,
  extensionId,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const base = await configure(page, extensionId, 'light');
  await page.goto(`${base}?section=saving&view=files`);
  const overrides = page.locator('[data-ui="settings.filename-overrides"]');
  const summary = overrides.locator('summary');
  for (const width of [639, 640, 641, 1100]) {
    await page.setViewportSize({ width, height: 560 });
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    await page.keyboard.press('Space');
    await expect(overrides.getByRole('textbox').first()).toBeVisible();
    await page.keyboard.press('Space');
    await expect(overrides).not.toHaveAttribute('open', '');
    expect(
      await page
        .locator('.sniptale-settings-viewport')
        .evaluate((node) => node.scrollWidth > node.clientWidth)
    ).toBe(true);
  }
  await settle(page);
  await page.screenshot({
    path: info.outputPath('information-narrow-scroll.png'),
    fullPage: false,
  });
});

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
}
