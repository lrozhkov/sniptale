import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const locale of ['ru', 'en'] as const) {
    test(`mode copy in popup and toolbar ${viewport.name} ${locale}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openDesignReview(
        context,
        extensionId,
        hostOrigin,
        viewport.size
      );
      try {
        await popup.setViewportSize(viewport.size);
        await popup.evaluate(async (value) => {
          await chrome.storage.local.set({ 'sniptale-locale-preference': value });
        }, locale);
        await popup.reload();
        await popup.locator('[data-ui="popup.app.tabs"] button[data-page="tools"]').click();
        const modes = [
          ['cursor', 'cursorLabel', 'cursorDescription'],
          ['drawing', 'drawingLabel', 'drawingEnable'],
          ['highlighter', 'highlighterLabel', 'highlighterEnable'],
          ['quick-edit', 'quickEditLabel', 'quickEditEnable'],
          ['design-review', 'designReviewLabel', 'designReviewEnable'],
          ['video-recording', 'videoRecordingLabel', 'videoRecordingEnable'],
        ] as const;
        for (const [mode, label, hint] of modes) {
          const button = popup.locator(
            `[data-ui="popup.home.tools.${mode === 'cursor' ? 'open' : mode}"]`
          );
          await expect(button).toContainText(translate(`content.toolbar.${label}`, locale));
          await expect(button).toHaveAttribute(
            'data-popup-hint',
            translate(`content.toolbar.${hint}`, locale)
          );
        }
        await popup.screenshot({ path: info.outputPath('popup-mode-copy.png'), fullPage: false });
        await page.bringToFront();
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        for (const [mode, label, hint] of modes) {
          const option = page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`);
          await expect(option).toContainText(translate(`content.toolbar.${label}`, locale));
          await expect(option).toContainText(translate(`content.toolbar.${hint}`, locale));
        }
        await page.screenshot({ path: info.outputPath('toolbar-mode-copy.png'), fullPage: false });
      } finally {
        await page.close();
        await popup.close();
      }
    });
  }
}
