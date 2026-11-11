import { expect, test } from '@playwright/test';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { startHostServer } from '../support/host-server';
import { installImageApiFixture } from './extension-critical-image-ai.helpers';

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`image AI resolves incompatible model parameters explicitly at ${viewport.width}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize(viewport);
      const dataUrl = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        return canvas.toDataURL('image/png');
      });
      await applyHarnessBootstrap(page, {
        editorBootstrapPayload: { dataUrl, title: 'Model parameters' },
      });
      await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
      await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}?theme=dark`);
      await expect
        .poll(() =>
          page.evaluate(
            () => window.__sniptaleEditorHarness?.getInteractionState().historyReady ?? false
          )
        )
        .toBe(true);
      await installImageApiFixture(page);
      await page.locator('[data-ui="editor.floating.layers.mode.ai"]').click();
      const inspector = page.locator('[data-ui="editor.ai.inspector"]');
      await inspector.getByRole('button', { name: 'Variants', exact: true }).click();
      await page.getByRole('option', { name: '3', exact: true }).click();
      await inspector.locator('summary').filter({ hasText: 'Parameters' }).click();
      await inspector.getByRole('button', { name: 'Resolution', exact: true }).click();
      await page.getByRole('option', { name: '4K', exact: true }).click();
      await inspector.getByRole('button', { name: 'Aspect ratio', exact: true }).click();
      await page.getByRole('option', { name: '16:9', exact: true }).click();
      await inspector.getByRole('button', { name: /Image model with a deliberately/ }).click();
      await page.getByRole('button', { name: 'Gemini image test model', exact: true }).click();
      await inspector.locator('[data-ui="editor.ai.prompt"]').fill('Keep my compatible settings');
      await expect(inspector.locator('[data-ui="editor.ai.generate"]')).toBeDisabled();
      await expect(inspector.getByText('4K · png', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => Reflect.get(window, 'imageAiRequests'))).toEqual([]);
      await inspector
        .getByRole('button', { name: 'Adapt settings', exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('incompatible-model-parameters.png'),
        fullPage: false,
      });
      await inspector.getByRole('button', { name: 'Adapt settings', exact: true }).click();
      await expect(inspector.locator('[data-ui="editor.ai.generate"]')).toBeEnabled();
      await inspector.locator('[data-ui="editor.ai.generate"]').click();
      await expect(inspector.locator('[data-ui="editor.ai.result"]')).toBeVisible();
      const submitted = await page.evaluate(() => {
        const requests = Reflect.get(window, 'imageAiRequests') as Array<{
          context: { parameters: unknown };
          modelId: string;
        }>;
        return {
          count: requests.length,
          parameters: requests[0]?.context.parameters,
          modelId: requests[0]?.modelId,
        };
      });
      expect(submitted).toMatchObject({
        count: 1,
        modelId: '10000000-0000-4000-8000-000000000003',
        parameters: { variants: 3, resolution: '1K', aspectRatio: '16:9' },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
