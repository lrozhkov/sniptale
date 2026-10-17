import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { createInlineWorkerBundlePlugin } from '../support/inline-worker-bundle';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { persistedReviewContent } from '../support/voiceover-speech-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  SETTINGS_HARNESS_PATH,
} from '../extension-critical.helpers';

const templates = [
  { ru: 'Имя и роль', en: 'Name and role' },
  { ru: 'Главная мысль', en: 'Main idea' },
  { ru: 'Маршрут видео', en: 'Video chapters' },
  { ru: 'Пояснение с указателем', en: 'Pointer callout' },
  { ru: 'Контур', en: 'Outline' },
  { ru: 'Угловой фокус', en: 'Corner focus' },
] as const;

async function drawInterval(
  page: Page,
  lane: Locator,
  start: number,
  end: number,
  checkCursor = false
) {
  await lane.scrollIntoViewIfNeeded();
  await expect(lane).toBeInViewport();
  const bounds = await lane.boundingBox();
  if (!bounds) throw new Error('Annotation lane is absent');
  const y = await lane.evaluate((node, start) => {
    const bounds = node.getBoundingClientRect();
    let top = Math.max(0, bounds.top),
      bottom = Math.min(innerHeight, bounds.bottom);
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'contents' || !/auto|scroll|hidden|clip/.test(style.overflowY))
        continue;
      const clip = parent.getBoundingClientRect();
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
      if (style.position === 'fixed') break;
    }
    const x = bounds.x + (bounds.width * start) / 12;
    for (let y = Math.ceil(top) + 1; y < bottom - 1; y += 1) {
      if (document.elementFromPoint(x, y) === node) return y;
    }
    throw new Error('Annotation lane has no visible empty placement area');
  }, start);
  await page.mouse.move(bounds.x + (bounds.width * start) / 12, y);
  if (checkCursor)
    await expect
      .poll(() => lane.evaluate((node) => getComputedStyle(node).cursor))
      .toContain('4 16, cell');
  await page.mouse.down();
  await page.mouse.move(bounds.x + (bounds.width * end) / 12, y, { steps: 8 });
  await page.mouse.up();
}

