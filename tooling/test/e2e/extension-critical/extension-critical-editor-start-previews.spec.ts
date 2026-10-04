import { test, expect } from '../support/extension-fixture';

test('image start shows the saved edited composition instead of the original thumbnail', async ({
  context,
  extensionId,
}, info) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = `chrome-extension://${extensionId}/apps/extension/src`;
  await page.goto(`${base}/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(0, 0, 640, 360);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG failed'))))
    );
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('sniptale-db');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(['media_library', 'thumbnails'], 'readwrite');
    tx.objectStore('media_library').put({
      id: 'preview-image',
      kind: 'screenshot',
      source: { kind: 'screenshot' },
      filename: 'Preview proof.png',
      originalFilename: 'Original.png',
      createdAt: 1000,
      updatedAt: 1000,
      workspaceRevision: 0,
      size: blob.size,
      mimeType: blob.type,
      width: 640,
      height: 360,
      duration: null,
      sourceUrl: null,
      sourceTitle: null,
      sourceFavicon: null,
      tags: [],
      lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
      blob,
    });
    tx.objectStore('thumbnails').put({
      assetId: 'preview-image',
      blob,
      createdAt: 1000,
      updatedAt: 1000,
      width: 640,
      height: 360,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  const url = `${base}/editor/index.html`;
  await page.goto(`${url}?assetId=preview-image`);
  const pencil = page.locator('[data-ui="editor.floating.tool-rail.pencil"]');
  await expect(pencil).toBeEnabled();
  await pencil.click();
  const canvas = page.locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas is missing');
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 12 });
  await page.mouse.up();
  const readSaved = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('sniptale-db');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const read = (store: string, key: IDBValidKey) =>
        new Promise<unknown>((resolve, reject) => {
          const r = db.transaction(store).objectStore(store).get(key);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      const root = await read('media_library', 'preview-image');
      const presentation = await read('aggregate_presentations', ['image', 'preview-image']);
      db.close();
      if (
        !root ||
        typeof root !== 'object' ||
        !('workspaceRevision' in root) ||
        typeof root.workspaceRevision !== 'number' ||
        !presentation ||
        typeof presentation !== 'object' ||
        !('presentationRevision' in presentation) ||
        presentation.presentationRevision !== root.workspaceRevision ||
        !('previewBlob' in presentation) ||
        !(presentation.previewBlob instanceof Blob) ||
        !('blob' in root) ||
        !(root.blob instanceof Blob)
      )
        return null;
      const digest = async (blob: Blob) =>
        Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
        ).join('-');
      return {
        revision: root.workspaceRevision,
        hash: await digest(presentation.previewBlob),
        original: await digest(root.blob),
      };
    });
  await expect
    .poll(readSaved)
    .toMatchObject({ revision: expect.any(Number), hash: expect.any(String) });
  const saved = await readSaved();
  expect(saved?.revision).toBeGreaterThan(0);
  expect(saved?.hash).not.toBe(saved?.original);
  await page.goto(url);
  const card = page
    .locator('[data-ui="editor.start.project"]')
    .filter({ hasText: 'Preview proof.png' });
  const preview = card.locator('img');
  await expect(preview).toBeVisible();
  const hash = await preview.evaluate(async (image: HTMLImageElement) => {
    await image.decode();
    const blob = await (await fetch(image.src)).blob();
    return Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
    ).join('-');
  });
  expect(hash).toBe(saved?.hash);
  await page.screenshot({ path: info.outputPath('edited-image-start-preview.png') });
  await card.click();
  await expect(pencil).toBeEnabled();
  await expect.poll(readSaved).toMatchObject({ revision: saved?.revision, hash: saved?.hash });
});

test('video start refreshes its cover after deleting the first source clip and reopening', async ({
  context,
  extensionId,
}, info) => {
  const { createEmptyVideoProject, createVideoProjectAsset } =
    await import('../../../../apps/extension/src/features/video/project/factories/creation');
  const { createVideoClipFromAsset } =
    await import('../../../../apps/extension/src/features/video/project/factories/clip');
  const { VideoProjectAssetType } =
    await import('../../../../apps/extension/src/features/video/project/types');
  const project = createEmptyVideoProject('Video preview proof');
  project.assets = ['red', 'blue'].map((color) =>
    createVideoProjectAsset(
      color,
      VideoProjectAssetType.IMAGE,
      { kind: 'library-asset', mediaId: `cover-${color}` },
      {
        audioPeaks: null,
        duration: null,
        hasAudio: false,
        height: 360,
        mimeType: 'image/png',
        size: 1,
        width: 640,
      }
    )
  );
  project.clips = project.assets.map((asset, index) => {
    const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, index * 5);
    clip.duration = 5;
    return clip;
  });
  const firstClip = project.clips[0]!;
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = `chrome-extension://${extensionId}/apps/extension/src`;
  await page.goto(`${base}/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await page.evaluate(async (project) => {
    const images = await Promise.all(
      ['red', 'blue'].map(async (color) => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 640, 360);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Missing PNG'))))
        );
        return { color, blob };
      })
    );
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['media_library', 'video_projects'], 'readwrite');
    for (const { color, blob } of images)
      tx.objectStore('media_library').put({
        id: `cover-${color}`,
        kind: 'screenshot',
        source: { kind: 'screenshot' },
        filename: `${color}.png`,
        originalFilename: `${color}.png`,
        createdAt: 1000,
        updatedAt: 1000,
        workspaceRevision: 0,
        size: blob.size,
        mimeType: blob.type,
        width: 640,
        height: 360,
        duration: null,
        sourceUrl: null,
        sourceTitle: null,
        sourceFavicon: null,
        tags: [],
        lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
        blob,
      });
    tx.objectStore('video_projects').put({
      id: project.id,
      project,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      workspaceRevision: 1,
      lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, project);
  const url = `${base}/video-editor/index.html`;
  const card = page.locator('[data-ui="editor.start.project"]').filter({ hasText: project.name });
  const center = () =>
    card.locator('img').evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0, 640, 360);
      return Array.from(ctx.getImageData(320, 180, 1, 1).data).slice(0, 3);
    });
  await page.goto(url);
  await expect(card.locator('img')).toBeVisible();
  await expect.poll(async () => (await center())[0]).toBeGreaterThan(240);
  expect((await center())[2]).toBeLessThan(10);
  await card.click();
  const clip = page.locator(`[data-project-timeline-clip="${firstClip.id}"]`);
  await expect(clip).toBeVisible();
  await clip.click();
  await page.keyboard.press('Delete');
  await expect(clip).toHaveCount(0);
  const saved = () =>
    page.evaluate(async (id) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
      });
      const row: unknown = await new Promise((resolve) => {
        const request = db.transaction('video_projects').objectStore('video_projects').get(id);
        request.onsuccess = () => resolve(request.result);
      });
      db.close();
      return row;
    }, project.id);
  await expect
    .poll(saved)
    .toMatchObject({ project: { clips: [expect.objectContaining({ id: project.clips[1]!.id })] } });
  await page.goto(url);
  await expect(card.locator('img')).toBeVisible();
  await expect.poll(async () => (await center())[2]).toBeGreaterThan(240);
  expect((await center())[0]).toBeLessThan(10);
  await page.screenshot({ path: info.outputPath('saved-video-cover.png') });
  await card.click();
  await expect(page.locator('[data-project-timeline-clip]')).toHaveCount(1);
  await page.close();
});

test('scenario start uses the saved remaining tour slide after removing the first slide', async ({
  context,
  extensionId,
}, info) => {
  const { createGuideProject, createTourDocument, createTourImageSlide } =
    await import('../../../../apps/extension/src/features/scenario/project/factories');
  const project = createGuideProject('Scenario preview proof');
  project.tour = createTourDocument();
  project.tour.slides = ['red', 'blue'].map((color) => {
    const slide = createTourImageSlide();
    slide.title = `Cover ${color}`;
    slide.image = {
      assetId: `tour-cover-${color}`,
      galleryAssetId: null,
      editDocumentId: null,
      width: 640,
      height: 360,
      alt: color,
      source: { kind: 'import', filename: `${color}.png` },
    };
    return slide;
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = `chrome-extension://${extensionId}/apps/extension/src`;
  await page.goto(`${base}/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          typeof (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toBe('string');
  await page.evaluate(async (project) => {
    localStorage.setItem('sniptale-locale-preference', 'en');
    await chrome.storage.local.set({ 'sniptale-locale-preference': 'en' });
    const directory = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('sniptale-assets', { create: true });
    const objects = await directory.getDirectoryHandle('objects', { create: true });
    const assets = await Promise.all(
      ['red', 'blue'].map(async (color) => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 640, 360);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Missing PNG'))))
        );
        const id = `tour-cover-${color}`;
        const file = await objects.getFileHandle(id, { create: true });
        const writer = await file.createWritable();
        await writer.write(blob);
        await writer.close();
        return { id, blob };
      })
    );
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['scenario_projects', 'scenario_assets', 'asset_refs'], 'readwrite');
    for (const { id, blob } of assets) {
      tx.objectStore('scenario_assets').put({
        id,
        assetId: id,
        projectId: project.id,
        galleryAssetId: null,
        width: 640,
        height: 360,
        size: blob.size,
        mimeType: blob.type,
        createdAt: 1000,
      });
      tx.objectStore('asset_refs').put({
        assetId: id,
        createdAt: 1000,
        location: { kind: 'opfs', objectKey: `objects/${id}` },
        mimeType: blob.type,
        sha256: null,
        size: blob.size,
      });
    }
    tx.objectStore('scenario_projects').put({
      id: project.id,
      project,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      workspaceRevision: 1,
      lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, project);
  const url = `${base}/scenario-editor/index.html`;
  const card = page.locator('[data-ui="editor.start.project"]').filter({ hasText: project.name });
  const center = () =>
    card.locator('img').evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0, 640, 360);
      return Array.from(ctx.getImageData(320, 180, 1, 1).data).slice(0, 3);
    });
  await page.goto(url);
  await expect(card.locator('img')).toBeVisible();
  expect((await center())[0]).toBeGreaterThan(240);
  await card.click();
  await page.getByRole('button', { name: 'Interactive tour', exact: true }).click();
  const slideActions = page.locator('.tour-slide-actions button').first();
  await slideActions.focus();
  await slideActions.press('Enter');
  await page
    .getByRole('group', { name: 'Slide actions', exact: true })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(page.locator('.tour-slide-title', { hasText: 'Cover red' })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open('sniptale-db');
          request.onsuccess = () => resolve(request.result);
        });
        const row: unknown = await new Promise((resolve) => {
          const request = db
            .transaction('scenario_projects')
            .objectStore('scenario_projects')
            .get(id);
          request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return row;
      }, project.id)
    )
    .toMatchObject({
      project: { tour: { slides: [expect.objectContaining({ title: 'Cover blue' })] } },
    });
  await page.goto(url);
  await expect(card.locator('img')).toBeVisible();
  expect((await center())[2]).toBeGreaterThan(240);
  expect((await center())[0]).toBeLessThan(10);
  await page.screenshot({ path: info.outputPath('saved-scenario-cover.png') });
  await card.click();
  await page.getByRole('button', { name: 'Interactive tour', exact: true }).click();
  await expect(page.locator('.tour-slide-title', { hasText: 'Cover blue' })).toBeVisible();
  await expect(page.locator('.tour-slide-title', { hasText: 'Cover red' })).toHaveCount(0);
  await page.close();
});
