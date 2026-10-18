import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

const t = createTranslator('ru');
for (const theme of SCENARIO_VISUAL_THEMES) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`narration recording inspector ${theme} ${viewport.name}`, async ({
      hostOrigin,
    }, info) => {
      const launched = await launchExtensionBrowser({
        viewport: viewport.size,
        fakeMediaDevices: true,
      });
      const page = await launched.context.newPage();
      page.setDefaultTimeout(10_000);
      try {
        await openVisualHarness(page, hostOrigin, theme, 'ru', viewport.size, 'compare', {
          tourFixture: '1',
        });
        await page
          .getByRole('button', { name: t('scenario.editor.tourMode'), exact: true })
          .click();
        const original = page.locator('#guide-inspector-panel');
        const identity = await original.elementHandle();
        const category = (name: string) =>
          original.getByRole('navigation').getByRole('button', { name, exact: true });
        await category(t('scenario.editor.tourObjects')).click();
        await original
          .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
          .click();
        await original
          .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
          .click();
        await category(t('scenario.editor.tourNarration')).click();
        const entry = original.getByRole('button', {
          name: t('scenario.editor.tourRecord'),
          exact: true,
        });
        await entry.click();
        const recorder = page.locator('[data-ui="audio-recording.inspector"]');
        await expect(recorder).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(original).toBeHidden();
        expect(await original.evaluate((node, previous) => node === previous, identity)).toBe(true);
        await expect(page.locator('.guide-page-header')).toBeVisible();
        await expect(page.locator('.guide-center-panel')).toHaveAttribute('inert');
        await expect(recorder.locator('[aria-modal]')).toHaveCount(0);
        await page.screenshot({ path: info.outputPath('narration-idle.png'), fullPage: false });
        await recorder
          .getByRole('button', { name: t('videoEditor.app.recordAudioStart'), exact: true })
          .click();
        const pause = recorder.getByRole('button', {
          name: t('videoEditor.app.recordAudioPause'),
          exact: true,
        });
        await expect(pause).toBeVisible();
        await expect(recorder.getByText('00:01', { exact: true })).toBeVisible();
        await page.screenshot({
          path: info.outputPath('narration-recording.png'),
          fullPage: false,
        });
        await pause.click();
        await recorder
          .getByRole('button', { name: t('videoEditor.app.recordAudioResume'), exact: true })
          .click();
        await recorder
          .getByRole('button', { name: t('videoEditor.app.recordAudioStop'), exact: true })
          .click();
        await expect(recorder.locator('audio')).toHaveCount(1);
        await recorder
          .getByRole('button', { name: t('scenario.editor.tourAudioApply'), exact: true })
          .focus();
        await page.keyboard.press('Control+z');
        await expect(page.locator('.tour-stage-host .tour-hotspot')).toHaveCount(1);
        await page.screenshot({ path: info.outputPath('narration-take.png'), fullPage: false });
        await page.keyboard.press('Escape');
        await page
          .getByRole('button', { name: t('videoEditor.app.recordAudioKeep'), exact: true })
          .click();
        await expect(recorder.locator('audio')).toHaveCount(1);
        await recorder
          .getByRole('button', { name: t('scenario.editor.tourAudioApply'), exact: true })
          .click();
        await expect(recorder).toHaveCount(0);
        await expect(original).toBeVisible();
        await expect(original.locator('.tour-audio-binding')).toBeVisible();
        await expect(entry).toBeFocused();
        await expect(page.locator('.guide-center-panel')).not.toHaveAttribute('inert');
        await page.screenshot({ path: info.outputPath('narration-attached.png'), fullPage: false });
        await page
          .locator('.guide-page-header')
          .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
          .click();
        const documentTitle = await original.locator('.guide-panel-heading h2').textContent();
        const library = page.locator('#guide-library-panel');
        await library
          .locator('.guide-left-navigation')
          .getByRole('button', { name: t('scenario.editor.guideResources'), exact: true })
          .click();
        const resourceMenu = library.locator(
          '.tour-audio-acquisition .guide-action-menu-anchor > button'
        );
        const openResourceRecorder = async () => {
          await resourceMenu.click();
          await page
            .getByRole('button', { name: t('scenario.editor.tourRecord'), exact: true })
            .click();
          await expect(recorder).toBeVisible();
        };
        await openResourceRecorder();
        await recorder
          .getByRole('button', { name: t('common.actions.cancel'), exact: true })
          .click();
        await expect(original.locator('.guide-panel-heading h2')).toHaveText(documentTitle!);
        await original
          .locator('.guide-panel-heading')
          .getByRole('button', { name: t('scenario.editor.close'), exact: true })
          .click();
        await expect(original).toBeHidden();
        await openResourceRecorder();
        await recorder
          .getByRole('button', { name: t('common.actions.cancel'), exact: true })
          .click();
        await expect(original).toBeHidden();
        await expect(resourceMenu).toBeFocused();
      } finally {
        await closeExtensionBrowser(launched);
      }
    });
  }
}

