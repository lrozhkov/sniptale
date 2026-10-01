import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { startHostServer } from '../support/host-server';

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`image inspector retains edits and compact workspace at HD (${variant.locale}/${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await applyHarnessBootstrap(page, {
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.addInitScript(
        (locale) => localStorage.setItem('sniptale-locale-preference', locale),
        variant.locale
      );
      await page.addInitScript(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#2f5fd0';
        context.fillRect(0, 0, 320, 180);
        context.fillStyle = '#f4c542';
        context.fillRect(40, 40, 120, 70);
        window.__sniptaleHarnessBootstrap = {
          ...window.__sniptaleHarnessBootstrap,
          editorBootstrapPayload: {
            dataUrl: canvas.toDataURL('image/png'),
            title: 'Inspector proof',
            url: 'https://example.com/inspector',
          },
        };
      });
      await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}?theme=${variant.theme}`);
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
        )
        .toBeGreaterThan(0);
      const ui = (value: string) => page.locator(`[data-ui="${value}"]`);
      const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
      await ui('editor.floating.layers.mode.layers').click();
      await page
        .getByRole('button', { name: label('editor.toolbar.unlockLayer'), exact: true })
        .click();
      await page
        .getByRole('button', { name: label('editor.runtime.sourceImage'), exact: true })
        .hover();
      await ui('editor.layers.effects-transformations').first().click();
      const parameters = ui('editor.floating.layer-effects-panel');
      for (const key of [
        'editor.layerEffects.rotateLeft',
        'editor.layerEffects.rotateRight',
      ] as const) {
        await parameters.getByRole('button', { name: label(key), exact: true }).click();
        await expect(parameters).toBeVisible();
      }
      await ui('editor.floating.layer-effects-panel.back').click();
      await expect(parameters).toBeHidden();
      await ui('editor.floating.view-controls.workspace').click();
      const workspace = ui('editor.floating.view-controls.popover.workspace');
      const grid = workspace.getByRole('button', {
        name: label('editor.compact.showGrid'),
        exact: true,
      });
      const size = workspace.getByRole('textbox', {
        name: label('editor.compact.gridSize'),
        exact: true,
      });
      await expect(grid).toHaveAttribute('aria-pressed', 'false');
      await expect(size).toHaveCount(0);
      const row = ui('editor.workspace.background-default-row');
      const makeDefault = row.getByRole('button', {
        name: label('editor.compact.workspaceMakeDefault'),
        exact: true,
      });
      const rowBox = (await row.boundingBox())!;
      const actionBox = (await makeDefault.boundingBox())!;
      expect(actionBox.width).toBeLessThan(rowBox.width / 2);
      expect(actionBox.height).toBeGreaterThanOrEqual(28);
      await grid.click();
      await expect(grid).toHaveAttribute('aria-pressed', 'true');
      await size.fill('42');
      await size.press('Enter');
      const snap = workspace.getByRole('button', {
        name: label('editor.compact.enableGridSnap'),
        exact: true,
      });
      await snap.click();
      await expect(snap).toHaveAttribute('aria-pressed', 'true');
      await grid.click();
      await expect(size).toHaveCount(0);
      await grid.click();
      await expect(size).toHaveValue('42');
      const surface = workspace.locator('.editor-inspector-surface');
      expect(await surface.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
      expect(
        (await workspace.boundingBox())!.y + (await workspace.boundingBox())!.height
      ).toBeLessThanOrEqual(720);
      await ui('editor.floating.view-controls.workspace').click();
      await ui('editor.floating.view-controls.workspace').click();
      await expect(size).toHaveValue('42');
      await expect(snap).toHaveAttribute('aria-pressed', 'true');
      await ui('editor.floating.view-controls.workspace').click();
      await ui('editor.floating.layers.mode.frame').click();
      const group = ui('shared.linked-padding-fields');
      const slider = ui('editor.frame.padding-slider');
      await expect(slider).toBeVisible();
      expect(
        Math.abs((await slider.boundingBox())!.width - (await group.boundingBox())!.width)
      ).toBeLessThanOrEqual(1);
      await group.locator('[data-padding-link="all"]').click();
      await expect(slider).toHaveCount(0);
      await group.locator('[data-padding-link="all"]').click();
      await expect(slider).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('image-inspector-HD.png') });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
