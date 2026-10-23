import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import {
  chooseInspectorValue,
  checkInspectorLabels,
  checkInspectorPaintedFont,
} from '../support/inspector-utilities';
import { readNativeVideoProject } from '../support/native-video-project';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../support/effect-v1-corpus.test-support';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

for (const variant of [
  { width: 1280, height: 560, locale: 'en', theme: 'light', format: 'WEBM' },
  { width: 1920, height: 900, locale: 'ru', theme: 'dark', format: 'MP4' },
] as const) {
  test(`resource catalog and personal preset survive backup, editing, reopening and ${variant.format} export`, async ({
    page: source,
    browser,
  }, info) => {
    test.setTimeout(120_000);
    const { locale, theme, width, height, format } = variant;
    let page = source;
    page.setDefaultTimeout(10_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(
      (value) => localStorage.setItem('sniptale-locale-preference', value),
      locale
    );
    let restoredContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    await page.setViewportSize({ width, height });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?theme=${theme}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page
        .getByRole('button', { name: label('videoEditor.app.newProjectAction'), exact: true })
        .click();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await page
        .locator(
          '[data-ui="video-editor.viewer.open-effects"], [data-ui="video-editor.library-tab.effects"]'
        )
        .first()
        .click();
      const dock = page.locator('[data-ui="video-editor.effects-library.dock"]');
      await expect(dock).toBeVisible();
      const specimen = EFFECT_BUNDLE_CORPUS.find(
        (item) => item.accepted && item.artifact.includes('asset-bearing-conformance')
      );
      if (!specimen) throw new Error('Missing resource catalog corpus');
      const chooser = page.waitForEvent('filechooser');
      await dock
        .getByRole('button', { name: label('videoEditor.effectsLibrary.importPack'), exact: true })
        .click();
      await (
        await chooser
      ).setFiles({
        name: 'resource.sniptale-bundle.zip',
        mimeType: 'application/zip',
        buffer: await resourcePresetBundle(readEffectBundleCorpusArchive(specimen)),
      });
      await page.locator('[data-ui="video-editor.library-tab.annotations"]').click();
      await chooseInspectorValue(
        page,
        dock,
        label('videoEditor.effectsLibrary.theme'),
        locale === 'en' ? 'Resource theme' : 'Ресурсная тема'
      );
      const document = page
        .locator('[data-effect-document="neutral-runtime-conformance"]')
        .filter({ hasText: locale === 'en' ? 'Bright' : 'Светлый' });
      await expect(document).toBeVisible();
      await document.hover();
      await document
        .getByRole('button', {
          name: label('videoEditor.effectsLibrary.applyToScene'),
          exact: true,
        })
        .click();
      await page.locator('[data-ui="video-editor.materials.close"]').click();
      const panel = page.locator('[data-ui="video-editor.inspector.content"]');
      if (!(await panel.locator('[data-presentation="all"]').isVisible())) {
        await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      }
      const presets = panel.locator('[data-ui="video-editor.effect-presets"]');
      await chooseInspectorValue(
        page,
        presets,
        label('videoEditor.effectsLibrary.visualPreset'),
        locale === 'en' ? 'Deep' : 'Глубокий'
      );
      await presets
        .getByRole('button', { name: label('videoEditor.effectsLibrary.savePreset'), exact: true })
        .click();
      await presets
        .getByRole('textbox', { name: label('videoEditor.effectsLibrary.presetName'), exact: true })
        .fill('Resource personal');
      await presets
        .getByRole('button', { name: label('common.actions.save'), exact: true })
        .click();
      await expect(
        presets.getByRole('textbox', {
          name: label('videoEditor.effectsLibrary.presetName'),
          exact: true,
        })
      ).toHaveCount(0);
      await chooseInspectorValue(
        page,
        presets,
        label('videoEditor.effectsLibrary.defaultPreset'),
        'Resource personal'
      );
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.effectInstances?.[0]?.controls['intensity']
        )
        .toBe(0.5);
      const sourceProject = (await readNativeVideoProject(page))!;
      // Harness pages reset chrome.storage on navigation; carry the UI-authored value forward.
      const storage = await page.evaluate(() => chrome.storage.local.get(null));
      await applyHarnessBootstrap(page, { preserveMediaLibrary: true, storage });
      const sourceHashes = await readCatalogResourceHashes(page);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.header.storage"] > button').click();
      await page
        .getByRole('menuitem', { name: label('gallery.app.exportBackup'), exact: true })
        .click();
      const backup = page
        .getByRole('dialog')
        .getByRole('button', { name: label('gallery.backupExportModal.export'), exact: true });
      await backup.scrollIntoViewIfNeeded();
      await backup.click();
      const files = () =>
        page.evaluate(
          () =>
            window.__sniptaleHarness
              ?.getSavedFiles()
              .filter((file) => file.filename.endsWith('.zip')) ?? []
        );
      await expect.poll(async () => (await files()).length).toBe(1);
      const archive = (await files())[0]!;
      await writeFile(info.outputPath('resource-catalog-backup.zip'), Buffer.from(archive.bytes));
      restoredContext = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      page = await restoredContext.newPage();
      page.setDefaultTimeout(10_000);
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript(
        (value) => localStorage.setItem('sniptale-locale-preference', value),
        locale
      );
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
      await page.locator('[data-ui="gallery.header.storage"] > button').click();
      await page
        .getByRole('menuitem', { name: label('gallery.app.importBackup'), exact: true })
        .click();
      await page.locator('input[accept=".zip,application/zip"]').setInputFiles({
        name: 'resource-catalog.zip',
        mimeType: 'application/zip',
        buffer: Buffer.from(archive.bytes),
      });
      await page
        .getByRole('button', { name: label('gallery.importModal.restore'), exact: true })
        .click();
      await expect(
        page.getByText(label('gallery.importModal.progressCompleted'), { exact: true })
      ).toBeVisible();
      const hashes = await readCatalogResourceHashes(page);
      expect(hashes).toEqual(sourceHashes);
      expect(hashes).toHaveLength(1);
      await page.screenshot({ path: info.outputPath('catalog-restored.png'), fullPage: false });
      await writeFile(info.outputPath('catalog-resources.json'), JSON.stringify({ hashes }));
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?theme=${theme}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page
        .getByRole('button', { name: label('videoEditor.app.newProjectAction'), exact: true })
        .click();
      await page
        .locator(
          '[data-ui="video-editor.viewer.open-effects"], [data-ui="video-editor.library-tab.effects"]'
        )
        .first()
        .click();
      await page.locator('[data-ui="video-editor.library-tab.annotations"]').click();
      const restoredDock = page.locator('[data-ui="video-editor.effects-library.dock"]');
      await chooseInspectorValue(
        page,
        restoredDock,
        label('videoEditor.effectsLibrary.theme'),
        locale === 'en' ? 'Resource theme' : 'Ресурсная тема'
      );
      const personal = page
        .locator('[data-effect-document="neutral-runtime-conformance"]')
        .filter({ hasText: 'Resource personal' });
      await expect(personal).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: info.outputPath('catalog-personal-restored-library.png'),
        fullPage: false,
      });
      await personal.hover();
      await personal
        .getByRole('button', {
          name: label('videoEditor.effectsLibrary.applyToScene'),
          exact: true,
        })
        .click();
      await page.locator('[data-ui="video-editor.materials.close"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.effectInstances?.[0]?.controls)
        .toEqual({ accent: '#e020b0', intensity: 0.5 });
      const restoredPanel = page.locator('[data-ui="video-editor.inspector.content"]');
      if (!(await restoredPanel.locator('[data-presentation="all"]').isVisible()))
        await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await expect(
        restoredPanel.getByRole('button', {
          name: label('videoEditor.effectsLibrary.defaultPreset'),
          exact: true,
        })
      ).toContainText('Resource personal');
      const intensity = restoredPanel.getByRole('textbox', {
        name: locale === 'en' ? 'Intensity' : 'Интенсивность',
        exact: true,
      });
      await intensity.fill('0.65');
      await intensity.press('Enter');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.effectInstances?.[0]?.controls['intensity']
        )
        .toBe(0.65);
      const edited = (await readNativeVideoProject(page))!;
      expect(edited.id).not.toBe(sourceProject.id);
      expect(await readNativeVideoProject(page, sourceProject.id)).toEqual(sourceProject);
      await checkInspectorLabels(restoredPanel);
      await checkInspectorPaintedFont(page, intensity, 'catalog-personal-intensity');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('catalog-personal-inspector.png'),
        fullPage: false,
      });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readNativeVideoProject(page, edited.id)).toEqual(edited);
      const clip = edited.clips.find((item) => item.type === 'EFFECT');
      if (!clip) throw new Error('Missing personal effect host');
      await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
      const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await playhead.press('Home');
      for (let index = 0; index < 30; index++) await playhead.press('ArrowRight');
      const point = (x: number, y: number) => ({
        x: Math.round(clip.transform.x + (x * clip.transform.width) / 1280),
        y: Math.round(clip.transform.y + (y * clip.transform.height) / 720),
      });
      const resourcePoint = point(680, 360);
      const appearancePoint = point(60, 60);
      const pixel = (position: { x: number; y: number }) =>
        page.locator('[data-preview-stage-canvas]').evaluate(
          (node: HTMLCanvasElement, p) => {
            const scale = Math.min(node.width / p.width, node.height / p.height);
            return [
              ...node
                .getContext('2d')!
                .getImageData(
                  Math.round((node.width - p.width * scale) / 2 + p.x * scale),
                  Math.round((node.height - p.height * scale) / 2 + p.y * scale),
                  1,
                  1
                ).data,
            ];
          },
          { ...position, width: edited.width, height: edited.height }
        );
      await expect.poll(() => pixel(resourcePoint)).toEqual([255, 134, 24, 255]);
      await page.screenshot({
        path: info.outputPath('catalog-personal-reopened.png'),
        fullPage: false,
      });
      const output = await encodedNativeVideoSamples(page, host.origin, edited, format, [
        { time: 0.5, ...resourcePoint, expected: [255, 134, 24] },
        { time: 0.5, ...appearancePoint, expected: [151, 29, 126] },
      ]);
      expect(output.samples).toHaveLength(2);
      for (const sample of output.samples) expect(sample.error).toBeLessThan(12);
      expect(await readNativeVideoProject(page, sourceProject.id)).toEqual(sourceProject);
      await writeFile(
        info.outputPath('catalog-personal-proof.json'),
        JSON.stringify({ sourceProjectId: sourceProject.id, edited, output })
      );
    } finally {
      await restoredContext?.close();
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

async function readCatalogResourceHashes(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const entries = await new Promise<unknown[]>((resolve, reject) => {
        const request = db
          .transaction('video_effect_bundles')
          .objectStore('video_effect_bundles')
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const result: string[] = [];
      for (const entry of entries) {
        if (
          !entry ||
          typeof entry !== 'object' ||
          !('assets' in entry) ||
          !Array.isArray(entry.assets)
        )
          throw new Error('Invalid restored catalog');
        for (const asset of entry.assets) {
          if (
            !asset ||
            typeof asset !== 'object' ||
            !('blob' in asset) ||
            !(asset.blob instanceof Blob)
          )
            throw new Error('Missing restored resource');
          const digest = await crypto.subtle.digest('SHA-256', await asset.blob.arrayBuffer());
          result.push(
            Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
              ''
            )
          );
        }
      }
      return result;
    } finally {
      db.close();
    }
  });
}

