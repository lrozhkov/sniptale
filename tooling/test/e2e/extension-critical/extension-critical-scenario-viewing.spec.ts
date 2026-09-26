import { test, expect } from '../support/extension-fixture';
import type { Page } from '@playwright/test';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createTourDocument,
  createTourImageSlide,
} from '../../../../apps/extension/src/features/scenario/project/factories';

function fixtureProject() {
  const project = createGuideProject('Library HTML proof', 'html-proof', 1000);
  const step = createGuideStep('Guide step', 'step');
  step.blocks = [
    createGuideImageBlock({
      id: 'block',
      assetId: 'image',
      width: 640,
      height: 360,
      source: { kind: 'import', filename: 'image.png' },
    }),
  ];
  project.items = [step];
  const tour = createTourDocument('tour');
  const slide = createTourImageSlide('first');
  slide.title = 'First slide';
  slide.narration = {
    assetId: 'audio',
    duration: 4,
    trimStart: 0,
    trimEnd: 4,
    gain: 1,
    transcript: '',
  };
  slide.masks = [
    {
      id: 'private',
      kind: 'redact',
      color: '#000000',
      opacity: 1,
      rect: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
    },
  ];
  slide.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: null,
    width: 640,
    height: 360,
    alt: 'Screenshot',
    source: { kind: 'import', filename: 'image.png' },
  };
  slide.hotspots = [
    {
      id: 'next',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: 'Go next',
      text: 'Next slide',
      action: { kind: 'next' },
      appearance: null,
      pulse: true,
    },
  ];
  const second = {
    ...structuredClone(slide),
    id: 'second',
    title: 'Second slide',
    hotspots: [],
    masks: [],
  };
  tour.slides = [slide, second];
  tour.endScreen.button = { label: 'External destination', url: 'https://example.com/' };
  project.tour = tour;
  return project;
}

async function seed(page: Page) {
  await page.evaluate(async (project) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(80, 60, 200, 100);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      }, 'image/png')
    );
    const directory = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('sniptale-assets', { create: true });
    const objects = await directory.getDirectoryHandle('objects', { create: true });
    const file = await objects.getFileHandle('proof-image', { create: true });
    const writer = await file.createWritable();
    await writer.write(blob);
    await writer.close();
    const wav = new Uint8Array(44 + 4 * 8000 * 2);
    const wave = new DataView(wav.buffer);
    const text = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++) wav[offset + i] = value.charCodeAt(i);
    };
    text(0, 'RIFF');
    wave.setUint32(4, wav.length - 8, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    wave.setUint32(16, 16, true);
    wave.setUint16(20, 1, true);
    wave.setUint16(22, 1, true);
    wave.setUint32(24, 8000, true);
    wave.setUint32(28, 16000, true);
    wave.setUint16(32, 2, true);
    wave.setUint16(34, 16, true);
    text(36, 'data');
    wave.setUint32(40, wav.length - 44, true);
    const audioFile = await objects.getFileHandle('proof-audio', { create: true });
    const audioWriter = await audioFile.createWritable();
    await audioWriter.write(wav);
    await audioWriter.close();
    const tx = db.transaction(['scenario_projects', 'scenario_assets', 'asset_refs'], 'readwrite');
    tx.objectStore('scenario_assets').put({
      id: 'audio',
      assetId: 'proof-audio',
      projectId: project.id,
      galleryAssetId: null,
      width: 0,
      height: 0,
      duration: 4,
      size: wav.length,
      mimeType: 'audio/wav',
      createdAt: 1000,
    });
    tx.objectStore('asset_refs').put({
      assetId: 'proof-audio',
      createdAt: 1000,
      location: { kind: 'opfs', objectKey: 'objects/proof-audio' },
      mimeType: 'audio/wav',
      sha256: null,
      size: wav.length,
    });
    tx.objectStore('scenario_projects').put({
      id: project.id,
      project,
      createdAt: 1000,
      updatedAt: 1000,
      workspaceRevision: 1,
      lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
    });
    tx.objectStore('scenario_assets').put({
      id: 'image',
      assetId: 'proof-image',
      projectId: project.id,
      galleryAssetId: null,
      width: 640,
      height: 360,
      size: blob.size,
      mimeType: 'image/png',
      createdAt: 1000,
    });
    tx.objectStore('asset_refs').put({
      assetId: 'proof-image',
      createdAt: 1000,
      location: { kind: 'opfs', objectKey: 'objects/proof-image' },
      mimeType: 'image/png',
      sha256: null,
      size: blob.size,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, fixtureProject());
}

async function storedProject(page: Page, rename?: string) {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('scenario_projects', name ? 'readwrite' : 'readonly');
    const store = tx.objectStore('scenario_projects');
    const entry = await new Promise<Record<string, unknown>>((resolve) => {
      const request = store.get('html-proof');
      request.onsuccess = () => resolve(request.result);
    });
    if (name && typeof entry.project === 'object' && entry.project) {
      entry.project = { ...entry.project, name };
      entry.workspaceRevision = 2;
      store.put(entry);
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
    return JSON.stringify(entry);
  }, rename);
}

