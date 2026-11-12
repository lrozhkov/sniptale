import { fileURLToPath } from 'node:url';
import { expect, test, type Locator } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { observeEffectGpuPlans } from '../support/gpu-preview-proof';
import { startHostServer } from '../support/host-server';
import { SETTINGS_HARNESS_PATH } from '../extension-critical.helpers';
import {
  LOTTIE_ANNOTATION_FIXTURE,
  openEffectVideoEditorHarness,
  readAnimationFixtureSource,
} from './extension-critical-video-effects.helpers';

const examples = [
  { id: 'e2e-title', title: 'E2E e2e-title', file: LOTTIE_ANNOTATION_FIXTURE },
  ...(['callout', 'frame'] as const).map((name) => ({
    id: `e2e-${name}`,
    title: `E2E e2e-${name}`,
    file: fileURLToPath(
      new URL(
        `../../../../apps/extension/public/video-effects/animations/${name}.sniptale-animation.json`,
        import.meta.url
      )
    ),
  })),
];

async function pixels(canvas: Locator) {
  return canvas.evaluate((node: HTMLCanvasElement) => {
    const context = node.getContext('2d');
    if (!context || !node.width || !node.height) return '';
    return [...context.getImageData(0, 0, node.width, node.height).data].some(
      (value, index) => index % 4 === 3 && value > 0
    )
      ? node.toDataURL()
      : '';
  });
}

async function paintCount(canvas: Locator) {
  return canvas.evaluate((node) => {
    const read: unknown = Reflect.get(window, 'sniptaleTestCatalogPaintCount');
    if (typeof read !== 'function') throw new Error('Missing catalogue paint observer');
    const count: unknown = Reflect.apply(read, window, [node]);
    if (typeof count !== 'number') throw new Error('Invalid catalogue paint count');
    return count;
  });
}

async function scrub(canvas: Locator) {
  await expect(canvas).toBeVisible();
  await canvas.hover();
  await expect.poll(() => pixels(canvas)).not.toBe('');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Catalog preview has no bounds.');
  // A new manual paint establishes the clock; an autoplay baseline can equal an authored hold.
  await canvas.hover({ position: { x: bounds.width * 0.35, y: bounds.height * 0.5 } });
  await expect.poll(() => paintCount(canvas)).toBeGreaterThan(0);
  await expect.poll(() => pixels(canvas)).not.toBe('');
  const before = await pixels(canvas);
  await canvas.hover({ position: { x: bounds.width * 0.05, y: bounds.height * 0.5 } });
  await expect.poll(() => paintCount(canvas)).toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const frame = await pixels(canvas);
      return frame && frame !== before ? frame : '';
    })
    .not.toBe('');
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Lottie catalog ready pixels and Settings scrub at ${viewport.name}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ ...viewport.size });
    await page.addInitScript(() => {
      const counts = new WeakMap<object, number>();
      const pointerBaselines = new WeakMap<object, number>();
      document.addEventListener(
        'pointermove',
        (event) => {
          if (event.target instanceof HTMLCanvasElement)
            pointerBaselines.set(event.target, counts.get(event.target) ?? 0);
        },
        true
      );
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      Reflect.set(
        CanvasRenderingContext2D.prototype,
        'drawImage',
        function (this: CanvasRenderingContext2D, ...args: unknown[]) {
          const result = Reflect.apply(draw, this, args);
          counts.set(this.canvas, (counts.get(this.canvas) ?? 0) + 1);
          return result;
        }
      );
      Reflect.set(
        window,
        'sniptaleTestCatalogPaintCount',
        (canvas: HTMLCanvasElement) =>
          (counts.get(canvas) ?? 0) - (pointerBaselines.get(canvas) ?? 0)
      );
    });
    const completed = await observeEffectGpuPlans(page, { requireParentScene: false });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const host = await startHostServer();
    try {
      await openEffectVideoEditorHarness(page, host.origin);
      await page.locator('[data-ui="video-editor.library-tab.annotations"]').click();
      const dock = page.locator('[data-ui="video-editor.effects-library.dock"]');
      for (const example of examples) {
        await dock.locator('input[type="file"]').setInputFiles({
          name: `${example.id}.sniptale-animation.json`,
          mimeType: 'application/json',
          buffer: Buffer.from(await readAnimationFixtureSource(example.file, example.id)),
        });
        await test.step(`Native ${example.id}`, async () => {
          await scrub(page.locator(`[data-effect-document="${example.id}"] canvas`).first());
          await expect.poll(completed).toBeGreaterThan(0);
        });
      }
      await page.screenshot({ path: info.outputPath('native-catalog.png'), fullPage: false });
      await page.goto(`${host.origin}${SETTINGS_HARNESS_PATH}?section=video-effects`);
      for (const example of examples) {
        const card = page
          .locator('[data-settings-collection-item]')
          .filter({ hasText: example.title });
        const before = completed();
        await test.step(`Settings ${example.id}`, async () => {
          await scrub(card.locator('canvas'));
          await expect.poll(completed).toBeGreaterThan(before);
        });
      }
      await page.screenshot({ path: info.outputPath('settings-catalog.png'), fullPage: false });
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
