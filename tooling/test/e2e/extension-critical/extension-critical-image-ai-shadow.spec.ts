import { expect, test } from '@playwright/test';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../apps/extension/src/features/editor/document/constants';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { startHostServer } from '../support/host-server';
import { installImageApiFixture } from './extension-critical-image-ai.helpers';

// An unchanged model response must preserve the rendered shadow when the original layer is hidden.
test('image AI captures full layer shadow and replaces it without losing pixels', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1920, height: 900 });
    const { dataUrl, layerDataUrl } = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 640, 360);
      const dataUrl = canvas.toDataURL('image/png');
      canvas.width = 80;
      canvas.height = 50;
      context.fillStyle = '#ff0000';
      context.fillRect(0, 0, 80, 50);
      return { dataUrl, layerDataUrl: canvas.toDataURL('image/png') };
    });
    const object = {
      type: 'Image',
      left: 160,
      top: 120,
      originX: 'left',
      originY: 'top',
      width: 80,
      height: 50,
      scaleX: 1,
      scaleY: 1,
      strokeWidth: 0,
      src: layerDataUrl,
      visible: true,
      shadow: { color: '#000000', offsetX: 55, offsetY: 20, blur: 12 },
      sniptaleId: 'shadow-proof',
      sniptaleRole: 'annotation',
      sniptaleType: 'image',
      sniptaleLabel: 'Shadow proof',
      sniptaleImageShadow: 100,
      sniptaleImageShadowAngle: 20,
      sniptaleImageShadowBlur: 12,
      sniptaleImageShadowDistance: 58.52,
      sniptaleImageShadowColor: '#000000',
    };
    await applyHarnessBootstrap(page, {
      storage: { 'sniptale-locale-preference': 'en' },
      editorBootstrapPayload: {
        dataUrl,
        document: {
          version: 2,
          sourceImageData: dataUrl,
          sourceName: 'Shadow proof',
          sourceWidth: 640,
          sourceHeight: 360,
          canvasWidth: 640,
          canvasHeight: 360,
          sourceLeft: 0,
          sourceTop: 0,
          sourceDisplayWidth: 640,
          sourceDisplayHeight: 360,
          frame: {
            ...DEFAULT_EDITOR_FRAME_SETTINGS,
            paddingTop: 0,
            paddingRight: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            backgroundMode: 'color',
            backgroundColor: '#ffffff',
          },
          canvasJson: JSON.stringify({ objects: [object] }),
        },
      },
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
    await installImageApiFixture(page, true);
    await page.locator('[data-ui="editor.floating.layers.mode.layers"]').click();
    await page
      .locator('[data-ui="editor.layers.list-viewport"] button[aria-pressed]')
      .first()
      .click();
    const before = await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage());
    const history = await page.evaluate(
      () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
    );
    await page.locator('[data-ui="editor.floating.layers.mode.ai"]').click();
    const inspector = page.locator('[data-ui="editor.ai.inspector"]');
    await inspector.getByRole('button', { name: 'Work with', exact: true }).click();
    await page.getByRole('option', { name: 'Selected layers · 1', exact: true }).click();
    await inspector.getByRole('button', { name: 'Use current selection', exact: true }).click();
    await inspector.locator('[data-ui="editor.ai.prompt"]').fill('Return the source unchanged');
    await inspector.locator('[data-ui="editor.ai.generate"]').click();
    await expect(inspector.locator('[data-ui="editor.ai.result"]')).toBeVisible();
    const pixels = await page.evaluate(async () => {
      const requests = Reflect.get(window, 'imageAiRequests') as Array<{
        context: { images: Array<{ dataUrl: string }> };
      }>;
      const bitmap = await createImageBitmap(
        await (await fetch(requests[0]!.context.images[0]!.dataUrl)).blob()
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let redRight = 0,
        shadowRight = 0,
        shadowPixels = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3]! === 0) continue;
        const x = (i / 4) % canvas.width;
        if (rgba[i]! > 200 && rgba[i + 1]! < 20) redRight = Math.max(redRight, x);
        if (rgba[i]! < 20 && rgba[i + 1]! < 20) {
          shadowRight = Math.max(shadowRight, x);
          shadowPixels++;
        }
      }
      return { redRight, shadowRight, shadowPixels };
    });
    expect(pixels.shadowRight - pixels.redRight).toBeGreaterThan(40);
    expect(pixels.shadowPixels).toBeGreaterThan(500);
    await inspector.getByRole('button', { name: 'Replace source', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
      )
      .toBe(history + 1);
    const after = await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage());
    const changed = await page.evaluate(
      async ({ before, after }) => {
        const read = async (url: string) => {
          const bitmap = await createImageBitmap(await (await fetch(url)).blob());
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const [a, b] = await Promise.all([read(before), read(after)]);
        if (a.length !== b.length) throw new Error('Document dimensions changed');
        let changed = 0;
        for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > 1) changed++;
        return changed;
      },
      { before, after }
    );
    expect(changed).toBe(0);
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
      )
      .toBe(history);
    expect(await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage())).toBe(before);
    await page.screenshot({
      path: info.outputPath('shadow-native-replacement.png'),
      fullPage: false,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