test('built Library opens full guide and tour HTML with isolation and committed refresh semantics', async ({
  context,
  extensionId,
}) => {
  const openExtensionPage = async (path: string) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}${path}`);
    return page;
  };
  const library = await openExtensionPage('/apps/extension/src/gallery/index.html');
  await expect(library.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await seed(library);
  const before = await storedProject(library);
  await library.reload();
  await library.getByRole('button', { name: 'Library HTML proof', exact: true }).first().click();
  const openingGuide = context.waitForEvent('page');
  await library.getByRole('link', { name: /Open guide|Открыть руководство/ }).click();
  const guide = await openingGuide;
  const content = guide.frameLocator('.scenario-viewer-document > iframe').frameLocator('iframe');
  await expect(content.getByRole('heading', { name: 'Library HTML proof' })).toBeVisible();
  await expect(content.getByRole('heading', { name: 'Guide step', exact: false })).toBeVisible();
  await expect(guide.locator('.scenario-viewer-document > [role=status]')).toHaveCount(0);
  const child = guide.frames().find((frame) => frame.url().startsWith('blob:'))!;
  expect(
    await child.evaluate(async () => {
      await Promise.all([...document.fonts].map((font) => font.load()));
      await document.fonts.ready;
      return [...document.fonts].every((font) => font.status === 'loaded');
    })
  ).toBe(true);
  expect(
    await child.evaluate(async () => {
      let storage = false,
        parentAccess = false,
        network = false;
      try {
        localStorage.getItem('test');
        storage = true;
      } catch {
        /* opaque origin */
      }
      try {
        void parent.document.body;
        parentAccess = true;
      } catch {
        /* isolated parent */
      }
      try {
        await fetch('https://example.com/');
        network = true;
      } catch {
        /* denied by CSP */
      }
      return {
        storage,
        parentAccess,
        network,
        extension: typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id),
      };
    })
  ).toEqual({ storage: false, parentAccess: false, network: false, extension: false });
  await content.locator('[data-guide-open]').click();
  await expect(content.locator('dialog')).toBeVisible();
  await content.locator('[data-close]').click();
  await guide.setViewportSize({ width: 420, height: 640 });
  await expect(guide.getByRole('button', { name: /Refresh view|Обновить просмотр/ })).toBeVisible();
  expect(await storedProject(library)).toBe(before);
  await storedProject(library, 'Saved update');
  await expect(content.getByRole('heading', { name: 'Library HTML proof' })).toBeVisible();
  await guide.getByRole('button', { name: /Refresh view|Обновить просмотр/ }).click();
  await expect(content.getByRole('heading', { name: 'Saved update' })).toBeVisible();
  await guide.screenshot({ path: '.tmp/scenario-guide-view.png' });
  await guide.evaluate(async () => {
    await chrome.storage.local.set({
      'sniptale-locale-preference': 'ru',
      'sniptale-theme-preference': 'dark',
    });
  });
  await expect(guide.locator('html')).toHaveAttribute('data-theme', 'dark');
  const refresh = guide.getByRole('button', { name: 'Обновить просмотр' });
  await refresh.focus();
  await expect(refresh).toBeFocused();
  await refresh.press('Enter');
  await expect(content.locator('html')).toHaveAttribute('data-theme', 'dark');
  await guide.emulateMedia({ reducedMotion: 'reduce' });
  await guide.screenshot({ path: '.tmp/scenario-guide-view-dark-ru.png' });

  const openingTour = context.waitForEvent('page');
  await library.getByRole('link', { name: /Play tour|Запустить тур/ }).click();
  const tour = await openingTour;
  const player = tour.frameLocator('.scenario-viewer-document > iframe').frameLocator('iframe');
  await expect(player.locator('[data-tour-title]')).toHaveText('First slide');
  await expect(player.getByRole('img', { name: 'Screenshot' })).toBeVisible();
  await player.getByRole('button', { name: /^(Play|Воспроизвести)$/ }).click();
  await expect
    .poll(() =>
      player
        .locator('audio')
        .evaluate(
          (audio) => audio instanceof HTMLAudioElement && !audio.paused && audio.currentTime > 0
        )
    )
    .toBe(true);
  await player.getByRole('button', { name: /^(Pause|Пауза)$/ }).click();
  await player
    .getByRole('button', { name: /Next|Далее/ })
    .last()
    .click();
  await expect(player.locator('[data-tour-title]')).toHaveText('Second slide');
  await tour.screenshot({ path: '.tmp/scenario-tour-view.png' });
  await player.locator('[data-tour-next]').click();
  const destination = player.getByRole('link', { name: 'External destination' });
  await expect(destination).toHaveAttribute('rel', 'noopener noreferrer');
  await context.route('https://example.com/**', (route) => route.fulfill({ body: 'Destination' }));
  const openingExternal = context.waitForEvent('page');
  await destination.click();
  const external = await openingExternal;
  await external.waitForLoadState();
  expect(await external.evaluate(() => window.opener)).toBeNull();
  await external.close();
  await tour.close();
  await guide.close();
  expect(context.pages().some((page) => page.url().includes(extensionId))).toBe(true);
});

test('built sandbox rejects invalid and replayed envelopes and isolates executable HTML', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/apps/extension/src/scenario-editor/index.html?view=invalid`
  );
  const nonce = '12345678-1234-1234-1234-123456789abc';
  await page.evaluate(
    async ({ extensionId, nonce }) => {
      const frame = document.createElement('iframe');
      frame.id = 'isolation-proof';
      frame.sandbox.add('allow-scripts', 'allow-popups', 'allow-popups-to-escape-sandbox');
      frame.src = `chrome-extension://${extensionId}/apps/extension/src/tour-preview-sandbox/index.html#${nonce}`;
      const loaded = new Promise((resolve) =>
        frame.addEventListener('load', resolve, { once: true })
      );
      document.body.append(frame);
      await loaded;
      const blob = new Blob(['<!doctype html><h1>Rejected</h1>'], { type: 'text/html' });
      frame.contentWindow?.postMessage(
        { kind: 'tour-preview', mode: 'guide', nonce: 'wrong', blob },
        '*'
      );
      frame.contentWindow?.postMessage({ kind: 'tour-preview', mode: 'unknown', nonce, blob }, '*');
      frame.contentWindow?.postMessage(
        {
          kind: 'tour-preview',
          mode: 'tour',
          nonce,
          blob: new Blob(['script'], { type: 'text/javascript' }),
        },
        '*'
      );
      frame.contentWindow?.postMessage(
        {
          kind: 'tour-preview',
          mode: 'guide',
          nonce,
          blob: new Blob([new Uint8Array(192 * 1024 * 1024 + 1)], { type: 'text/html' }),
        },
        '*'
      );
    },
    { extensionId, nonce }
  );
  const sandbox = page.frameLocator('#isolation-proof');
  await expect(sandbox.locator('iframe')).toHaveCount(0);
  await page.evaluate(async (nonce) => {
    const frame = document.querySelector('#isolation-proof');
    if (!(frame instanceof HTMLIFrameElement)) throw new Error('Missing sandbox');
    const script = "document.body.dataset.executed='yes';";
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
    const html = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'"><body><h1>Accepted</h1><script>${script}</script>`;
    const blob = new Blob([html], { type: 'text/html' });
    frame.contentWindow?.postMessage({ kind: 'tour-preview', mode: 'guide', nonce, blob }, '*');
    frame.contentWindow?.postMessage(
      {
        kind: 'tour-preview',
        mode: 'guide',
        nonce,
        blob: new Blob(['<h1>Replay</h1>'], { type: 'text/html' }),
      },
      '*'
    );
  }, nonce);
  await expect(sandbox.frameLocator('iframe').locator('body')).toHaveAttribute(
    'data-executed',
    'yes'
  );
  await expect(sandbox.frameLocator('iframe').getByRole('heading')).toHaveText('Accepted');
  const child = page.frames().find((frame) => frame.url().startsWith('blob:'))!;
  expect(
    await child.evaluate(async () => {
      let storage = false,
        network = false,
        topAccess = false;
      try {
        indexedDB.open('sniptale-db');
        storage = true;
      } catch {
        /* opaque origin */
      }
      try {
        void top?.document.body;
        topAccess = true;
      } catch {
        /* isolated */
      }
      try {
        await fetch('https://example.com/');
        network = true;
      } catch {
        /* CSP */
      }
      return {
        storage,
        network,
        topAccess,
        extension: typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id),
      };
    })
  ).toEqual({ storage: false, network: false, topAccess: false, extension: false });
  await page.locator('#isolation-proof').evaluate((frame) => frame.remove());
  await expect.poll(() => child.isDetached()).toBe(true);
  await page.close();
});
