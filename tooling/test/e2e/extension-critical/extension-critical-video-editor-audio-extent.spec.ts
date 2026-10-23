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
        start = Math.round(1.6 * pcm.sampleRate),
        end = Math.round(1.9 * pcm.sampleRate);
      let squares = 0;
      for (let index = start; index < end; index++) squares += channel[index]! ** 2;
      return Math.sqrt(squares / (end - start));
    } finally {
      await context.close();
    }
  }, exportId);
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  const format = index === 0 ? 'WEBM' : 'MP4';
  test(`retained audio duration and encoded fade ${viewport.name} ${locale}`, async ({
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
        filename: 'Retained audio.webm',
        width: 640,
        height: 360,
        duration: 12,
        mimeType: 'video/webm',
        size: bytes.length,
        hasAudio: true,
      });
      const audio = project.clips.find((clip) => clip.type === 'AUDIO');
      const video = project.clips.find((clip) => clip.type === 'VIDEO');
      if (!audio || audio.type !== 'AUDIO' || !video || video.type !== 'VIDEO')
        throw new Error('Missing media pair');
      for (const clip of [audio, video]) {
        clip.groupId = null;
        clip.linkMode = 'DETACHED';
      }
      video.duration = video.sourceDuration = 2;
      audio.duration = audio.sourceDuration = 4;
      audio.fadeOutMs = 1500;
      project.duration = 4;
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript((language) => {
        if (window !== window.top) return;
        localStorage.setItem('sniptale-locale-preference', language);
        if (sessionStorage.getItem('audio-extent-seeded')) {
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
      await page.evaluate(() => sessionStorage.setItem('audio-extent-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      const selectAudio = async () => {
        const clip = page.locator(`[data-project-timeline-clip="${audio.id}"]`);
        await clip.scrollIntoViewIfNeeded();
        await clip.click();
      };
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await selectAudio();
      const mode = page.getByRole('group', {
        name: label('videoEditor.sidebar.contentDuration'),
        exact: true,
      });
      const follow = mode.getByRole('button', {
        name: label('videoEditor.sidebar.contentDurationProject'),
        exact: true,
      });
      const include = mode.getByRole('button', {
        name: label('videoEditor.sidebar.audioDurationContent'),
        exact: true,
      });
      await expect(include).toHaveAttribute('aria-pressed', 'true');
      await follow.focus();
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await readNativeVideoProject(page))?.duration).toBe(2);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await readNativeVideoProject(page))?.duration).toBe(4);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(async () => (await readNativeVideoProject(page))?.duration).toBe(2);
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await selectAudio();
      await expect(follow).toHaveAttribute('aria-pressed', 'true');
      const saved = (await readNativeVideoProject(page))!;
      expect(saved.version).toBe(30);
      expect(saved.clips.find((clip) => clip.id === audio.id)).toMatchObject({
        duration: 4,
        sourceDuration: 4,
        fadeOutMs: 1500,
        durationMode: 'project',
      });
      await checkInspectorPaintedFont(page, follow, 'audio-duration-font');
      await page.screenshot({
        path: info.outputPath('audio-duration-project.png'),
        fullPage: false,
      });
      await include.click();
      await expect.poll(async () => (await readNativeVideoProject(page))?.duration).toBe(4);
      const reference = (await readNativeVideoProject(page))!;
      await page.screenshot({
        path: info.outputPath('audio-duration-content.png'),
        fullPage: false,
      });
      await page.setViewportSize({ width: 1200, height: viewport.size.height });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
      ).toBe(true);
      await page.setViewportSize({ ...viewport.size });
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      if (index === 1) {
        const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
        for (const width of [359, 360, 361]) {
          const current = (await inspector.boundingBox())!.width;
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + 12);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
          await page.mouse.up();
          await expect
            .poll(async () => Math.round((await inspector.boundingBox())!.width))
            .toBe(width);
          await expect(include).toBeVisible();
          expect(await mode.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
            true
          );
        }
      }
      const dormant = structuredClone(saved);
      dormant.clips.push({
        ...audio,
        id: 'wholly-retained-tail',
        sourceInstanceId: 'wholly-retained-tail',
        startTime: 6,
        durationMode: 'project',
      });
      const output = await encodedNativeVideoSamples(page, host.origin, dormant, format, []);
      const actual = await latestExportRms(page);
      const full = await encodedNativeVideoSamples(page, host.origin, reference, format, []);
      const baseline = await latestExportRms(page);
      expect(Math.abs(output.duration - 2)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(full.duration - 4)).toBeLessThanOrEqual(0.05);
      expect(baseline).toBeGreaterThan(0.001);
      expect(Math.abs(actual / baseline - 1)).toBeLessThanOrEqual(0.03);
      await writeFile(
        info.outputPath('audio-duration-export.json'),
        JSON.stringify({ output, full, actual, baseline, ratio: actual / baseline }, null, 2)
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