test('native imported PNG/SVG annotations retain complete sources after Undo, catalog deletion and reopen', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 560 });
  const host = await startHostServer();
  const title = 'Нативные PNG и SVG';
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
  const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
  const button = (key: Parameters<typeof translate>[0]) =>
    dialog.getByRole('button', { name: label(key), exact: true });
  const workspace = () => readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
  const open = async () => {
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await page
      .locator('[data-gallery-keyboard-id="recording:beta-v1-recording"]')
      .getByRole('button', { name: 'beta-v1.webm', exact: true })
      .first()
      .click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
  };
  const settings = async () => {
    await page.goto(`${host.origin}${SETTINGS_HARNESS_PATH}?section=video-effects`);
    await page.locator('[data-ui="settings.video-effects"]').waitFor();
  };
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: {
        'sniptale-locale-preference': 'ru',
        'sniptale-theme-preference': 'light',
      },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    const dataUrl = await page.evaluate(() => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
      canvas.getContext('2d')!.fillStyle = '#17b65a';
      canvas.getContext('2d')!.fillRect(0, 0, 32, 32);
      return canvas.toDataURL('image/png');
    });
    const base = parseEffectV1Source(
      await readFile(
        'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-standalone.sniptale-effect.json',
        'utf8'
      )
    );
    if (!base.ok || !base.document) throw new Error('SDK fixture invalid');
    const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    const svgText =
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="#a832b6"/></svg>';
    const fraction = (path: 'width' | 'height', value: number) => ({
      op: 'mul' as const,
      args: [{ op: 'read' as const, path }, value],
    });
    const document = {
      ...base.document,
      id: 'native-gallery-assets',
      label: { ru: title, en: 'Native PNG and SVG' },
      controls: [],
      assets: [
        {
          id: 'native-png',
          kind: 'image',
          mimeType: 'image/png',
          width: 32,
          height: 32,
          dataUrl,
          byteLength: png.length,
          sha256: createHash('sha256').update(png).digest('hex'),
        },
        {
          id: 'native-svg',
          kind: 'svg',
          mimeType: 'image/svg+xml',
          width: 32,
          height: 32,
          svgText,
          byteLength: Buffer.byteLength(svgText),
          sha256: createHash('sha256').update(svgText).digest('hex'),
        },
      ],
      program: {
        kind: 'graph',
        version: 1,
        commands: [
          { op: 'clear' },
          {
            op: 'image',
            assetId: 'native-png',
            x: fraction('width', 0.05),
            y: fraction('height', 0.1),
            width: fraction('width', 0.4),
            height: fraction('height', 0.7),
            fit: 'fill',
          },
          {
            op: 'svgParts',
            assetId: 'native-svg',
            x: fraction('width', 0.55),
            y: fraction('height', 0.1),
            width: fraction('width', 0.4),
            height: fraction('height', 0.7),
            part: {
              kind: 'preset',
              mode: 'assemble',
              order: 'center',
              reveal: 1,
              spread: 0,
              scaleFrom: 1,
              stagger: 0,
              rotate: 0,
            },
          },
        ],
      },
    };
    const source = JSON.stringify(document);
    const admitted = parseEffectV1Source(source);
    expect(admitted.diagnostics, JSON.stringify(admitted.diagnostics)).toEqual([]);
    expect(admitted.ok).toBe(true);
    await settings();
    const chooser = page.waitForEvent('filechooser');
    await page
      .locator('[data-ui="settings.video-effects"]')
      .getByRole('button', { name: label('videoEditor.effectsLibrary.importMany'), exact: true })
      .click();
    await (
      await chooser
    ).setFiles({
      name: 'native-assets.sniptale-effect.json',
      mimeType: 'application/json',
      buffer: Buffer.from(source),
    });
    const importedRow = page.locator('[data-settings-collection-item]').filter({ hasText: title });
    await expect(importedRow).toBeVisible();
    await open();
    await button('gallery.videoReview.advancedEditing').click();
    await expect.poll(async () => (await workspace())?.advanced.ui.mode).toBe('advanced');
    await expect.poll(async () => (await persistedReviewContent(page))?.zoom.enabled).toBe(true);
    const durableBeforeAdd = JSON.stringify(await workspace());
    const toggleAutosave = async (enabled: boolean) => {
      await dialog.locator('[data-ui="autosave-control"] button').first().click();
      const control = page.getByRole('switch', {
        name: label('editor.documentActions.autosaveSwitch'),
        exact: true,
      });
      await control.locator('..').click();
      await expect(control).toBeChecked({ checked: enabled });
      await page.keyboard.press('Escape');
    };
    await toggleAutosave(false);
    await button('gallery.videoReview.annotationEffectsAdd').click();
    const typeSelector = button('gallery.videoReview.annotationEffectsChoose');
    await typeSelector.click();
    await page.getByRole('option', { name: title, exact: true }).click();
    expect(JSON.stringify(await workspace())).toBe(durableBeforeAdd);
    await drawInterval(
      page,
      dialog.locator('[data-ui="gallery.videoReview.annotationEffectsLane"]'),
      1,
      7
    );
    await expect(dialog.locator('[data-annotation-effect-id]')).toHaveCount(1);
    expect(JSON.stringify(await workspace())).toBe(durableBeforeAdd);
    await button('gallery.videoReview.annotationEffectsAdd').click();
    await typeSelector.click();
    await page.getByRole('option', { name: templates[0].ru, exact: true }).click();
    expect(JSON.stringify(await workspace())).toBe(durableBeforeAdd);
    await drawInterval(
      page,
      dialog.locator('[data-ui="gallery.videoReview.annotationEffectsLane"]'),
      1,
      7
    );
    await expect(dialog.locator('[data-annotation-effect-id]')).toHaveCount(2);
    await button('gallery.videoReview.undo').click();
    await expect(dialog.locator('[data-annotation-effect-id]')).toHaveCount(1);
    expect(JSON.stringify(await workspace())).toBe(durableBeforeAdd);
    // Enabling autosave adopts both sources and keeps the undone builtin in the retained redo branch.
    await toggleAutosave(true);
    await expect.poll(async () => (await workspace())?.effectSnapshots?.length).toBe(2);
    await expect
      .poll(
        async () =>
          (await workspace())?.effectSnapshots?.find(
            (snapshot) => snapshot.documentId === 'native-gallery-assets'
          )?.assets.length
      )
      .toBe(2);
    expect(
      (await workspace())?.effectSnapshots?.find(
        (snapshot) => snapshot.documentId === 'native-gallery-assets'
      )?.source
    ).toBe(source);
    await button('gallery.videoReview.undo').click();
    await expect(dialog.locator('[data-annotation-effect-id]')).toHaveCount(0);
    await page.reload();
    await page
      .locator('[data-gallery-keyboard-id="recording:beta-v1-recording"]')
      .getByRole('button', { name: 'beta-v1.webm', exact: true })
      .first()
      .click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await button('gallery.videoReview.redo').click();
    await expect(dialog.locator('[data-annotation-effect-id]')).toHaveCount(1);
    await settings();
    await importedRow
      .getByRole('button', { name: label('common.actions.delete'), exact: true })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: label('common.actions.delete'), exact: true })
      .click();
    await expect(importedRow).toHaveCount(0);
    await open();
    await expect(dialog.locator('[data-annotation-effect-id]')).toHaveCount(1);
    await dialog
      .locator('video')
      .first()
      .evaluate((video) => {
        video.currentTime = 3;
      });
    const canvas = dialog.locator('[data-ui="gallery.videoReview.manualPreview"] canvas');
    await expect
      .poll(() =>
        canvas.evaluate((node) => {
          const bytes = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
          let green = 0,
            magenta = 0;
          for (let i = 0; i < bytes.length; i += 4) {
            if (
              Math.abs(bytes[i]! - 23) < 3 &&
              Math.abs(bytes[i + 1]! - 182) < 3 &&
              Math.abs(bytes[i + 2]! - 90) < 3
            )
              green++;
            if (
              Math.abs(bytes[i]! - 168) < 3 &&
              Math.abs(bytes[i + 1]! - 50) < 3 &&
              Math.abs(bytes[i + 2]! - 182) < 3
            )
              magenta++;
          }
          return green > 200 && magenta > 200;
        })
      )
      .toBe(true);
    expect(
      (await workspace())?.effectSnapshots?.find(
        (snapshot) => snapshot.documentId === 'native-gallery-assets'
      )?.source
    ).toBe(source);
    expect(
      (await workspace())?.effectSnapshots?.find(
        (snapshot) => snapshot.documentId === 'native-gallery-assets'
      )?.assets
    ).toHaveLength(2);
    await page.screenshot({
      path: info.outputPath('annotation-native-png-svg-retained.png'),
      fullPage: false,
    });
    const bundle = await build({
      entryPoints: ['tooling/test/e2e/support/quick-review-annotation-portable-probe.ts'],
      plugins: [createInlineWorkerBundlePlugin()],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      loader: { '.svg': 'text', '.woff2': 'dataurl' },
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    await dialog
      .locator('header')
      .getByRole('button', { name: label('common.actions.close'), exact: true })
      .click();
    const portable = await page.evaluate(async (text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        const module: typeof import('../support/quick-review-annotation-portable-probe') =
          await import(url);
        return await module.portableProbe('recording:beta-v1-recording');
      } finally {
        URL.revokeObjectURL(url);
      }
    }, bundle.outputFiles[0]!.text);
    await writeFile(
      info.outputPath('annotation-native-portable.json'),
      JSON.stringify(portable, null, 2)
    );
    expect(portable.archiveBytes).toBeGreaterThan(1000);
    expect(portable.imported).toBeGreaterThan(0);
    expect(portable.catalogRoots).toBe(0);
    expect(portable.trashUnchanged).toBe(true);
    expect(portable.restoredUnchanged).toBe(true);
    expect(portable.sourceUnchanged).toBe(true);
    expect(portable.completeHistory).toBe(true);
    expect(portable.cursor).toBe(portable.expectedCursor);
    expect(portable.exactSource).toBe(true);
    expect(portable.assets).toHaveLength(2);
    expect(portable.assets.every((asset) => asset.exact && asset.rebound)).toBe(true);
  } finally {
    // Restored-library previews may keep requests alive; release the page before its test server.
    await page.close();
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

async function resizeInspector(page: Page, dialog: Locator, width: number) {
  const content = dialog.locator('.review-inspector-scroll');
  const current = await content.evaluate((node) => Number.parseFloat(getComputedStyle(node).width));
  const handle = await dialog
    .locator('[data-ui="gallery.videoReview.resizeInspector"]')
    .boundingBox();
  if (!handle) throw new Error('Inspector resize handle unavailable');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 20);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - (width - current), handle.y + 20, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(() => content.evaluate((node) => Number.parseFloat(getComputedStyle(node).width)))
    .toBe(width);
}