async function resourcePresetBundle(archive: Uint8Array) {
  const zip = await JSZip.loadAsync(archive);
  const documentFile = zip.file('effects/neutral-runtime-conformance.sniptale-effect.json');
  if (!documentFile) throw new Error('Missing actual resource effect');
  const base = parseEffectV1Source(await documentFile.async('string'));
  if (!base.document) throw new Error('Invalid actual resource effect');
  const source = JSON.stringify({
    ...base.document,
    objectLayout: { width: 1280, height: 720, resize: 'scale' },
    controls: [
      {
        id: 'accent',
        kind: 'color',
        defaultValue: '#7cf7ff',
        group: 'appearance',
        label: { en: 'Accent', ru: 'Акцент' },
      },
      {
        id: 'intensity',
        kind: 'number',
        defaultValue: 0.8,
        min: 0,
        max: 1,
        step: 0.05,
        group: 'appearance',
        label: { en: 'Intensity', ru: 'Интенсивность' },
      },
    ],
    program: {
      kind: 'graph',
      version: 1,
      commands: [
        { op: 'clear', color: '#101820' },
        {
          op: 'shape',
          shape: 'rect',
          x: 10,
          y: 10,
          width: 100,
          height: 100,
          fill: { op: 'read', path: 'controls.accent' },
          alpha: { op: 'read', path: 'controls.intensity' },
        },
        { op: 'svgParts', assetId: 'neutral-mark', x: 520, y: 240, width: 240, height: 240 },
      ],
    },
    defaultControlPresetId: 'bright',
    controlPresets: [
      {
        id: 'bright',
        label: { en: 'Bright', ru: 'Светлый' },
        theme: { id: 'resource-proof', label: { en: 'Resource theme', ru: 'Ресурсная тема' } },
        style: { id: 'bright', label: { en: 'Bright', ru: 'Светлый' } },
        values: { accent: '#7cf7ff', intensity: 0.8 },
      },
      {
        id: 'deep',
        label: { en: 'Deep', ru: 'Глубокий' },
        theme: { id: 'resource-proof', label: { en: 'Resource theme', ru: 'Ресурсная тема' } },
        style: { id: 'deep', label: { en: 'Deep', ru: 'Глубокий' } },
        values: { accent: '#e020b0', intensity: 0.5 },
      },
    ],
  });
  const parsed = parseEffectV1Source(source);
  if (!parsed.document) throw new Error(JSON.stringify(parsed.diagnostics));
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Missing bundle manifest');
  const manifest: unknown = JSON.parse(await manifestFile.async('string'));
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('effectDocuments' in manifest) ||
    !Array.isArray(manifest.effectDocuments)
  )
    throw new Error('Invalid actual bundle manifest');
  const document = manifest.effectDocuments.find(
    (value: unknown) =>
      value && typeof value === 'object' && 'id' in value && value.id === base.document?.id
  );
  if (
    !document ||
    typeof document !== 'object' ||
    !('path' in document) ||
    typeof document.path !== 'string'
  )
    throw new Error('Missing manifest document');
  const bytes = Buffer.from(source);
  Object.assign(document, {
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  zip.file(document.path, bytes);
  zip.file('manifest.json', JSON.stringify(manifest));
  return zip.generateAsync({ type: 'nodebuffer' });
}