test('narrow narration inspector retains trim and footer controls through its scroll owners', async ({
  hostOrigin,
}, info) => {
  const size = PRIMARY_BROWSER_VIEWPORTS[0].size;
  const launched = await launchExtensionBrowser({ viewport: size, fakeMediaDevices: true });
  const page = await launched.context.newPage();
  page.setDefaultTimeout(10_000);
  try {
    await openVisualHarness(page, hostOrigin, 'light', 'ru', size, 'compare', { tourFixture: '1' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const original = page.locator('#guide-inspector-panel');
    await original
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourNarration'), exact: true })
      .click();
    const divider = page.locator('.guide-panel-divider-right');
    const rect = (await divider.boundingBox())!;
    const width = (await original.boundingBox())!.width;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + width - 260, rect.y + rect.height / 2);
    await page.mouse.up();
    await expect.poll(async () => (await original.boundingBox())!.width).toBeCloseTo(260, 0);
    await original
      .getByRole('button', { name: t('scenario.editor.tourRecord'), exact: true })
      .click();
    const recorder = page.locator('[data-ui="audio-recording.inspector"]');
    await recorder
      .getByRole('button', { name: t('videoEditor.app.recordAudioStart'), exact: true })
      .click();
    await expect(recorder.getByText('00:01', { exact: true })).toBeVisible();
    await recorder
      .getByRole('button', { name: t('videoEditor.app.recordAudioStop'), exact: true })
      .click();
    await expect(recorder.locator('audio')).toHaveCount(1);
    await expect
      .poll(() => recorder.evaluate((node) => node.scrollWidth - node.clientWidth))
      .toBeLessThanOrEqual(1);
    const clipping = await recorder.evaluate((node) =>
      [...node.querySelectorAll('button')]
        .filter((button) => button.getBoundingClientRect().width > 0)
        .filter((button) => {
          const box = button.getBoundingClientRect();
          const owner = button.closest('.sniptale-modal-body-sm, .sniptale-modal-footer-sm');
          if (!owner) return false;
          const bounds = owner.getBoundingClientRect();
          return box.left < bounds.left - 1 || box.right > bounds.right + 1;
        })
        .map((button) => button.getAttribute('aria-label') ?? button.textContent)
    );
    expect(clipping).toEqual([]);
    const save = recorder.getByRole('button', {
      name: t('scenario.editor.tourAudioApply'),
      exact: true,
    });
    await save.scrollIntoViewIfNeeded();
    const saveBox = (await save.boundingBox())!;
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(size.height);
    await page.screenshot({ path: info.outputPath('narrow-take.png'), fullPage: false });
    await page.setViewportSize({ width: 1100, height: 560 });
    const viewport = page.locator('.guide-editor-viewport');
    expect(await viewport.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeGreaterThan(
      0
    );
    await viewport.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    await save.click();
    await expect(recorder).toHaveCount(0);
    await expect(original.locator('.tour-audio-binding')).toBeVisible();
    await page.screenshot({ path: info.outputPath('below-minimum-attached.png'), fullPage: false });
  } finally {
    await closeExtensionBrowser(launched);
  }
});