async function verifyAnnotationControls(
  page: Page,
  dialog: Locator,
  locale: 'ru' | 'en',
  info: TestInfo
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const inspector = dialog.locator('[data-ui="gallery.videoReview.annotationInspector"]');
  const workspace = () => readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
  const field = inspector.getByRole('textbox', {
    name: label('gallery.videoReview.annotationX'),
    exact: true,
  });
  const slider = inspector.getByRole('slider', {
    name: `${label('gallery.videoReview.annotationX')} range`,
    exact: true,
  });
  const reveal = async () => {
    await field.scrollIntoViewIfNeeded();
    await field
      .locator('xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.numeric-row"]')
      .hover();
    await expect(slider).toBeVisible();
    await slider.focus();
  };
  const before = (await persistedReviewContent(page))!.annotationEffects!.instances[0]!.transform.x;
  const cursor = (await workspace())!.cursor;
  await reveal();
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowRight');
  const next = (Math.floor(before * 100 + 1e-10) + 2) / 100;
  await expect(field).toHaveValue(String(next * 100));
  await page.screenshot({ path: info.outputPath('annotation-scrub-focused.png'), fullPage: false });
  expect((await workspace())!.cursor).toBe(cursor);
  await page.keyboard.up('ArrowRight');
  await expect
    .poll(
      async () => (await persistedReviewContent(page))!.annotationEffects!.instances[0]!.transform.x
    )
    .toBe(next);
  expect((await workspace())!.cursor).toBe(cursor + 1);
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
    .click();
  await expect
    .poll(
      async () => (await persistedReviewContent(page))!.annotationEffects!.instances[0]!.transform.x
    )
    .toBe(before);
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.redo'), exact: true })
    .click();
  await expect
    .poll(
      async () => (await persistedReviewContent(page))!.annotationEffects!.instances[0]!.transform.x
    )
    .toBe(next);
  await reveal();
  await page.keyboard.down('ArrowRight');
  await slider.press('Escape');
  await page.keyboard.up('ArrowRight');
  expect((await workspace())!.cursor).toBe(cursor + 1);
  await expect
    .poll(
      async () => (await persistedReviewContent(page))!.annotationEffects!.instances[0]!.transform.x
    )
    .toBe(next);
  const preset = inspector
    .locator('[data-ui="shared.ui.compact-inspector.select-field"]')
    .getByRole('button', {
      name: label('gallery.videoReview.annotationPresets'),
      exact: true,
    });
  const previousLabel = await preset.textContent();
  await preset.click();
  const chosen = page.getByRole('option').nth(2);
  const selectedLabel = await chosen.textContent();
  await chosen.click();
  await expect(preset).toHaveText(selectedLabel!);
  await expect.poll(async () => (await workspace())!.cursor).toBe(cursor + 2);
  await preset.click();
  await expect(page.getByRole('option', { selected: true })).toHaveText(selectedLabel!);
  await page.screenshot({
    path: info.outputPath('annotation-preset-selected.png'),
    fullPage: false,
  });
  await preset.press('Escape');
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
    .click();
  await expect(preset).toHaveText(previousLabel!);
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.redo'), exact: true })
    .click();
  await expect(preset).toHaveText(selectedLabel!);
}

