import { expect, test } from '@playwright/test';
import { installImageApiFixture } from './extension-critical-image-ai.helpers';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';

for (const locale of ['en', 'ru'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`image AI inspector generates, retains its session and applies with Undo ${locale} ${viewport.name}`, async ({
      page,
    }, info) => {
      const host = await startHostServer();
      try {
        await page.setViewportSize(viewport.size);
        await applyHarnessBootstrap(page, {
          storage: {
            'sniptale-locale-preference': locale,
            'sniptale-theme-preference': locale === 'ru' ? 'light' : 'dark',
          },
        });
        await page.addInitScript(
          (value) => localStorage.setItem('sniptale-locale-preference', value),
          locale
        );
        await page.goto(
          `${host.origin}${EDITOR_HARNESS_PATH}?theme=${locale === 'ru' ? 'light' : 'dark'}`
        );
        await expect
          .poll(() =>
            page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
          )
          .toBeGreaterThan(0);
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
        await expect(inspector).toBeVisible();
        const generate = inspector.locator('[data-ui="editor.ai.generate"]');
        await inspector.locator('[data-ui="editor.ai.prompt"]').fill('Draw a green square');
        await expect(generate).toBeEnabled();
        await inspector
          .getByText(translate('editor.ai.parameters', locale), { exact: false })
          .click();
        await inspector
          .getByRole('button', { name: translate('editor.ai.ratio', locale), exact: true })
          .click();
        await page.getByRole('option', { name: '16:9', exact: true }).click();
        const initial = await page.evaluate(
          () => window.__sniptaleEditorHarness?.getInteractionState().historyIndex
        );
        await generate.click();
        await expect(inspector.locator('[data-ui="editor.ai.result"]')).toBeVisible();
        expect(
          await page.evaluate(
            () => window.__sniptaleEditorHarness?.getInteractionState().historyIndex
          )
        ).toBe(initial);
        await inspector
          .getByRole('button', { name: translate('editor.ai.openDocument', locale), exact: true })
          .click();
        await expect
          .poll(() =>
            page.evaluate(() => {
              const tabs: unknown = Reflect.get(window, 'imageAiOpenedTabs');
              return Array.isArray(tabs) ? tabs.length : 0;
            })
          )
          .toBe(1);
        expect(
          await page.evaluate(
            () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
          )
        ).toBe(initial);
        await page.locator('[data-ui="editor.floating.layers.mode.layers"]').click();
        await page.locator('[data-ui="editor.floating.layers.mode.ai"]').click();
        await expect(inspector.locator('[data-ui="editor.ai.result"]')).toBeVisible();
        const before = await page.evaluate(
          () => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0
        );
        await inspector
          .getByRole('button', { name: translate('editor.ai.apply', locale), exact: true })
          .click();
        await expect
          .poll(() =>
            page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
          )
          .toBe(before + 1);
        expect(
          await page.evaluate(
            () => window.__sniptaleEditorHarness?.getInteractionState().historyIndex
          )
        ).toBe(Number(initial) + 1);
        await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
        await expect
          .poll(() =>
            page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyIndex)
          )
          .toBe(initial);
        await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
        await expect
          .poll(() =>
            page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyIndex)
          )
          .toBe(Number(initial) + 1);
        await expect(
          inspector.getByRole('button', { name: translate('editor.ai.apply', locale), exact: true })
        ).toBeDisabled();
        await inspector.locator('[data-ui="editor.ai.prompt"]').fill('Make the square blue');
        await expect(generate).toBeEnabled();
        await generate.click();
        await expect
          .poll(() =>
            page.evaluate(() => {
              const requests: unknown = Reflect.get(window, 'imageAiRequests');
              return Array.isArray(requests) ? requests.length : 0;
            })
          )
          .toBe(2);
        const ratios = await page.evaluate(() => {
          const requests: unknown = Reflect.get(window, 'imageAiRequests');
          if (!Array.isArray(requests)) return [];
          return requests.map((request: unknown) => {
            if (!request || typeof request !== 'object' || !('context' in request)) return null;
            const context = request.context;
            if (!context || typeof context !== 'object' || !('parameters' in context)) return null;
            const parameters = context.parameters;
            return parameters && typeof parameters === 'object' && 'aspectRatio' in parameters
              ? parameters.aspectRatio
              : null;
          });
        });
        expect(ratios).toEqual(['16:9', '16:9']);
        const layout = await inspector.evaluate((element) => ({
          width: element.clientWidth,
          scroll: element.scrollWidth,
        }));
        expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
        await inspector.locator('[data-ui="editor.ai.prompt"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('ai-inspector.png'), fullPage: false });
      } finally {
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}

test.describe('image AI native region mapping', () => {
  test.use({ deviceScaleFactor: 2 });
  test('changes only the selected native rectangle at zoom 50%', async ({ page }, info) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width: 1920, height: 900 });
      await applyHarnessBootstrap(page, {});
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
      await page.evaluate(() => window.__sniptaleEditorHarness?.setZoomLevel(0.5));
      const before = await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage());
      const initialHistory = await page.evaluate(
        () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
      );
      await page.locator('[data-ui="editor.floating.layers.mode.ai"]').click();
      const inspector = page.locator('[data-ui="editor.ai.inspector"]');
      await inspector.getByRole('button', { name: 'Work with', exact: true }).click();
      await page.getByRole('option', { name: 'Selected region', exact: true }).click();
      await inspector
        .getByRole('button', { name: 'Select a region on the canvas', exact: true })
        .click();
      const boundary = page.locator('[data-ui="editor.canvas.document-boundary"]');
      const box = (await boundary.boundingBox())!;
      const x = box.x + box.width * 0.25,
        y = box.y + box.height * 0.3;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + box.width * 0.15, y + box.height * 0.25, { steps: 5 });
      await page.mouse.up();
      // Tool changes can select the crop inspector; returning must retain the guide.
      await page.locator('[data-ui="editor.floating.layers.mode.ai"]').click();
      await inspector.getByRole('button', { name: 'Use current selection', exact: true }).click();
      await inspector
        .locator('[data-ui="editor.ai.prompt"]')
        .fill('Fill the selected rectangle green');
      await expect(inspector.locator('[data-ui="editor.ai.generate"]')).toBeEnabled();
      await inspector.locator('[data-ui="editor.ai.generate"]').click();
      await expect(inspector.locator('[data-ui="editor.ai.result"]')).toBeVisible();
      expect(
        await page.evaluate(
          () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
        )
      ).toBe(initialHistory);
      await inspector.getByRole('button', { name: 'Add as layer', exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
        )
        .toBe(initialHistory + 1);
      const proof = await page.evaluate(async (original) => {
        const harness = window.__sniptaleEditorHarness!;
        const objects = harness.getCanvasObjects();
        const patch = objects[objects.length - 1]!;
        const left = Number(patch.left),
          top = Number(patch.top),
          width = Number(patch.width),
          height = Number(patch.height);
        const decode = async (url: string) => {
          const bitmap = await createImageBitmap(await (await fetch(url)).blob());
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          return {
            width: canvas.width,
            height: canvas.height,
            data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          };
        };
        const a = await decode(original),
          b = await decode(await harness.renderImage());
        let outsideChanges = 0,
          insideGreen = 0;
        for (let y = 0; y < a.height; y++)
          for (let x = 0; x < a.width; x++) {
            const i = (y * a.width + x) * 4;
            const inside = x >= left && x < left + width && y >= top && y < top + height;
            if (inside) {
              if (
                b.data[i] === 0 &&
                b.data[i + 1] === 160 &&
                b.data[i + 2] === 64 &&
                b.data[i + 3] === 255
              )
                insideGreen++;
            } else if ([0, 1, 2, 3].some((offset) => a.data[i + offset] !== b.data[i + offset]))
              outsideChanges++;
          }
        const requests = Reflect.get(window, 'imageAiRequests') as Array<{
          context: {
            images: Array<{ width: number; height: number }>;
            editRegion: { width: number; height: number };
          };
        }>;
        return {
          left,
          top,
          width,
          height,
          sourceWidth: a.width,
          sourceHeight: a.height,
          outputWidth: b.width,
          outputHeight: b.height,
          outsideChanges,
          insideGreen,
          request: requests[0]!.context,
        };
      }, before);
      expect(proof.outputWidth).toBe(proof.sourceWidth);
      expect(proof.outputHeight).toBe(proof.sourceHeight);
      expect(Math.abs(proof.left - proof.sourceWidth * 0.25)).toBeLessThanOrEqual(2);
      expect(Math.abs(proof.top - proof.sourceHeight * 0.3)).toBeLessThanOrEqual(2);
      expect(Math.abs(proof.width - proof.sourceWidth * 0.15)).toBeLessThanOrEqual(2);
      expect(Math.abs(proof.height - proof.sourceHeight * 0.25)).toBeLessThanOrEqual(2);
      expect(proof.request.images[0]).toMatchObject({ width: 768, height: 768 });
      expect(proof.request.editRegion).toMatchObject({ width: proof.width, height: proof.height });
      expect(proof.outsideChanges).toBe(0);
      expect(proof.insideGreen).toBe(proof.width * proof.height);
      await page.screenshot({
        path: info.outputPath('ai-region-native-pixels.png'),
        fullPage: false,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});

for (const intention of ['source', 'layers'] as const) {
  test(`image AI captures and replaces ${intention} with one Undo step`, async ({ page }, info) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width: 1920, height: 900 });
      const dataUrl = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#102030';
        ctx.fillRect(0, 0, 640, 360);
        return canvas.toDataURL('image/png');
      });
      await applyHarnessBootstrap(page, {
        editorBootstrapPayload: { dataUrl, title: 'Native source proof', url: '' },
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
      const box = (await page
        .locator('[data-ui="editor.canvas.document-boundary"]')
        .boundingBox())!;
      await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
      for (const [x, y] of [
        [0.2, 0.2],
        [0.35, 0.45],
      ]) {
        await page.mouse.move(box.x + box.width * x!, box.y + box.height * y!);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * (x! + 0.15), box.y + box.height * (y! + 0.1), {
          steps: 5,
        });
        await page.mouse.up();
      }
      await expect
        .poll(() => page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects().length))
        .toBe(3);
      const beforeSelection = await page.evaluate(() =>
        window.__sniptaleEditorHarness!.getCanvasObjects()
      );
      await installImageApiFixture(page);
      await page.locator('[data-ui="editor.floating.layers.mode.layers"]').click();
      if (intention === 'source') {
        await page.getByRole('button', { name: 'Unlock layer', exact: true }).click();
      }
      if (intention === 'layers') {
        const toggles = page.locator(
          '[data-ui="editor.layers.list-viewport"] button[aria-pressed]'
        );
        await toggles.nth(0).click();
        await toggles.nth(1).click({ modifiers: ['Control'] });
        await expect(
          page.locator('[data-ui="editor.layers.list-viewport"] button[aria-pressed="true"]')
        ).toHaveCount(2);
      }
      await page.locator('[data-ui="editor.floating.layers.mode.ai"]').click();
      const inspector = page.locator('[data-ui="editor.ai.inspector"]');
      await inspector.getByRole('button', { name: 'Work with', exact: true }).click();
      await page
        .getByRole('option', {
          name: intention === 'source' ? 'Main image' : 'Selected layers · 2',
          exact: true,
        })
        .click();
      await inspector.getByRole('button', { name: 'Use current selection', exact: true }).click();
      await inspector.locator('[data-ui="editor.ai.prompt"]').fill('Make the source green');
      await expect(inspector.locator('[data-ui="editor.ai.generate"]')).toBeEnabled();
      const original = {
        objects: beforeSelection,
        history: await page.evaluate(
          () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
        ),
      };
      await inspector.locator('[data-ui="editor.ai.generate"]').click();
      await expect(inspector.locator('[data-ui="editor.ai.result"]')).toBeVisible();
      expect(
        await page.evaluate(
          () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
        )
      ).toBe(original.history);
      const input = await page.evaluate(async () => {
        const requests = Reflect.get(window, 'imageAiRequests') as Array<{
          context: {
            intention: string;
            images: Array<{ dataUrl: string; width: number; height: number }>;
            editRegion: { left: number; top: number; width: number; height: number };
          };
        }>;
        const context = requests[0]!.context,
          image = context.images[0]!;
        const bitmap = await createImageBitmap(await (await fetch(image.dataUrl)).blob());
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const region = context.editRegion;
        const pixels = ctx.getImageData(region.left, region.top, region.width, region.height).data;
        let transparent = 0,
          opaque = 0;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] === 0) transparent++;
          else if (pixels[i] === 255) opaque++;
        }
        return {
          intention: context.intention,
          width: image.width,
          height: image.height,
          target: region,
          transparent,
          opaque,
        };
      });
      expect(input).toMatchObject({ intention, width: 768, height: 768 });
      if (intention === 'source') {
        expect(input.target).toMatchObject({ width: 640, height: 360 });
        expect(input.transparent).toBe(0);
      } else {
        expect(input.transparent).toBeGreaterThan(0);
        expect(input.opaque).toBeGreaterThan(0);
        expect(input.target.width).toBeLessThan(640);
        expect(input.target.height).toBeLessThan(360);
        const prompt = inspector.locator('[data-ui="editor.ai.prompt"]');
        await prompt.fill('Refine the chosen layer result');
        await expect(inspector.locator('[data-ui="editor.ai.generate"]')).toBeEnabled();
        await inspector.locator('[data-ui="editor.ai.generate"]').click();
        await expect(prompt).toHaveValue('');
        const refinement = await page.evaluate(() => {
          const requests = Reflect.get(window, 'imageAiRequests') as Array<{
            context: { images: unknown[]; prompt: string };
          }>;
          return {
            count: requests.length,
            inputs: requests[1]?.context.images.length,
            prompt: requests[1]?.context.prompt,
          };
        });
        expect(refinement).toEqual({
          count: 2,
          inputs: 1,
          prompt: 'Refine the chosen layer result',
        });
        expect(
          await page.evaluate(
            () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
          )
        ).toBe(original.history);
      }
      await inspector.getByRole('button', { name: 'Replace source', exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
        )
        .toBe(original.history + 1);
      const applied = await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects());
      if (intention === 'source') {
        expect(applied).toHaveLength(3);
        expect(applied.slice(1)).toEqual(original.objects.slice(1));
        expect(applied[0]).toMatchObject({ ...original.objects[0], src: expect.any(String) });
        expect(applied[0]!.src).not.toBe(original.objects[0]!.src);
      } else {
        expect(applied).toHaveLength(4);
        expect(applied[0]).toEqual(original.objects[0]);
        expect(applied.slice(1, 3).map((object) => object.visible)).toEqual([false, false]);
        expect(applied[3]).toMatchObject({
          width: input.target.width,
          height: input.target.height,
        });
      }
      await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
        )
        .toBe(original.history);
      expect(await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects())).toEqual(
        original.objects
      );
      await page.screenshot({ path: info.outputPath(`ai-${intention}-undo.png`), fullPage: false });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

