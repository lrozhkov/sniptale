import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { translate } from '../../../../apps/extension/src/platform/i18n';

type Message = Parameters<typeof translate>[0];
const variants = [
  { width: 1280, height: 560, locale: 'ru', theme: 'dark' },
  { width: 1920, height: 900, locale: 'en', theme: 'light' },
  { width: 960, height: 560, locale: 'en', theme: 'dark' },
] as const;

async function persistedWatermark(page: Page) {
  const raw = await page.evaluate(
    async ({ databaseName, aggregateId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const request = db
            .transaction('video_workspaces')
            .objectStore('video_workspaces')
            .get(aggregateId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    {
      databaseName: betaV1Fixture.databaseName,
      aggregateId: `recording:${betaV1Fixture.records.recordings[0].id}`,
    }
  );
  const workspace = parseVideoWorkspace(raw);
  if (!workspace) throw new Error('Expected a valid persisted video workspace');
  const operation = workspace.history
    .slice(0, workspace.cursor)
    .findLast((item) => item.target === 'advancedContent');
  return {
    cursor: workspace.cursor,
    watermark:
      operation?.target === 'advancedContent'
        ? operation.after.watermark
        : workspace.advanced.watermark,
  };
}

/** The source is red; the current edited presentation is blue and twice as wide as high. */
async function seedEditedLibraryLogo(page: Page) {
  await page.evaluate(async (databaseName) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    const png = async (color: string) => {
      context.fillStyle = color;
      context.fillRect(0, 0, 64, 32);
      return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('PNG unavailable'))),
          'image/png'
        )
      );
    };
    const original = await png('#ff0000'),
      edited = await png('#0000ff');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction(['media_library', 'aggregate_presentations'], 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      tx.objectStore('media_library').put({
        id: 'watermark-library-logo',
        kind: 'image',
        source: { kind: 'screenshot' },
        filename: 'Edited blue logo.png',
        originalFilename: 'Edited blue logo.png',
        createdAt: 1,
        updatedAt: 2,
        size: original.size,
        mimeType: 'image/png',
        width: 64,
        height: 32,
        duration: null,
        sourceUrl: null,
        sourceTitle: null,
        sourceFavicon: null,
        tags: [],
        workspaceRevision: 2,
        imageContentState: 'edited',
        blob: original,
      });
      tx.objectStore('aggregate_presentations').put({
        aggregateId: 'watermark-library-logo',
        aggregateKind: 'image',
        presentationRevision: 2,
        previewBlob: edited,
        thumbnailBlob: edited,
        updatedAt: 2,
      });
      await done;
    } finally {
      db.close();
    }
  }, betaV1Fixture.databaseName);
}

async function libraryCount(page: Page) {
  return page.evaluate(async (databaseName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('media_library').objectStore('media_library').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, betaV1Fixture.databaseName);
}

async function captionPixels(canvas: Locator) {
  return canvas.evaluate((node: HTMLCanvasElement) => {
    const context = node.getContext('2d')!;
    return context
      .getImageData(0, 0, node.width, node.height)
      .data.some((value, index) => index % 4 === 3 && value > 0);
  });
}

/** Drive the real resize handle; measure its CSS container, not an assumed panel/chrome offset. */
async function proveInspectorBreakpoints(
  page: Page,
  inspector: Locator,
  fields: Locator,
  info: TestInfo
) {
  const scroll = inspector.locator('.review-inspector-scroll');
  const width = () =>
    scroll.evaluate((node) => {
      const css = getComputedStyle(node);
      return node.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    });
  const handle = inspector.locator('[data-review-panel-resize="inspector"]');
  for (const target of [523, 524, 525]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await width();
      if (Math.abs(current - target) < 0.5) break;
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(20, box.height / 2));
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + current - target,
        box.y + Math.min(20, box.height / 2),
        { steps: 4 }
      );
      await page.mouse.up();
    }
    await expect.poll(width).toBe(target);
    const sections = inspector.locator('[data-ui="gallery.videoReview.inspectorSections"]:visible');
    await expect(sections).toHaveAttribute('data-presentation', 'all');
    await expect(sections).toHaveCSS('display', target < 524 ? 'block' : 'grid');
    if (target === 524) {
      await scroll.evaluate((node) => {
        node.scrollTop = 0;
      });
      const first = sections.locator('section[data-section="canvas"]');
      const next = sections.locator('section[data-section="window-header"]');
      const other = sections.locator('section[data-section="presentation"]');
      const before = await next.boundingBox();
      const otherBefore = await other.boundingBox();
      await first.locator('summary').first().click();
      await expect(first.locator('details').first()).not.toHaveAttribute('open', '');
      await expect.poll(async () => (await next.boundingBox())!.y).toBeLessThan(before!.y);
      expect((await other.boundingBox())!.y).toBeCloseTo(otherBefore!.y, 0);
      await page.screenshot({
        path: info.outputPath('scene-two-columns-independent-collapse.png'),
        fullPage: false,
      });
      await first.locator('summary').first().click();
    }
    await fields.scrollIntoViewIfNeeded();
    await expect(fields).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`watermark-inspector-content-${target}.png`),
      fullPage: false,
    });
  }
  await handle.focus();
  await handle.press('Home');
}

