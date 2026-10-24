import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

const errorCounterKey = '__sniptaleImageMetadataErrorCount';

async function imageErrors(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const count: unknown = Reflect.get(window, key);
    if (typeof count !== 'number') throw new Error('Native image error counter is unavailable');
    return count;
  }, errorCounterKey);
}

async function expectIdleImages(page: Page) {
  // A settled import can leave one queued native error from clearing its source.
  await page.waitForTimeout(100);
  const before = await imageErrors(page);
  await page.waitForTimeout(500);
  expect(await imageErrors(page), 'settled images must stop dispatching errors at idle').toBe(
    before
  );
}

async function imageUpload(page: Page, name: string, color: string) {
  const encoded = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image fixture canvas is unavailable');
    context.fillStyle = fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1]!;
  }, color);
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  };
}

test('image imports stop native error callbacks at idle and recover after decode failure', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ ...PRIMARY_BROWSER_VIEWPORTS[1].size });
  const host = await startHostServer();
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'dark' },
    });
    await page.addInitScript((key) => {
      localStorage.setItem('sniptale-locale-preference', 'en');
      let errors = 0;
      Object.defineProperty(window, key, { get: () => errors });
      // Metadata images are detached. Observe each native image without replacing its loading.
      window.Image = new Proxy(window.Image, {
        construct(target, args, newTarget) {
          const image: unknown = Reflect.construct(target, args, newTarget);
          if (!(image instanceof HTMLImageElement)) throw new Error('Expected a native image');
          image.addEventListener('error', () => errors++);
          return image;
        },
      });
    }, errorCounterKey);
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=dark`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?id=beta-v1-recording&theme=dark`);
    await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
    const materials = page.locator('[data-ui="video-editor.materials"]');
    const input = materials.locator('input[type="file"][accept*="image/"]');
    await input.setInputFiles(await imageUpload(page, 'Idle image.png', '#2563eb'));
    await expect
      .poll(async () =>
        (await readNativeVideoProject(page))?.assets.some(({ name }) => name === 'Idle image.png')
      )
      .toBe(true);
    await expect(materials.locator('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
    await expectIdleImages(page);

    const initial = await readNativeVideoProject(page);
    const errorsBeforeFailure = await imageErrors(page);
    // Admission accepts the PNG signature; the native decoder rejects the truncated image.
    await input.setInputFiles({
      name: 'Invalid image.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    await expect(
      page.getByText(translate('videoEditor.app.materialsImportFailed', 'en'), {
        exact: true,
      })
    ).toBeVisible();
    await expect(materials.locator('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
    expect(await imageErrors(page)).toBeGreaterThan(errorsBeforeFailure);
    expect((await readNativeVideoProject(page))?.assets).toEqual(initial?.assets);
    await expectIdleImages(page);

    await input.setInputFiles(await imageUpload(page, 'Recovered image.png', '#22c55e'));
    await expect
      .poll(async () =>
        (await readNativeVideoProject(page))?.assets.some(
          ({ name }) => name === 'Recovered image.png'
        )
      )
      .toBe(true);
    const recovered = (await readNativeVideoProject(page))?.assets.find(
      ({ name }) => name === 'Recovered image.png'
    );
    if (!recovered) throw new Error('Recovered image material is unavailable');
    const row = materials.locator(`[data-material-id="${recovered.id}"]`);
    await row.locator('[data-material-rename]').click();
    const rename = row.getByRole('textbox', {
      name: translate('videoEditor.app.materialsRename', 'en'),
      exact: true,
    });
    await rename.fill('Edited image');
    await rename.press('Enter');
    await expect
      .poll(
        async () =>
          (await readNativeVideoProject(page))?.assets.find(({ id }) => id === recovered.id)?.name
      )
      .toBe('Edited image');
    await row.locator('[draggable="true"]').click();
    const source = page.locator('[data-ui="video-editor.source-viewer"]');
    await expect(source).toBeVisible();
    await source
      .getByTitle(translate('videoEditor.app.materialsAppend', 'en'), { exact: true })
      .click();
    await expect
      .poll(async () =>
        (await readNativeVideoProject(page))?.clips.some(
          (clip) => clip.type === 'IMAGE' && clip.assetId === recovered.id
        )
      )
      .toBe(true);
    await expectIdleImages(page);
    await page.screenshot({
      path: info.outputPath('image-import-recovered-idle.png'),
      fullPage: false,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
