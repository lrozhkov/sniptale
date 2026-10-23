import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import { checkInspectorPaintedFont } from '../support/inspector-utilities';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
  getRuntimeMessagesByType,
  VideoMessageType,
} from '../extension-critical.helpers';

async function latestExportRms(page: Page) {
  const messages = await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED);
  const exportId = messages.at(-1)?.exportId;
  if (typeof exportId !== 'string') throw new Error('Missing completed export');
  return page.evaluate(async (exportId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const entry: unknown = await new Promise((resolve, reject) => {
      const request = db
        .transaction('project_exports', 'readonly')
        .objectStore('project_exports')
        .get(exportId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('assetId' in entry) ||
      typeof entry.assetId !== 'string'
    )
      throw new Error('Missing export bytes');
    const objects = await (
      await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
    ).getDirectoryHandle('objects');
    const file = await (await objects.getFileHandle(entry.assetId)).getFile();
    const context = new AudioContext();
    try {
      const pcm = await context.decodeAudioData(await file.arrayBuffer());
      const channel = pcm.getChannelData(0),
        start = Math.round(0.3 * pcm.sampleRate),
        end = Math.round(0.7 * pcm.sampleRate);
      let squares = 0;
      for (let index = start; index < end; index++) squares += channel[index]! ** 2;
      return Math.sqrt(squares / (end - start));
    } finally {
      await context.close();
    }
  }, exportId);
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'ru' : 'en',
    theme = index === 0 ? 'light' : 'dark',
    format = index === 0 ? 'MP4' : 'WEBM';
  test(`source audio inspector and encoded gain ${viewport.name} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const project = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'Source audio.webm',
        width: 640,
        height: 360,
        duration: 12,
        mimeType: 'video/webm',
        size: bytes.length,
        hasAudio: true,
      });
      project.duration = 2;
      project.clips.forEach((clip) => {
        clip.duration = 2;
        if (clip.type === 'VIDEO' || clip.type === 'AUDIO') clip.sourceDuration = 2;
      });
      const audio = project.clips.find((clip) => clip.type === 'AUDIO');
      if (!audio || audio.type !== 'AUDIO') throw new Error('Missing original audio');
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript((language) => {
        if (window !== window.top) return;
        localStorage.setItem('sniptale-locale-preference', language);
        if (sessionStorage.getItem('source-audio-seeded')) {
          const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
          if (typeof bootstrap === 'object' && bootstrap !== null)
            Reflect.deleteProperty(bootstrap, 'videoProjects');
        }
      }, locale);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 640,
        height: 360,
        duration: 12,
      });
      await page.evaluate(() => sessionStorage.setItem('source-audio-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const open = async () => {
        await page.locator('[data-ui="video-editor.viewer.scene"]').click();
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sourceAudio'), exact: true })
          .click();
      };
      await open();
      const editor = page.locator('[data-ui="video-editor.source-audio"]');
      await editor
        .getByRole('button', {
          name: `${label('videoEditor.sidebar.sourceAudioAdd')}: ${label('videoEditor.sidebar.sourceAudioGain')}`,
          exact: true,
        })
        .click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sourceAudioDocuments?.length)
        .toBe(1);
      await editor.locator('summary').first().click();
      const start = editor.getByRole('textbox', {
        name: label('videoEditor.sidebar.sourceAudioStart'),
        exact: true,
      });
      await start.fill('0.123456');
      await start.press('Enter');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.sourceAudioDocuments?.[0]?.ranges[0]?.start
        )
        .toBe(0.123456);
      const volume = editor.getByRole('textbox', {
        name: label('videoEditor.sidebar.sourceAudioLevel'),
        exact: true,
      });
      await volume.fill('50');
      await volume.press('Enter');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.sourceAudioDocuments?.[0]?.ranges[0]?.volume
        )
        .toBe(0.5);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.sourceAudioDocuments?.[0]?.ranges[0]?.volume
        )
        .toBe(1);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.sourceAudioDocuments?.[0]?.ranges[0]?.volume
        )
        .toBe(0.5);
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await open();
      const summary = editor.locator('details').first();
      if (!(await summary.evaluate((node) => node instanceof HTMLDetailsElement && node.open)))
        await summary.locator('summary').click();
      await expect(start).toHaveValue('0.123456');
      await start.fill('0.999');
      await start.press('Escape');
      await expect(start).toHaveValue('0.123456');
      await start.focus();
      await start.blur();
      await page.evaluate(() => document.fonts.ready);
      await checkInspectorPaintedFont(
        page,
        editor.locator('summary h4').first(),
        'source-audio-font'
      );
      expect(await start.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.screenshot({
        path: info.outputPath('source-audio-inspector.png'),
        fullPage: false,
      });
      await page.setViewportSize({ width: 1200, height: viewport.size.height });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
      ).toBe(true);
      await page.setViewportSize({ ...viewport.size });
      const saved = (await readNativeVideoProject(page))!;
      const addAttenuation = editor.getByRole('button', {
        name: `${label('videoEditor.sidebar.sourceAudioAdd')}: ${label('videoEditor.sidebar.sourceAudioAttenuation')}`,
        exact: true,
      });
      await addAttenuation.click();
      await expect(addAttenuation).toBeEnabled();
      await addAttenuation.click();
      await expect
        .poll(
          async () => (await readNativeVideoProject(page))?.sourceAudioDocuments?.[0]?.mutes.length
        )
        .toBe(2);
      const withMutes = (await readNativeVideoProject(page))!;
      // Retired placements leave editable source intent and a retained material.
      for (const clip of saved.clips) {
        const placement = page.locator(`[data-project-timeline-clip="${clip.id}"]`);
        if (await placement.count()) {
          await placement.evaluate((node) =>
            node.scrollIntoView({ block: 'center', inline: 'nearest' })
          );
          await placement.click();
          const remove = page.getByRole('button', {
            name: label('videoEditor.timeline.delete'),
            exact: true,
          });
          await expect(remove).toBeEnabled();
          await remove.click();
          await expect
            .poll(async () =>
              (await readNativeVideoProject(page))?.clips.some((current) => current.id === clip.id)
            )
            .toBe(false);
        }
      }
      await expect.poll(async () => (await readNativeVideoProject(page))?.clips.length).toBe(0);
      await open();
      await expect(start).toHaveValue('0.123456');
      await volume.fill('25');
      await volume.press('Enter');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.sourceAudioDocuments?.[0]?.ranges[0]?.volume
        )
        .toBe(0.25);
      const showUse = page.locator('[data-ui="video-editor.materials.show-use"] button');
      await showUse.click();
      await page
        .getByRole('option', { name: label('videoEditor.sidebar.sourceAudio'), exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: label('videoEditor.sidebar.sourceAudio'), exact: true })
      ).toBeVisible();
      const output = await encodedNativeVideoSamples(page, host.origin, saved, format, []);
      const actual = await latestExportRms(page);
      const reference = structuredClone(saved);
      reference.sourceAudioDocuments = [];
      await encodedNativeVideoSamples(page, host.origin, reference, format, []);
      const baseline = await latestExportRms(page);
      expect(baseline).toBeGreaterThan(0.001);
      expect(Math.abs(actual / baseline - 0.5)).toBeLessThanOrEqual(0.03);
      await encodedNativeVideoSamples(page, host.origin, withMutes, format, []);
      const attenuated = await latestExportRms(page);
      expect(Math.abs(attenuated / baseline - 0.125)).toBeLessThanOrEqual(0.03);
      await writeFile(
        info.outputPath('source-audio-export.json'),
        JSON.stringify(
          {
            output,
            actual,
            baseline,
            ratio: actual / baseline,
            attenuated,
            attenuatedRatio: attenuated / baseline,
          },
          null,
          2
        )
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
