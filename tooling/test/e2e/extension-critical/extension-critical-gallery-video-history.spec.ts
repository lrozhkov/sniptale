import { expect, test } from '@playwright/test';
import { translate } from '../support/catalog-fixture';
import { startHostServer } from '../support/host-server';
import {
  addReviewFocus,
  installReviewModeChoice,
  seedReviewVideo,
} from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { numericControl, openNumericControl } from '../support/inspector-numeric';

test.use({ actionTimeout: 10_000 });

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const, viewport: PRIMARY_BROWSER_VIEWPORTS[0] },
  { locale: 'en' as const, theme: 'dark' as const, viewport: PRIMARY_BROWSER_VIEWPORTS[1] },
]) {
  test(`quick editor edit history and reset (${variant.locale}/${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    const more = button('gallery.videoReview.moreActions');
    const historyItem = dialog.getByRole('menuitem', {
      name: label('gallery.videoReview.editHistoryTitle'),
      exact: true,
    });
    const openHistory = async () => {
      await more.click();
      await historyItem.click();
    };
    const inspector = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
    const history = inspector.locator('[data-ui="gallery.videoReview.editHistory"]');
    const rows = history.getByRole('listitem');
    const current = history.locator('[aria-current="step"]');
    const reset = history.getByRole('button', {
      name: label('gallery.videoReview.historyReset'),
      exact: true,
    });
    const volumeLabel = label('gallery.videoReview.volume');
    const volume = numericControl(inspector, volumeLabel);
    const showVolume = async () => {
      await dialog
        .locator('[data-review-header-track="originalAudio"] [data-review-track-select]')
        .click();
      await inspector.getByRole('tab', { name: volumeLabel, exact: true }).click();
    };
    const closeEditor = async () => {
      await more.click();
      await dialog
        .getByRole('menuitem', { name: label('common.actions.close'), exact: true })
        .click();
    };
    const enter = page.locator('[data-ui="gallery.videoReview.enter"]');
    const reopenEditor = async () => {
      await enter.click();
      await page
        .locator('[data-ui="gallery.preview.inspector"] button.gallery-preview-related')
        .filter({ hasText: 'beta-v1.webm' })
        .click();
      await showVolume();
    };
    try {
      await page.setViewportSize(variant.viewport.size);
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await installReviewModeChoice(page, 'advanced');
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await enter.click();
      await showVolume();
      for (const value of ['40', '70']) {
        await (await openNumericControl(inspector, volumeLabel)).fill(value);
        await volume.press('Enter');
        // Leaving flushes this debounced edit into its own durable history step.
        await closeEditor();
        await reopenEditor();
      }
      await expect(volume).toHaveValue('70');
      await expect(button('gallery.videoReview.historyReset')).toHaveCount(0);
      await expect(historyItem).toHaveCount(0);
      await expect(button('gallery.videoReview.editHistoryTitle')).toHaveCount(0);
      await more.press('ArrowDown');
      await historyItem.press('Enter');
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await expect(history).toBeVisible();
      await expect(rows).toHaveCount(4);
      expect(
        await rows.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-history-step'))
        )
      ).toEqual(['3', '2', '1', '0']);
      await expect(
        rows.filter({ hasText: label('gallery.videoReview.audioOriginal') })
      ).toHaveCount(2);
      await expect(rows.nth(1)).toContainText(/40\s*%/);
      await expect(rows.first()).toContainText(/70\s*%/);
      await expect(rows.nth(2)).toContainText(
        label('gallery.videoReview.editHistoryEnabled').replace(
          '{item}',
          label('gallery.videoReview.zoomTrack')
        )
      );
      await expect(current).toHaveAttribute('data-history-step', '3');
      await expect(reset).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('edit-history.png'), fullPage: false });
      await rows.nth(2).getByRole('button').click();
      await expect(current).toHaveAttribute('data-history-step', '1');
      await expect(button('gallery.videoReview.redo')).toBeEnabled();
      await closeEditor();
      await reopenEditor();
      await expect(volume).toHaveValue('100');
      await openHistory();
      await expect(current).toHaveAttribute('data-history-step', '1');
      await rows.first().getByRole('button').press('Enter');
      await expect(current).toHaveAttribute('data-history-step', '3');
      await reset.click();
      const choices = dialog.locator('[data-ui="gallery.videoReview.historyChoices"]');
      await expect(choices).toBeVisible();
      await expect(choices).toHaveCSS('opacity', '1');
      const panelColor = await choices.evaluate((node) => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--sniptale-color-surface-panel)';
        node.appendChild(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      });
      await expect(choices).toHaveCSS('background-color', panelColor);
      await expect(choices).toHaveCSS('backdrop-filter', /blur\(/);
      const bounds = (await choices.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(variant.viewport.size.height);
      await page.screenshot({ path: testInfo.outputPath('history-choices.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(choices).toHaveCount(0);
      await expect(reset).toBeFocused();
      await expect(current).toHaveAttribute('data-history-step', '3');
      await reset.click();
      await choices.locator('[data-history-start]').click();
      await expect(current).toHaveAttribute('data-history-step', '0');
      await expect(rows.last()).toHaveAttribute('aria-current', 'step');
      await expect(
        rows.filter({ hasText: label('gallery.videoReview.editHistoryUndone') })
      ).toHaveCount(3);
      await expect(button('gallery.videoReview.undo')).toBeDisabled();
      await expect(button('gallery.videoReview.redo')).toBeEnabled();
      await closeEditor();
      await reopenEditor();
      await expect(volume).toHaveValue('100');
      // First entry into advanced mode enables zoom and contributes the first history step.
      await button('gallery.videoReview.redo').click();
      await expect(volume).toHaveValue('100');
      await button('gallery.videoReview.redo').click();
      await expect(volume).toHaveValue('40');
      await button('gallery.videoReview.redo').click();
      await expect(volume).toHaveValue('70');
      await openHistory();
      await reset.click();
      await choices.locator('[data-history-original]').click();
      const confirm = dialog.getByRole('alertdialog');
      await expect(confirm).toBeVisible();
      await confirm
        .getByRole('button', { name: label('gallery.videoReview.resetCancel'), exact: true })
        .click();
      await expect(choices).toBeVisible();
      await expect(current).toHaveAttribute('data-history-step', '3');
      await choices.locator('[data-history-original]').click();
      await confirm
        .getByRole('button', { name: label('gallery.videoReview.resetOriginal'), exact: true })
        .click();
      await expect(confirm).toHaveCount(0);
      await expect(rows).toHaveCount(1);
      await expect(current).toHaveAttribute('data-history-step', '0');
      await expect(button('gallery.videoReview.redo')).toBeDisabled();
      await closeEditor();
      await reopenEditor();
      await expect(volume).toHaveValue('100');
      await expect(button('gallery.videoReview.redo')).toBeDisabled();
      await openHistory();
      await reset.click();
      await expect(choices.locator('[data-history-start]')).toBeDisabled();
      await page.keyboard.press('Escape');
      await inspector
        .getByRole('button', {
          name: label('gallery.videoReview.audioOriginal'),
          exact: true,
        })
        .click();
      await expect(history).toHaveCount(0);
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await addReviewFocus(page, variant.locale);
      const scaleLabel = label('gallery.videoReview.zoomScale');
      const scale = numericControl(inspector, scaleLabel);
      await (await openNumericControl(inspector, scaleLabel)).fill('2');
      await scale.press('Enter');
      await openHistory();
      await expect(rows.first()).toContainText(label('gallery.videoReview.editHistoryFocusRegion'));
      await expect(rows.first()).toContainText(scaleLabel);
      await expect(rows.first()).toContainText('→ 2×');
      await page.screenshot({
        path: testInfo.outputPath('focus-scale-history.png'),
        fullPage: false,
      });
      await closeEditor();
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
