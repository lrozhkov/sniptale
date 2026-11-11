import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { startHostServer } from '../support/host-server';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { installImageApiFixture } from './extension-critical-image-ai.helpers';

for (const locale of ['en', 'ru'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`image AI workspace preview, comparison and cyclic count ${locale} ${viewport.name}`, async ({
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
        const count = inspector.locator('[data-ui="editor.ai.variant-count"]');
        const initialCountBounds = await count.boundingBox();
        await count.focus();
        await page.keyboard.press('Enter');
        await expect(count).toHaveText('2');
        await count.click();
        await expect(count).toHaveText('3');
        expect(await count.boundingBox()).toMatchObject({
          width: initialCountBounds!.width,
          height: initialCountBounds!.height,
        });
        await inspector.locator('[data-ui="editor.ai.mode.source"]').click();
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
        expect(panelBounds!.width).toBeLessThanOrEqual(640);
        expect(panelBounds!.x).toBeGreaterThanOrEqual(12);
        expect(panelBounds!.height).toBeLessThanOrEqual(Math.min(600, viewport.size.height - 96));
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
        const compare = preview.locator('[data-ui="editor.ai.preview.compare"]');
        const blend = preview.locator('[data-ui="editor.ai.preview.blend"]');
        const raster = preview.locator('[data-ui="editor.ai.preview.viewport"] svg[role="img"]');
        const scrollOwner = preview.locator('[data-ui="editor.ai.preview.viewport"]');
        await compare.click();
        const divider = preview.locator('[data-ui="editor.ai.preview.divider"]');
        await expect(divider).toBeVisible();
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        );
        const imageBounds = (await raster.boundingBox())!;
        const baseline = await scrollOwner.evaluate((el) => ({
          width: el.clientWidth,
          height: el.clientHeight,
          scrollWidth: el.scrollWidth,
          scrollHeight: el.scrollHeight,
        }));
        for (const fraction of [0, 0.5, 1, 1.1, -0.1]) {
          await page.mouse.move(
            imageBounds.x + imageBounds.width / 2,
            imageBounds.y + imageBounds.height / 2
          );
          await page.mouse.down();
          await page.mouse.move(
            imageBounds.x + imageBounds.width * fraction,
            imageBounds.y + imageBounds.height / 2
          );
          await page.mouse.up();
          expect(
            await scrollOwner.evaluate((el) => ({
              width: el.clientWidth,
              height: el.clientHeight,
              scrollWidth: el.scrollWidth,
              scrollHeight: el.scrollHeight,
            }))
          ).toEqual(baseline);
          const current = (await raster.boundingBox())!;
          expect(Math.abs(current.y - imageBounds.y)).toBeLessThan(0.5);
        }
        await divider.focus();
        await page.keyboard.press('Home');
        await expect(divider).toHaveAttribute('aria-valuenow', '0');
        await page.keyboard.press('End');
        await expect(divider).toHaveAttribute('aria-valuenow', '100');
        await blend.click();
        await expect(compare).toHaveAttribute('aria-pressed', 'false');
        await expect(divider).toHaveCount(0);
        const opacity = preview.getByRole('slider', {
          name: text('editor.ai.opacity'),
          exact: true,
        });
        await opacity.fill('25');
        await expect(preview.locator('[data-ui="editor.ai.preview-image"]')).toHaveAttribute(
          'opacity',
          '0.25'
        );
        await compare.click();
        await expect(blend).toHaveAttribute('aria-pressed', 'false');
        await expect(opacity).toHaveCount(0);
        await compare.click();
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
        await preview.locator('[data-ui="editor.ai.preview.zoom"]').click();
        await expect(preview.locator('[data-ui="editor.ai.preview.zoom"]')).toHaveText('100%');
        await preview.locator('[data-ui="editor.ai.preview.zoom"]').click();
        await preview
          .getByRole('button', { name: text('editor.ai.apply'), exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('workspace-preview.png'), fullPage: false });
        await inspector.locator('[data-ui="editor.ai.generate"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('prompt-actions.png'), fullPage: false });
        await page.keyboard.press('Escape');
        await expect(preview).toBeHidden();
        await expect(prompt).toBeFocused();
        const reopen = inspector.locator('[data-ui="editor.ai.source-attachment"]');
        await reopen.click();
        await preview.locator('[data-ui="editor.ai.preview.close"]').click();
        await expect(reopen).toBeFocused();
        await reopen.click();
        await expect(preview.locator('[data-ui="editor.ai.preview-image"]')).toBeVisible();
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
    await inspector.locator('[data-ui="editor.ai.variant-count"]').click();
    await inspector.locator('[data-ui="editor.ai.variant-count"]').click();
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
    await expect(parameters.locator('summary')).toContainText('1:1 · 768 · PNG');
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

test('image AI pads a tiny reference without resampling or changing the attachment draft', async ({
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
    await installImageApiFixture(page);
    await page.locator('[data-ui="editor.floating.layers.mode.ai"]').click();
    const inspector = page.locator('[data-ui="editor.ai.inspector"]');
    const reference = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 3;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ab1234';
      ctx.fillRect(0, 0, 2, 3);
      return canvas.toDataURL('image/png').split(',')[1]!;
    });
    await inspector.locator('input[type="file"]').setInputFiles({
      name: 'tiny-reference.png',
      mimeType: 'image/png',
      buffer: Buffer.from(reference, 'base64'),
    });
    await expect(inspector.locator('[data-ui="editor.ai.reference-attachment"] img')).toBeVisible();
    await inspector.locator('[data-ui="editor.ai.prompt"]').fill('Use this tiny reference');
    await expect(inspector.locator('[data-ui="editor.ai.generate"]')).toBeEnabled();
    await inspector.locator('[data-ui="editor.ai.generate"]').click();
    await expect(inspector.locator('[data-ui="editor.ai.prompt"]')).toHaveValue('');
    const proof = await page.evaluate(async () => {
      const requests = Reflect.get(window, 'imageAiRequests') as Array<{
        context: {
          images: Array<{ width: number; height: number; dataUrl: string; role: string }>;
        };
      }>;
      const image = requests[0]!.context.images[0]!;
      const bitmap = await createImageBitmap(await (await fetch(image.dataUrl)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] === 255) opaque++;
      return {
        width: image.width,
        height: image.height,
        role: image.role,
        opaque,
        pixel: [...ctx.getImageData(127, 126, 1, 1).data],
        corner: [...ctx.getImageData(0, 0, 1, 1).data],
      };
    });
    expect(proof).toEqual({
      width: 256,
      height: 256,
      role: 'reference',
      opaque: 6,
      pixel: [171, 18, 52, 255],
      corner: [0, 0, 0, 0],
    });
    expect(
      await inspector
        .locator('[data-ui="editor.ai.reference-attachment"] img')
        .evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])
    ).toEqual([2, 3]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
