import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { startHostServer } from '../support/host-server';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { installImageApiFixture } from './extension-critical-image-ai.helpers';

for (const locale of ['en', 'ru'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`image AI workspace preview and segmented count ${locale} ${viewport.name}`, async ({
      page,
    }, info) => {
      const host = await startHostServer();
      const text = (key: Parameters<typeof translate>[0]) => translate(key, locale);
      try {
        await page.setViewportSize(viewport.size);
        const dataUrl = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          const context = canvas.getContext('2d')!;
          context.fillStyle = '#f7f7f7';
          context.fillRect(0, 0, 640, 360);
          context.fillStyle = '#d02020';
          context.fillRect(220, 100, 200, 140);
          return canvas.toDataURL('image/png');
        });
        await applyHarnessBootstrap(page, {
          editorBootstrapPayload: { dataUrl, title: 'Image preview proof' },
        });
        await page.addInitScript(
          (locale) => localStorage.setItem('sniptale-locale-preference', locale),
          locale
        );
        await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}?theme=dark`);
        await expect
          .poll(() =>
            page.evaluate(
              () => window.__sniptaleEditorHarness?.getInteractionState().historyReady ?? false
            )
          )
          .toBe(true);
        await installImageApiFixture(page);
        const original = await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage());
        const history = await page.evaluate(
          () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
        );
        await page.locator('[data-ui="editor.floating.layers.mode.ai"]').click();
        const inspector = page.locator('[data-ui="editor.ai.inspector"]');
        const count = inspector.getByRole('group', {
          name: text('editor.ai.variants'),
          exact: true,
        });
        await count.getByRole('button', { name: '2', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(count.getByRole('button', { name: '2', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true'
        );
        await count.getByRole('button', { name: '3', exact: true }).click();
        await inspector
          .getByRole('button', { name: text('editor.ai.source'), exact: true })
          .click();
        await page.getByRole('option', { name: text('editor.ai.main'), exact: true }).click();
        await inspector
          .getByRole('button', { name: text('editor.ai.refreshSource'), exact: true })
          .click();
        const prompt = inspector.locator('[data-ui="editor.ai.prompt"]');
        await prompt.fill('Generate three alternatives');
        await inspector.locator('[data-ui="editor.ai.generate"]').click();
        await expect(prompt).toHaveValue('');
        const preview = page.locator('[data-ui="editor.ai.preview"]');
        await expect(preview).toBeVisible();
        await expect(inspector.locator('[data-ui="editor.ai.preview"]')).toHaveCount(0);
        const [panelBounds, inspectorBounds] = await Promise.all([
          preview.boundingBox(),
          page.locator('[data-ui="editor.floating.layers-panel"]').boundingBox(),
        ]);
        expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(inspectorBounds!.x - 8);
        expect(panelBounds!.width).toBeGreaterThan(280);
        expect(panelBounds!.width).toBeLessThanOrEqual(400);
        expect(panelBounds!.width).toBeLessThanOrEqual((inspectorBounds!.x - 24) * 0.45);
        expect(panelBounds!.height).toBeLessThanOrEqual(400);
        expect(panelBounds!.y).toBeLessThanOrEqual(inspectorBounds!.y);
        expect(panelBounds!.y + panelBounds!.height).toBeGreaterThan(inspectorBounds!.y);
        expect(panelBounds!.height).toBeGreaterThan(250);
        await prompt.fill('Typing continues beside the image');
        await expect(prompt).toBeFocused();
        await preview
          .getByRole('button', { name: `${text('editor.ai.variants')} 2`, exact: true })
          .click();
        await expect(
          preview.getByRole('button', { name: `${text('editor.ai.variants')} 2`, exact: true })
        ).toHaveAttribute('aria-pressed', 'true');
        const selected = await preview
          .locator('[data-ui="editor.ai.preview-image"]')
          .getAttribute('href');
        await preview
          .getByRole('button', { name: text('editor.ai.original'), exact: true })
          .click();
        const source = await page.evaluate(() => {
          const requests = Reflect.get(window, 'imageAiRequests') as Array<{
            context: { images: Array<{ dataUrl: string }> };
          }>;
          return requests[0]!.context.images[0]!.dataUrl;
        });
        await expect(preview.locator('[data-ui="editor.ai.preview-image"]')).toHaveAttribute(
          'href',
          source
        );
        await preview.getByRole('button', { name: text('editor.ai.result'), exact: true }).click();
        await expect(preview.locator('[data-ui="editor.ai.preview-image"]')).toHaveAttribute(
          'href',
          selected!
        );
        await preview.getByRole('button', { name: '100%', exact: true }).click();
        await expect(preview.locator('svg[role="img"]').first()).toHaveAttribute('width', '768');
        await preview
          .getByRole('button', { name: text('editor.ai.fitPreview'), exact: true })
          .click();
        await inspector
          .getByRole('button', { name: text('editor.ai.apply'), exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('workspace-preview.png'), fullPage: false });
        await inspector.locator('[data-ui="editor.ai.generate"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('prompt-actions.png'), fullPage: false });
        await page.keyboard.press('Escape');
        await expect(preview).toBeHidden();
        await expect(prompt).toBeFocused();
        const reopen = inspector.getByRole('button', {
          name: text('editor.ai.openPreview'),
          exact: true,
        });
        await reopen.click();
        await preview
          .getByRole('button', { name: text('common.actions.close'), exact: true })
          .click();
        await expect(reopen).toBeFocused();
        await inspector
          .locator('summary')
          .filter({ hasText: text('editor.ai.sourcePreview') })
          .click();
        await inspector
          .getByRole('button', { name: text('editor.ai.openSourcePreview'), exact: true })
          .click();
        await expect(
          preview.getByRole('img', { name: text('editor.ai.editArea'), exact: true })
        ).toBeVisible();
        await page.screenshot({ path: info.outputPath('attachment-preview.png'), fullPage: false });
        await page.locator('[data-ui="editor.floating.layers.mode.layers"]').click();
        await expect(preview).toBeHidden();
        expect(await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage())).toBe(
          original
        );
        expect(
          await page.evaluate(
            () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
          )
        ).toBe(history);
      } finally {
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}

test('image AI defaults follow explicit model choice and preserve provider-default intent', async ({
  page,
}) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1280, height: 560 });
    await applyHarnessBootstrap(page, {});
    await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
    await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}`);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__sniptaleEditorHarness?.getInteractionState().historyReady ?? false
        )
      )
      .toBe(true);
    await installImageApiFixture(page, false, true);
    await page.locator('[data-ui="editor.floating.layers.mode.ai"]').click();
    const inspector = page.locator('[data-ui="editor.ai.inspector"]');
    await inspector
      .getByRole('group', { name: 'Variants', exact: true })
      .getByRole('button', { name: '3', exact: true })
      .click();
    await inspector.locator('.sniptale-ai-model-selector-trigger').click();
    await page
      .getByRole('button', {
        name: 'Image model with a deliberately long descriptive name',
        exact: true,
      })
      .click();
    const parameters = inspector
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: 'Image parameters' }) });
    await expect(parameters.locator('summary')).toContainText('768 · 1:1 · PNG');
    await parameters.locator('summary').click();
    await inspector.getByRole('button', { name: 'Resolution', exact: true }).click();
    await page.getByRole('option', { name: 'Provider default', exact: true }).click();
    await expect(inspector.getByRole('button', { name: 'Resolution', exact: true })).toContainText(
      'Provider default'
    );
    await inspector
      .locator('[data-ui="editor.ai.prompt"]')
      .fill('Use the explicit provider default');
    await inspector.locator('[data-ui="editor.ai.generate"]').click();
    await expect(inspector.locator('[data-ui="editor.ai.prompt"]')).toHaveValue('');
    const sent = await page.evaluate(() => {
      const requests = Reflect.get(window, 'imageAiRequests') as Array<{
        context: { parameters: Record<string, unknown> };
      }>;
      return JSON.parse(JSON.stringify(requests[0]!.context.parameters));
    });
    expect(sent).toMatchObject({ variants: 3, aspectRatio: '1:1', outputFormat: 'png' });
    expect(sent).not.toHaveProperty('resolution');
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
