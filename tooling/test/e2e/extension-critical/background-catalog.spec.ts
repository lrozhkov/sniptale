import { createVideoProject } from '../../../../apps/extension/src/composition/persistence/projects/index.test-support';
import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  SETTINGS_HARNESS_PATH,
  GALLERY_HARNESS_PATH,
  EDITOR_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  createExactBrowserFrameHarnessPayload,
} from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
});

async function serveSvgMime(page: Page) {
  await page.route('**/backgrounds/*.svg', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, contentType: 'image/svg+xml' });
  });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
  { width: 1100, height: 560 },
]) {
  test(`background catalog and acquisition controls ${viewport.width}`, async ({ page }, info) => {
    const host = await startHostServer();
    await serveSvgMime(page);
    try {
      await page.setViewportSize(viewport);
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(
        `${host.origin}${SETTINGS_HARNESS_PATH}?section=editor-resources&view=backgrounds`
      );
      await expect(page.getByText('Cobalt Silk', { exact: true })).toBeVisible();
      await expect(page.getByText('Sunset Mist', { exact: true })).toHaveCount(1);
      await page.screenshot({ path: info.outputPath('background-settings.png'), fullPage: false });
      await page.getByRole('button', { name: 'Add background', exact: true }).click();
      await expect(page.getByRole('button', { name: 'From computer', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'From Library', exact: true }).click();
      await expect(page.locator('[data-ui="background.library.drawer"]')).toBeVisible();
      await expect(page.getByText('No images in Library', { exact: true })).toBeVisible();
      await page.locator('[data-ui="background.library.drawer"]').evaluate(async (element) => {
        await Promise.all(
          element
            .closest('.sniptale-modal')
            ?.getAnimations()
            .map((animation) => animation.finished.catch(() => undefined)) ?? []
        );
      });
      await page.screenshot({ path: info.outputPath('background-library.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-ui="background.library.drawer"]')).toHaveCount(0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('all twenty bundled backgrounds decode and SVG raster exports preserve dimensions', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    const bundle = await build({
      stdin: {
        contents:
          "export { BUNDLED_BACKGROUNDS } from './apps/extension/src/composition/persis" +
          "tence/background-presets/bundled'; export { prepareBackgroundImage } from '." +
          "/apps/extension/src/workflows/background-images/intake';",
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
    });
    const result = await page.evaluate(async (code) => {
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const module = await import(url);
      URL.revokeObjectURL(url);
      const results = [];
      for (const item of module.BUNDLED_BACKGROUNDS) {
        const response = await fetch('/' + item.path);
        if (!response.ok) throw new Error(item.path);
        const file = new File([await response.blob()], item.path, {
          type: item.path.endsWith('.svg') ? 'image/svg+xml' : 'image/webp',
        });
        const prepared = await module.prepareBackgroundImage(file);
        const bitmap = await createImageBitmap(prepared);
        results.push({
          id: item.id,
          type: prepared.type,
          width: bitmap.width,
          height: bitmap.height,
        });
        bitmap.close();
      }
      return results;
    }, bundle.outputFiles[0]!.text);
    expect(result).toHaveLength(20);
    for (const item of result) {
      expect(item.width).toBeGreaterThan(1000);
      expect(item.height).toBeGreaterThan(700);
    }
    expect(result.filter((item) => item.type === 'image/png')).toHaveLength(10);
    await info.attach('background-dimensions', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
  { width: 1100, height: 560 },
]) {
  test(`quick editor displays nine backgrounds, reveals the rest and applies a bundled SVG ${viewport.width}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    await serveSvgMime(page);
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      await page.setViewportSize(viewport);
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': viewport.width === 1280 ? 'dark' : 'light',
        },
      });
      await page.goto(
        `${host.origin}${GALLERY_HARNESS_PATH}?theme=${viewport.width === 1280 ? 'dark' : 'light'}`
      );
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.evaluate(async () => {
        await chrome.storage.local.set({
          sniptale_quick_preview_preferences: {
            rasterPreset: '360p',
            frameRate: 'current',
            pausedQuality: 'same',
            showFrameRate: true,
          },
        });
      });
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await page
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await page
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      await page
        .getByRole('group', { name: label('gallery.videoReview.background'), exact: true })
        .getByRole('button', { name: label('gallery.videoReview.backgroundImage'), exact: true })
        .click();
      const picker = page.locator('[data-ui="background.image.picker"]');
      await expect(picker.locator('button[aria-pressed]')).toHaveCount(9);
      await picker.getByRole('button', { name: 'Show more', exact: true }).click();
      await expect(picker.locator('button[aria-pressed]')).toHaveCount(20);
      let release!: () => void;
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/backgrounds/*.svg', async (route) => {
        if (route.request().resourceType() === 'fetch') await hold;
        const response = await route.fetch();
        await route.fulfill({ response, contentType: 'image/svg+xml' });
      });

      const canvas = page.locator(
        '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
      );
      const video = page.locator('[data-ui="gallery.videoReview.stage"] video').first();
      await expect(canvas).toBeVisible();
      await video.evaluate((node: HTMLVideoElement) => {
        node.currentTime = 1;
      });
      await expect
        .poll(() =>
          video.evaluate((node: HTMLVideoElement) => !node.seeking && node.currentTime === 1)
        )
        .toBe(true);
      const pausedTime = await video.evaluate((node: HTMLVideoElement) => node.currentTime);
      const edgePixel = () =>
        canvas.evaluate((node: HTMLCanvasElement) => [
          ...node.getContext('2d')!.getImageData(1, Math.floor(node.height / 2), 1, 1).data,
        ]);
      const previousPixel = await edgePixel();
      const chosen = picker.getByRole('button', { name: 'Blue Hour', exact: true });
      await chosen.scrollIntoViewIfNeeded();
      const beforeLoading = await picker.boundingBox();
      await chosen.click();
      await expect(chosen).toHaveAttribute('aria-busy', 'true');
      await expect(chosen.getByRole('status')).toBeVisible();
      expect(await picker.boundingBox()).toEqual(beforeLoading);
      await expect(
        page.getByText(label('gallery.videoReview.backgroundImporting'), { exact: true })
      ).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath('background-thumbnail-loading.png'),
        fullPage: false,
      });
      release();
      await expect(chosen).toHaveAttribute('aria-busy', 'false');
      await expect(
        page.getByText(label('gallery.videoReview.previewFailed'), { exact: true })
      ).toHaveCount(0);
      await expect.poll(edgePixel).not.toEqual(previousPixel);
      expect(await video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBe(pausedTime);
      await expect(page.locator('[data-ui="gallery.videoReview.previewFPS"]')).toHaveText('— FPS');

      await expect(
        page.getByText(label('gallery.videoReview.backgroundImportFailed'), { exact: true })
      ).toHaveCount(0);
      await expect(picker.getByRole('button', { name: 'Blue Hour', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect
        .poll(() =>
          page.evaluate(
            async () =>
              (await window.__sniptaleHarness?.getMediaLibraryState())?.filter(
                (item) => item.mimeType === 'image/png'
              ).length ?? 0
          )
        )
        .toBe(0);
      await page.screenshot({ path: info.outputPath('quick-background-svg.png'), fullPage: false });
      await picker.getByRole('button', { name: 'From Library', exact: true }).click();
      await expect(page.locator('[data-ui="background.library.drawer"]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-ui="background.library.drawer"]')).toHaveCount(0);
      await expect(page.locator('[data-ui="gallery.videoReview.dialog"]')).toBeVisible();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`image editor background selection ${viewport.width}`, async ({ page }, info) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize(viewport);
      await serveSvgMime(page);
      await applyHarnessBootstrap(page, {
        apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
        editorBootstrapPayload: createExactBrowserFrameHarnessPayload(),
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}`);
      await page.locator('[data-ui="editor.floating.layers.mode.frame"]').click();
      await page
        .locator('[data-ui="editor.frame.background-mode"]')
        .getByRole('button', { name: 'Image', exact: true })
        .click();
      const picker = page.locator('[data-ui="background.image.picker"]');
      await expect(picker.locator('button[aria-pressed]')).toHaveCount(9);
      await picker.getByRole('button', { name: 'Show more', exact: true }).click();
      await picker.getByRole('button', { name: 'Blue Hour', exact: true }).click();
      await expect(picker.getByRole('button', { name: 'Blue Hour', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('image-background-svg.png'), fullPage: false });
      await picker.getByRole('button', { name: 'From Library', exact: true }).click();
      await expect(page.locator('[data-ui="background.library.drawer"]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-ui="background.library.drawer"]')).toHaveCount(0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
  test(`full video editor background selection ${viewport.width}`, async ({ page }, info) => {
    const host = await startHostServer();
    try {
      const project = createVideoProject({
        id: 'background-video',
        name: 'Background proof',
        createdAt: 1,
        updatedAt: 1,
      });
      await page.setViewportSize(viewport);
      await serveSvgMime(page);
      await applyHarnessBootstrap(page, {
        apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`);
      await page.getByRole('button', { name: 'Background', exact: true }).click();
      await page.getByRole('button', { name: 'Background type', exact: true }).click();
      await page.getByRole('option', { name: 'Image', exact: true }).click();
      const picker = page.locator('[data-ui="background.image.picker"]');
      await expect(picker.locator('button[aria-pressed]')).toHaveCount(9);
      await picker.getByRole('button', { name: 'Show more', exact: true }).click();
      await picker.getByRole('button', { name: 'Blue Hour', exact: true }).click();
      await expect(picker.getByRole('button', { name: 'Blue Hour', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await page.screenshot({ path: info.outputPath('video-background-svg.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('custom SVG catalog upload creates one reusable Library image', async ({ page }, info) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1280, height: 560 });
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en' },
    });
    await page.goto(
      `${host.origin}${SETTINGS_HARNESS_PATH}?section=editor-resources&view=backgrounds`
    );
    await page.getByRole('button', { name: 'Add background', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'My background.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#4455aa"/></svg>'
      ),
    });
    await expect(page.getByText('My background', { exact: true })).toBeVisible();
    const rows = await page.evaluate(
      async () => await window.__sniptaleHarness?.getMediaLibraryState()
    );
    expect(rows).toHaveLength(1);
    expect(rows![0]!.mimeType).toBe('image/png');
    await page.screenshot({ path: info.outputPath('custom-background.png'), fullPage: false });
    await page.getByRole('button', { name: 'Add background', exact: true }).click();
    await page.getByRole('button', { name: 'From Library', exact: true }).click();
    const drawer = page.locator('[data-ui="background.library.drawer"]');
    await drawer.getByRole('button', { name: 'My background.png', exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByText('My background', { exact: true })).toHaveCount(2);
    expect(
      await page.evaluate(
        async () => (await window.__sniptaleHarness?.getMediaLibraryState())?.length
      )
    ).toBe(1);
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
