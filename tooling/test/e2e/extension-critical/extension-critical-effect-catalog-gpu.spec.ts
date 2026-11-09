import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import { expect, test, type Locator } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { enableGpuPreviewProof, observeEffectGpuPlans } from '../support/gpu-preview-proof';
import { startHostServer } from '../support/host-server';
import { SETTINGS_HARNESS_PATH } from '../extension-critical.helpers';
import {
  EFFECT_V1_STANDALONE_FIXTURE,
  EFFECT_V1_TRANSITION_FIXTURE,
  openEffectVideoEditorHarness,
} from './extension-critical-video-effects.helpers';

enableGpuPreviewProof();

const examples = [
  {
    id: 'neutral-standalone',
    title: 'Neutral Standalone',
    tab: 'annotations',
    file: EFFECT_V1_STANDALONE_FIXTURE,
  },
  {
    id: 'neutral-target-effect',
    title: 'Neutral Target Effect',
    tab: 'effects',
    file: fileURLToPath(
      new URL(
        '../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/neutra' +
          'l-target-effect.sniptale-effect.json',
        import.meta.url
      )
    ),
  },
  {
    id: 'neutral-transition',
    title: 'Neutral Transition',
    tab: 'transitions',
    file: EFFECT_V1_TRANSITION_FIXTURE,
  },
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

async function scrub(canvas: Locator) {
  await expect(canvas).toBeVisible();
  await canvas.hover({ position: { x: 10, y: 10 } });
  await expect.poll(() => pixels(canvas)).not.toBe('');
  const before = await pixels(canvas);
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Catalog preview has no bounds.');
  await canvas.hover({ position: { x: bounds.width * 0.8, y: bounds.height * 0.5 } });
  await expect.poll(() => pixels(canvas)).not.toBe(before);
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Effect catalog GPU cards and Settings scrub at ${viewport.name}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ ...viewport.size });
    const completed = await observeEffectGpuPlans(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const host = await startHostServer();
    try {
      await openEffectVideoEditorHarness(page, host.origin);
      await page.locator('[data-ui="video-editor.library-tab.effects"]').click();
      const dock = page.locator('[data-ui="video-editor.effects-library.dock"]');
      for (const example of examples) {
        const parsed = parseEffectV1Source(await readFile(example.file, 'utf8'));
        if (!parsed.document) throw new Error('Catalog fixture is invalid.');
        // Keep the starter's animated primitives inside the catalog's 640 by 360 logical view.
        const fixture = {
          ...parsed.document,
          layers: parsed.document.layers.map((layer) => ({ ...layer, x: 0, y: 0 })),
        };
        await dock.locator('input[type="file"]').setInputFiles({
          name: `${example.id}.sniptale-effect.json`,
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(fixture)),
        });
        await page.locator(`[data-ui="video-editor.library-tab.${example.tab}"]`).click();
        await scrub(page.locator(`[data-effect-document="${example.id}"] canvas`).first());
        await expect.poll(completed).toBeGreaterThan(0);
      }
      await page.screenshot({ path: info.outputPath('native-catalog.png'), fullPage: false });
      await page.goto(`${host.origin}${SETTINGS_HARNESS_PATH}?section=video-effects`);
      for (const example of examples) {
        const card = page
          .locator('[data-settings-collection-item]')
          .filter({ hasText: example.title });
        const before = completed();
        await scrub(card.locator('canvas'));
        await expect.poll(completed).toBeGreaterThan(before);
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