for (const variant of [
  { width: 1280, height: 560, locale: 'ru', theme: 'light' },
  { width: 1920, height: 900, locale: 'en', theme: 'dark' },
] as const) {
  test(`native annotation lane, six templates and history at ${variant.width}x${variant.height}`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: variant.width, height: variant.height });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    const lane = dialog.locator('[data-ui="gallery.videoReview.annotationEffectsLane"]');
    const plates = lane.locator('[data-annotation-effect-id]');
    const workspace = () => readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
          sniptale_quick_preview_preferences: {
            rasterPreset: '360p',
            frameRate: '30',
            pausedQuality: 'same',
            showFrameRate: false,
          },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await expect.poll(async () => (await persistedReviewContent(page))?.zoom.enabled).toBe(true);
      for (const [index, template] of templates.entries()) {
        const toggle = button('gallery.videoReview.annotationEffectsAdd');
        if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
        const selector = button('gallery.videoReview.annotationEffectsChoose');
        await expect(selector).not.toHaveAttribute('aria-describedby');
        await expect(selector).not.toHaveText(label('gallery.videoReview.annotationEffectsChoose'));
        await expect(lane).toBeInViewport();
        await expect(dialog.locator('[data-ui="gallery.videoReview.timeline"]')).toHaveAttribute(
          'data-active-tool-lane',
          'annotation'
        );
        await expect(dialog.locator('[data-ui="gallery.videoReview.timePlane"]')).toHaveAttribute(
          'data-active-tool-lane',
          'annotation'
        );
        const before = (await workspace())!.cursor;
        await selector.click();
        const choice = page.getByRole('option', { name: template[variant.locale], exact: true });
        await expect(choice).toBeEnabled();
        if (index === 0)
          await page.screenshot({
            path: info.outputPath('annotation-type-before-draw.png'),
            fullPage: false,
          });
        await choice.click();
        expect((await workspace())!.cursor).toBe(before);
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await expect(button('gallery.videoReview.pointerTool')).toHaveAttribute(
          'aria-pressed',
          'false'
        );
        if (index === 0) {
          await lane.focus();
          await page.keyboard.press('v');
          await expect(toggle).toHaveAttribute('aria-pressed', 'false');
          await expect(selector).toHaveCount(0);
          await expect(button('gallery.videoReview.pointerTool')).toHaveAttribute(
            'aria-pressed',
            'true'
          );
          expect((await workspace())!.cursor).toBe(before);
          await toggle.click();
          await expect(selector).not.toHaveText(
            label('gallery.videoReview.annotationEffectsChoose')
          );
          await selector.click();
          await page.getByRole('option', { name: template[variant.locale], exact: true }).click();
        }
        await drawInterval(page, lane, 1, 7, true);
        await expect(selector).toHaveCount(0);
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect(button('gallery.videoReview.pointerTool')).toHaveAttribute(
          'aria-pressed',
          'true'
        );
        await expect(plates).toHaveCount(index + 1);
        await expect(
          dialog.locator('[data-ui="gallery.videoReview.annotationInspector"]')
        ).toBeVisible();
        await expect
          .poll(
            async () => (await persistedReviewContent(page))?.annotationEffects?.instances.length
          )
          .toBe(index + 1);
      }
      await button('gallery.videoReview.pointerTool').click();
      await expect(button('gallery.videoReview.annotationEffectsAdd')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      const saved = await workspace();
      expect(saved?.effectSnapshots).toHaveLength(6);
      const content = await persistedReviewContent(page);
      expect(content?.annotationEffects?.instances).toHaveLength(6);
      for (const instance of content?.annotationEffects?.instances ?? []) {
        expect(instance.start).toBeCloseTo(1, 1);
        expect(instance.end).toBeCloseTo(7, 1);
      }
      expect(
        new Set(
          await plates.evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute('data-annotation-effect-row'))
          )
        ).size
      ).toBe(6);
      await button('gallery.videoReview.undo').click();
      await expect(plates).toHaveCount(5);
      await button('gallery.videoReview.redo').click();
      await expect(plates).toHaveCount(6);
      const mute = button('gallery.videoReview.annotationEffectsEnabled');
      await mute.click();
      await expect(mute).toHaveAttribute('aria-pressed', 'false');
      await plates.first().click();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.annotationInspector"]')
      ).toBeVisible();
      await mute.click();
      await expect(mute).toHaveAttribute('aria-pressed', 'true');
      const inspector = dialog.locator('[data-ui="gallery.videoReview.annotationInspector"]');
      const name = inspector.getByRole('textbox', {
        name: variant.locale === 'ru' ? 'Имя · строка 1' : 'Name · line 1',
        exact: true,
      });
      await inspector.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('annotation-parameters.png'),
        fullPage: false,
      });
      await name.scrollIntoViewIfNeeded();
      const original = await name.inputValue();
      await name.fill('Cancelled native field');
      await name.press('Escape');
      await expect(name).toHaveValue(original);
      const cursor = (await workspace())!.cursor;
      await name.fill('Accepted native field');
      await name.press('Enter');
      await expect
        .poll(
          async () =>
            (await persistedReviewContent(page))?.annotationEffects?.instances[0]?.controls.title
        )
        .toBe('Accepted native field');
      expect((await workspace())!.cursor).toBe(cursor + 1);
      await button('gallery.videoReview.undo').click();
      await expect(name).toHaveValue(original);
      await button('gallery.videoReview.redo').click();
      await expect(name).toHaveValue('Accepted native field');
      await verifyAnnotationControls(page, dialog, variant.locale, info);
      if (variant.width === 1920) {
        const initialWidth = await dialog
          .locator('.review-inspector-scroll')
          .evaluate((node) => Number.parseFloat(getComputedStyle(node).width));
        for (const width of [523, 524, 525]) {
          await resizeInspector(page, dialog, width);
          await name.scrollIntoViewIfNeeded();
          await expect(name).toBeInViewport();
          const scrollOwner = dialog.locator('.review-inspector-scroll');
          await expect
            .poll(() => scrollOwner.evaluate((node) => node.scrollWidth <= node.clientWidth))
            .toBe(true);
          const viewportBounds = (await scrollOwner.boundingBox())!;
          const steppers = await inspector
            .locator('[data-ui="shared.ui.compact-inspector.numeric-stepper"]')
            .all();
          for (const stepper of steppers) {
            const bounds = (await stepper.boundingBox())!;
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(
              viewportBounds.x + viewportBounds.width
            );
          }
          await page.screenshot({
            path: info.outputPath(`annotation-inspector-${width}.png`),
            fullPage: false,
          });
        }
        await resizeInspector(page, dialog, initialWidth);
      }
      await dialog
        .locator('video')
        .first()
        .evaluate((video) => {
          video.currentTime = 3;
        });
      const canvas = dialog.locator('[data-ui="gallery.videoReview.manualPreview"] canvas');
      await expect(canvas).toBeVisible();
      await expect
        .poll(() =>
          canvas.evaluate((node) =>
            node
              .getContext('2d')!
              .getImageData(0, 0, node.width, node.height)
              .data.some((value, index) => index % 4 !== 3 && value > 0)
          )
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('annotation-lane-inspector.png'),
        fullPage: false,
      });
      await name.fill('Field accepted by close');
      await dialog
        .locator('header')
        .getByRole('button', { name: label('common.actions.close'), exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect
        .poll(
          async () =>
            (await persistedReviewContent(page))?.annotationEffects?.instances[0]?.controls.title
        )
        .toBe('Field accepted by close');
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(plates).toHaveCount(6);
      expect((await workspace())?.effectSnapshots).toHaveLength(6);
      if (variant.width === 1280) {
        await page.setViewportSize({ width: 1024, height: 560 });
        const workspaceScroll = dialog.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        await expect
          .poll(() => workspaceScroll.evaluate((node) => node.scrollWidth > node.clientWidth))
          .toBe(true);
        await workspaceScroll.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        await expect(
          dialog
            .locator('header')
            .getByRole('button', { name: label('common.actions.close'), exact: true })
        ).toBeInViewport();
        await page.screenshot({
          path: info.outputPath('annotation-horizontal-scroll-1024.png'),
          fullPage: false,
        });
      }
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
