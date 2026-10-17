import type { Locator } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { test, expect } from '../support/extension-fixture';
import { withViewer, capture } from './web-snapshot-viewer-design.spec.fixture';

async function paint(control: Locator) {
  return control.evaluate(async (node) => {
    await Promise.all(
      node
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
    const css = getComputedStyle(node);
    return {
      background: css.backgroundColor,
      border: css.borderTopColor,
      radius: css.borderRadius,
      weight: css.fontWeight,
      height: css.height,
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`snapshot command parity ${theme} ${viewport.name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      await withViewer(
        context,
        extensionId,
        hostOrigin,
        { locale: 'ru', theme, viewport: viewport.size },
        info,
        async ({ viewer: page }) => {
          const tabs = page.locator('[data-ui="web-snapshot-viewer.mode-tabs"]');
          const first = tabs.getByRole('tab').first();
          await capture(page, info, 'snapshot-command-before');
          await expect(first).toHaveCSS('border-radius', '0px');
          const accent = await first.evaluate((node) => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--sniptale-color-accent)';
            node.append(probe);
            const value = getComputedStyle(probe).color;
            probe.remove();
            return value;
          });
          await expect(first).toHaveCSS('border-bottom-color', accent);
          const toolbar = page.locator('[data-ui="web-snapshot-viewer.toolbar"]');
          const download = toolbar.locator('a[download]').first();
          const pdf = toolbar.getByRole('button', {
            name: translate('webSnapshotViewer.app.exportPdf', 'ru'),
            exact: true,
          });
          await page.mouse.move(0, 0);
          expect(await paint(download)).toEqual(await paint(pdf));
          await download.hover();
          const downloadHover = await paint(download);
          await pdf.hover();
          expect(await paint(pdf)).toEqual(downloadHover);
          await tabs.getByRole('tab').nth(1).click();
          const catalog = page.locator('[data-ui="web-snapshot-viewer.catalog-tabs"]');
          await expect(catalog.getByRole('tab').first()).toHaveCSS('border-radius', '0px');
          await expect(catalog.getByRole('tab').first()).toHaveCSS('border-bottom-color', accent);
          await catalog.getByRole('tab').last().click();
          const card = page
            .getByTestId('snapshot-asset-catalog')
            .locator('article')
            .filter({ has: page.locator('img') })
            .first();
          const preview = card.getByRole('button', {
            name: new RegExp(translate('webSnapshotViewer.app.previewAsset', 'ru') + ':'),
          });
          const link = card.locator('a[download]');
          await page.mouse.move(0, 0);
          expect(await paint(preview)).toEqual(await paint(link));
          await preview.hover();
          const hover = await paint(preview);
          await link.hover();
          expect(await paint(link)).toEqual(hover);
          await preview.click();
          await expect(page.getByTestId('snapshot-asset-preview')).toBeVisible();
          await capture(page, info, 'snapshot-command-preview');
        }
      );
    });
  }
}