for (const width of [719, 720, 721]) {
  test(`image AI remains usable at the ${width}px layout boundary and clears only temporary history`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width, height: 560 });
      await applyHarnessBootstrap(page, {});
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
      const prompt = inspector.locator('[data-ui="editor.ai.prompt"]');
      await prompt.fill('First line');
      await prompt.press('End');
      await prompt.press('Enter');
      await expect(prompt).toHaveValue('First line\n');
      const requestCount = () =>
        page.evaluate(() => {
          const requests: unknown = Reflect.get(window, 'imageAiRequests');
          return Array.isArray(requests) ? requests.length : 0;
        });
      expect(await requestCount()).toBe(0);
      await expect(inspector.locator('[data-ui="editor.ai.generate"]')).toBeEnabled();
      await inspector.locator('[data-ui="editor.ai.generate"]').click();
      await expect(inspector.locator('[data-ui="editor.ai.result"]')).toBeVisible();
      const apply = inspector.getByRole('button', { name: 'Add as layer', exact: true });
      await apply.click();
      await expect(apply).toBeDisabled();
      const accepted = await page.evaluate(async () => ({
        image: await window.__sniptaleEditorHarness!.renderImage(),
        history: window.__sniptaleEditorHarness!.getInteractionState().historyIndex,
        count: window.__sniptaleEditorHarness!.getCanvasObjects().length,
      }));
      await inspector.getByRole('button', { name: 'Session actions', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Clear session history…', exact: true }).click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Clear history', exact: true }).click();
      await expect(inspector.locator('[data-ui="editor.ai.result"]')).toHaveCount(0);
      expect(await requestCount()).toBe(1);
      const after = await page.evaluate(async () => ({
        image: await window.__sniptaleEditorHarness!.renderImage(),
        history: window.__sniptaleEditorHarness!.getInteractionState().historyIndex,
        count: window.__sniptaleEditorHarness!.getCanvasObjects().length,
      }));
      expect(after).toEqual(accepted);
      await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
        )
        .toBe(accepted.history - 1);
      const overflow = await inspector.evaluate((element) => ({
        width: element.clientWidth,
        scroll: element.scrollWidth,
        page: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);
      expect(overflow.page).toBeLessThanOrEqual(overflow.viewport);
      await page.screenshot({ path: info.outputPath(`ai-layout-${width}.png`), fullPage: false });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