for (const variant of variants) {
  test(`scene watermark authoring and private logo lifecycle ${variant.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: variant.width, height: variant.height });
    const host = await startHostServer();
    const label = (key: Message) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await seedEditedLibraryLogo(page);
      await page.reload();
      const open = async () => {
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      };
      await open();
      const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
      const button = (key: Message) =>
        review.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      const inspector = review.locator('[data-ui="gallery.videoReview.inspector"]');
      await inspector
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      const fields = inspector.locator('[data-ui="gallery.videoReview.watermarkInspector"]');
      await expect(inspector.locator('.review-inspector-section')).toHaveCount(6);
      expect(
        await inspector
          .locator('.review-inspector-section')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section')))
      ).toEqual(['canvas', 'window-header', 'background', 'presentation', 'watermark', 'audio']);
      await button('gallery.videoReview.backgroundSolid').click();
      await inspector
        .getByRole('textbox', {
          name: label('gallery.videoReview.backgroundPadding'),
          exact: true,
        })
        .hover();
      const padding = inspector.getByRole('slider', {
        name: `${label('gallery.videoReview.backgroundPadding')} range`,
        exact: true,
      });
      await padding.scrollIntoViewIfNeeded();
      // Let the initial mode change settle before testing one held gesture.
      await page.waitForTimeout(350);
      const beforeBackground = (await persistedWatermark(page)).cursor;
      const rangeBox = (await padding.boundingBox())!;
      await page.mouse.move(rangeBox.x + rangeBox.width * 0.6, rangeBox.y + rangeBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(350);
      expect((await persistedWatermark(page)).cursor).toBe(beforeBackground);
      await page.mouse.up();
      await expect
        .poll(async () => (await persistedWatermark(page)).cursor)
        .toBe(beforeBackground + 1);
      await inspector
        .locator('[data-ui="gallery.videoReview.backgroundInspector"]')
        .getByRole('button', { name: label('gallery.videoReview.backgroundNone'), exact: true })
        .click();
      const mode = (key: Message) => fields.getByRole('button', { name: label(key), exact: true });
      const text = fields.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkText'),
        exact: true,
      });
      const overlay = review.locator('[data-ui="gallery.videoReview.watermark"]');
      const canvas = overlay.locator('canvas');
      const settled = async () => {
        // Fields stay editable while the existing advanced writer coalesces a 250ms burst.
        await page.waitForTimeout(300);
        await expect(fields).toHaveAttribute('aria-busy', 'false');
        await expect(review.locator('[data-ui="autosave-control"] button').first()).toHaveAttribute(
          'aria-label',
          `${label('editor.documentActions.autosaveTitle')}: ${label('common.states.saved')}`
        );
      };
      expect((await persistedWatermark(page)).watermark).toBeUndefined();
      await expect(text).toHaveCount(0);
      await mode('gallery.videoReview.watermarkText').click();
      await expect(text).toHaveValue(label('gallery.videoReview.watermarkSeed'));
      await expect.poll(() => captionPixels(canvas)).toBe(true);
      await expect.poll(async () => (await persistedWatermark(page)).watermark?.mode).toBe('text');
      await settled();
      const beforeText = (await persistedWatermark(page)).cursor;
      const video = review.locator('video').first();
      await video.evaluate((node) => {
        node.dataset.watermarkProofIdentity = 'retained';
      });
      const sourceBefore = await video.getAttribute('src');
      await text.fill('Sniptale — Пример');
      await text.press('End');
      await text.press('Shift+Enter');
      await text.pressSequentially('Second line');
      await text.press('Enter');
      await text.press('Tab');
      await expect.poll(async () => (await persistedWatermark(page)).cursor).toBe(beforeText + 1);
      const authored = 'Sniptale — Пример\nSecond line';
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark?.text.value)
        .toBe(authored);
      await text.fill('Discard this draft');
      await text.press('Escape');
      await text.press('Tab');
      await expect(text).toHaveValue(authored);
      await settled();
      expect((await persistedWatermark(page)).cursor).toBe(beforeText + 1);
      await text.fill('x'.repeat(201));
      await text.press('Enter');
      await expect(text).toHaveAttribute('aria-invalid', 'true');
      expect((await persistedWatermark(page)).watermark?.text.value).toBe(authored);
      await text.press('Escape');
      await expect(text).toHaveValue(authored);
      await expect(video).toHaveAttribute('data-watermark-proof-identity', 'retained');
      expect(await video.getAttribute('src')).toBe(sourceBefore);
      await mode('gallery.videoReview.watermarkNone').click();
      await settled();
      await expect(text).toHaveCount(0);
      await expect.poll(() => captionPixels(canvas)).toBe(false);
      await mode('gallery.videoReview.watermarkText').click();
      await expect(text).toHaveValue(authored);
      await mode('gallery.videoReview.watermarkFontMono').click();
      await mode('gallery.videoReview.watermarkBold').click();
      await mode('gallery.videoReview.watermarkItalic').click();
      await expect(mode('gallery.videoReview.watermarkItalic')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await mode('gallery.videoReview.watermarkStrike').click();
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark?.text.strike)
        .toBe(true);
      const size = fields.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkSize'),
        exact: true,
      });
      await size.fill('6');
      await size.press('Enter');
      await size.press('Tab');
      await settled();
      const anchors = fields.locator('[data-ui="watermark.anchors"]');
      for (const anchor of [
        'top-left',
        'top',
        'top-right',
        'left',
        'center',
        'right',
        'bottom-left',
        'bottom',
        'bottom-right',
      ] as const) {
        await anchors
          .getByRole('button', {
            name: label(`gallery.videoReview.watermarkAnchor_${anchor}`),
            exact: true,
          })
          .click();
        await expect
          .poll(async () => (await persistedWatermark(page)).watermark?.placement.anchor)
          .toBe(anchor);
      }
      await anchors
        .getByRole('button', {
          name: label('gallery.videoReview.watermarkAnchor_center'),
          exact: true,
        })
        .click();
      await settled();
      const target = overlay.getByRole('button', {
        name: label('gallery.videoReview.watermark'),
        exact: true,
      });
      await expect(target).toBeVisible();
      await target.scrollIntoViewIfNeeded();
      const dragBefore = (await persistedWatermark(page)).cursor;
      const bounds = (await target.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2 + 24, bounds.y + bounds.height / 2 + 12, {
        steps: 8,
      });
      // Cross the normal advanced-content debounce budget while the pointer remains held.
      await page.waitForTimeout(350);
      expect((await persistedWatermark(page)).cursor).toBe(dragBefore);
      await page.mouse.up();
      await expect.poll(async () => (await persistedWatermark(page)).cursor).toBe(dragBefore + 1);
      const dragged = (await persistedWatermark(page)).watermark!.placement.position!;
      expect(dragged.x).toBeGreaterThan(0.5);
      await target.focus();
      await target.press('ArrowLeft');
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark!.placement.position!.x)
        .toBeLessThan(dragged.x);
      await target.press('Space');
      await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(false);
      // Playback removes the editing hitbox; the global transport shortcut still owns Space.
      await page.keyboard.press('Space');
      await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
      await fields
        .getByText(label('gallery.videoReview.watermarkPositionExact'), { exact: true })
        .click();
      const x = fields.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkX'),
        exact: true,
      });
      await x.fill('40');
      await x.press('Enter');
      await x.press('Tab');
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark?.placement.position?.x)
        .toBe(0.4);
      await mode('gallery.videoReview.watermarkTiled').click();
      await expect(anchors).toHaveCount(0);
      await expect(target).toHaveCount(0);
      const rotation = fields.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkRotation'),
        exact: true,
      });
      await rotation.fill('20');
      await rotation.press('Enter');
      await rotation.press('Tab');
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark?.tile.rotation)
        .toBe(20);
      await expect(
        fields.getByRole('textbox', {
          name: label('gallery.videoReview.watermarkSpacing'),
          exact: true,
        })
      ).toBeVisible();
      await expect.poll(() => captionPixels(canvas)).toBe(true);
      await rotation.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('watermark-tiled-controls.png'),
        fullPage: false,
      });
      if (variant.width === 1920) await proveInspectorBreakpoints(page, inspector, fields, info);
      const countBefore = await libraryCount(page);
      await mode('gallery.videoReview.watermarkImage').click();
      await settled();
      const upload = fields.locator('input[type="file"]');
      await upload.setInputFiles({
        name: 'animated.gif',
        mimeType: 'image/gif',
        buffer: Buffer.from('GIF89a'),
      });
      await expect(
        fields
          .getByRole('alert')
          .filter({ hasText: label('gallery.videoReview.watermarkImageAnimated') })
      ).toBeVisible();
      expect(await libraryCount(page)).toBe(countBefore);
      await upload.setInputFiles({
        name: 'static-logo.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#ff8000"/></svg>'
        ),
      });
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark?.image?.width)
        .toBe(4096);
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark?.image?.height)
        .toBe(2048);
      await settled();
      expect(await libraryCount(page)).toBe(countBefore);
      const uploadedId = (await persistedWatermark(page)).watermark!.image!.assetId;
      await expect(
        fields.getByRole('img', { name: label('gallery.videoReview.watermarkImage'), exact: true })
      ).toBeVisible();
      await fields
        .getByRole('button', { name: label('settings.editor.backgrounds.library'), exact: true })
        .click();
      const drawer = page.locator('[data-ui="background.library.drawer"]');
      await expect(drawer).toBeVisible();
      await drawer
        .getByRole('button', { name: label('common.actions.close'), exact: true })
        .focus();
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
      await expect(
        fields.getByRole('button', {
          name: label('settings.editor.backgrounds.library'),
          exact: true,
        })
      ).toBeFocused();
      await fields
        .getByRole('button', { name: label('settings.editor.backgrounds.library'), exact: true })
        .click();
      await drawer.locator('button[title="Edited blue logo.png"]').click();
      await expect(drawer).toHaveCount(0);
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark?.image?.width)
        .toBe(64);
      const libraryLogo = (await persistedWatermark(page)).watermark!.image!;
      expect(libraryLogo.height).toBe(32);
      expect(libraryLogo.assetId).not.toBe(uploadedId);
      expect(await libraryCount(page)).toBe(countBefore);
      await expect.poll(() => captionPixels(canvas)).toBe(true);
      await expect
        .poll(() =>
          fields
            .getByRole('img', { name: label('gallery.videoReview.watermarkImage'), exact: true })
            .evaluate(async (node: HTMLImageElement) => {
              await node.decode();
              const probe = document.createElement('canvas');
              probe.width = 1;
              probe.height = 1;
              const context = probe.getContext('2d')!;
              context.drawImage(node, 0, 0, 1, 1);
              return Array.from(context.getImageData(0, 0, 1, 1).data);
            })
        )
        .toEqual([0, 0, 255, 255]);
      await mode('gallery.videoReview.watermarkText').click();
      await expect(text).toHaveValue(authored);
      await mode('gallery.videoReview.watermarkImage').click();
      await settled();
      expect((await persistedWatermark(page)).watermark?.image?.assetId).toBe(libraryLogo.assetId);
      const reset = mode('gallery.videoReview.watermarkReset');
      await reset.scrollIntoViewIfNeeded();
      await expect(reset).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: info.outputPath('watermark-image-footer.png'),
        fullPage: false,
      });
      if (variant.width === 960) {
        const scroll = review.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        expect(await scroll.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        expect(await scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      }
      await button('gallery.videoReview.advancedEditing').click();
      await expect(overlay).toHaveCount(0);
      expect((await persistedWatermark(page)).watermark?.image?.assetId).toBe(libraryLogo.assetId);
      await button('gallery.videoReview.advancedEditing').click();
      await inspector
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      await expect.poll(() => captionPixels(canvas)).toBe(true);
      const opacity = fields.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkOpacity'),
        exact: true,
      });
      await opacity.fill('70');
      await opacity.press('Enter');
      await settled();
      const beforeReset = (await persistedWatermark(page)).cursor;
      await reset.click();
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark?.image?.opacity)
        .toBe(1);
      expect((await persistedWatermark(page)).watermark?.image?.assetId).toBe(libraryLogo.assetId);
      expect((await persistedWatermark(page)).cursor).toBe(beforeReset + 1);
      await button('gallery.videoReview.undo').click();
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark?.image?.assetId)
        .toBe(libraryLogo.assetId);
      await button('gallery.videoReview.redo').click();
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark?.image?.opacity)
        .toBe(1);
      expect((await persistedWatermark(page)).watermark?.image?.assetId).toBe(libraryLogo.assetId);
      await button('gallery.videoReview.undo').click();
      await settled();
      await button('gallery.videoReview.back').click();
      await page.reload();
      await open();
      await inspector
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      await expect
        .poll(async () => (await persistedWatermark(page)).watermark?.image?.assetId)
        .toBe(libraryLogo.assetId);
      await expect.poll(() => captionPixels(canvas)).toBe(true);
      expect(await libraryCount(page)).toBe(countBefore);
      await mode('gallery.videoReview.watermarkText').click();
      await expect(text).toHaveValue(authored);
      await text.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('watermark-reopened.png'), fullPage: false });
      if (variant.locale === 'ru') {
        await page.evaluate(() => chrome.storage.local.set({ 'sniptale-locale-preference': 'en' }));
        const translatedText = fields.getByRole('textbox', {
          name: translate('gallery.videoReview.watermarkText', 'en'),
          exact: true,
        });
        await expect(translatedText).toHaveValue(authored);
        expect((await persistedWatermark(page)).watermark?.text.value).toBe(authored);
        await page.screenshot({
          path: info.outputPath('watermark-locale-preserves-authored-text.png'),
          fullPage: false,
        });
      }
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
