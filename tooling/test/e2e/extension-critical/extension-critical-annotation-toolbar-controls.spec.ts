import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { translate } from '../../../../apps/extension/src/platform/i18n';

test.setTimeout(90000);
test.use({ actionTimeout: 10000 });

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
  await page.locator('.sniptale-annotation-effect-switch').evaluateAll(async (elements) => {
    await Promise.all(
      elements
        .flatMap((element) => element.getAnimations({ subtree: true }))
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
  await page.screenshot({ path: info.outputPath(name), fullPage: false });
}

const panel = (page: Page) =>
  page
    .locator('.sniptale-content-popover--toolbar-menu:visible')
    .filter({ has: page.locator('.sniptale-settings-popover-header') });

async function verifyCreation(page: Page, toolbar: Locator, info: TestInfo) {
  const effects = toolbar.locator('.sniptale-annotation-effect-switch');
  await expect(effects.locator('[data-frame-effect]')).toHaveCount(3);
  for (const mode of ['blur', 'focus', 'border'] as const) {
    const option = effects.locator(`[data-frame-effect="${mode}"]`);
    if ((await option.getAttribute('aria-pressed')) !== 'true') {
      if (mode === 'focus') {
        await option.focus();
        await option.press('Enter');
        await expect(option).toBeFocused();
      } else await option.click();
    }
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page)).toHaveCount(0);
    await expect
      .poll(() =>
        option.evaluate((element) => {
          const style = getComputedStyle(element);
          return style.borderTopColor === style.color;
        })
      )
      .toBe(true);
    await effects.locator('button[aria-haspopup="dialog"]').click();
    await expect(panel(page)).toHaveCount(1);
    await expect(panel(page).locator('.sniptale-frame-effect-mode-section')).toHaveCount(0);
    if (mode === 'blur')
      await expect(
        panel(page).getByText(translate('content.overlayControls.blurTypeLabel', 'en'), {
          exact: true,
        })
      ).toBeVisible();
    if (mode === 'focus')
      await expect(
        panel(page).getByText(translate('content.overlayControls.focusDimmingLabelPrefix', 'en'), {
          exact: true,
        })
      ).toBeVisible();
    await capture(page, info, `creation-${mode}.png`);
    await effects.locator('button[aria-haspopup="dialog"]').click();
    await expect(panel(page)).toHaveCount(0);
  }
  for (const kind of ['callout', 'step-badge']) {
    const primary = toolbar.locator(`[data-ui="content.toolbar.future-frame-${kind}"]`);
    await expect(primary).toBeVisible();
    const before = await primary.getAttribute('aria-pressed');
    await primary.click();
    await expect(primary).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
    await toolbar.locator(`[data-ui="content.toolbar.future-frame-${kind}.menu"]`).click();
    await expect(panel(page)).toHaveCount(1);
    await toolbar.locator(`[data-ui="content.toolbar.future-frame-${kind}.menu"]`).click();
    await primary.click();
  }
}

async function verifySelected(page: Page, info: TestInfo) {
  const toolbar = page.locator('.sniptale-action-toolbar:visible');
  await expect(toolbar).toHaveCount(1);
  for (const mode of ['blur', 'focus', 'border'] as const) {
    const option = toolbar.locator(`[data-frame-effect="${mode}"]`);
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page)).toHaveCount(0);
    await capture(page, info, `selected-${mode}.png`);
  }
  await expect(toolbar.locator('.sniptale-annotation-menu-control')).toHaveCount(2);
  const numbering = toolbar
    .locator('.sniptale-annotation-menu-control button[aria-pressed]')
    .first();
  const before = await numbering.getAttribute('aria-pressed');
  await numbering.click();
  await expect(numbering).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await expect(panel(page)).toHaveCount(0);
  await numbering.click();
  await expect(numbering).toHaveAttribute('aria-pressed', before!);
  await toolbar.locator('.sniptale-annotation-effect-switch > button').click();
  await expect(panel(page)).toHaveCount(1);
  await expect(panel(page).locator('.sniptale-frame-effect-mode-section')).toHaveCount(0);
  await panel(page).locator('[data-settings-action="close"]').click();
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`content annotation controls ${name} ${orientation}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      await popup.evaluate(
        async (theme) =>
          chrome.storage.local.set({
            'sniptale-theme-preference': theme,
            'sniptale-locale-preference': 'en',
          }),
        size.width === 1920 ? 'dark' : 'light'
      );
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.highlighter"]').click();
      const toolbar = page.locator('[data-ui="content.toolbar.root"]');
      {
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        const display = page.getByRole('button', {
          name:
            orientation === 'vertical'
              ? /Vertical view|Вертикальный вид/u
              : /Horizontal view|Горизонтальный вид/u,
        });
        if (!(await display.isVisible()))
          await page
            .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
            .click();
        await display.click();
        await page.keyboard.press('Escape');
      }
      await expect(toolbar).toHaveAttribute('data-display-mode', orientation);
      await expect
        .poll(async () => {
          const bounds = (await toolbar.boundingBox())!;
          return Math.max(
            -bounds.y,
            bounds.y + bounds.height - size.height,
            -bounds.x,
            bounds.x + bounds.width - size.width
          );
        })
        .toBeLessThanOrEqual(1);
      await verifyCreation(page, toolbar, info);
      const target = (await page.locator('#measurement-target').boundingBox())!;
      await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
      await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
      await expect
        .poll(async () => {
          await page.mouse.move(target.x - 3, target.y + 10);
          return page.locator('.sniptale-frame-toolbar-trigger').isVisible();
        })
        .toBe(true);
      await page.locator('.sniptale-frame-toolbar-trigger').click();
      await verifySelected(page, info);
      if (orientation === 'horizontal' && size.width === 1280) {
        await page.setViewportSize({ width: 1100, height: 560 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
          .toBeLessThanOrEqual(1);
      }
      await page.close();
      await popup.close();
    });
  }

  test(`image editor annotation controls ${name}`, async ({ page, hostOrigin }, info) => {
    await page.setViewportSize(size);
    await applyHarnessBootstrap(page, {
      storage: {
        'sniptale-locale-preference': 'en',
        'sniptale-theme-preference': size.width === 1920 ? 'dark' : 'light',
      },
    });
    await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
    await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
    await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
      )
      .toBeGreaterThan(0);
    const toolbar = page.locator('[data-ui="editor.floating.tool-rail"]');
    await toolbar.locator('[data-frame-effect="blur"]').click();
    await verifyCreation(page, toolbar, info);
    const plane = (await page.locator('[data-ui="editor.frame-annotation-plane"]').boundingBox())!;
    await page.mouse.move(plane.x + plane.width / 2 - 80, plane.y + plane.height / 2 - 50);
    await page.mouse.down();
    await page.mouse.move(plane.x + plane.width / 2 + 80, plane.y + plane.height / 2 + 50, {
      steps: 4,
    });
    await page.mouse.up();
    await verifySelected(page, info);
  });
}
