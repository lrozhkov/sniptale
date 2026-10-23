import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
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
} from '../extension-critical.helpers';

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'ru' : 'en';
  const theme = index === 0 ? 'light' : 'dark';
  const format = index === 0 ? 'MP4' : 'WEBM';
  test(`Native 1/16 remains exact in inspector and encoded output ${viewport.name} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const project = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'Slow source.webm',
        width: 640,
        height: 360,
        duration: 12,
        mimeType: 'video/webm',
        size: bytes.length,
        hasAudio: true,
      });
      project.duration = 0.125;
      project.clips.forEach((clip) => {
        clip.duration = 0.125;
        if (clip.type === 'VIDEO' || clip.type === 'AUDIO') clip.sourceDuration = 0.125;
      });
      const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript((language) => {
        if (window !== window.top) return;
        localStorage.setItem('sniptale-locale-preference', language);
        if (sessionStorage.getItem('slow-rate-seeded')) {
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
      await page.evaluate(() => sessionStorage.setItem('slow-rate-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const materialsClose = page.locator('[data-ui="video-editor.materials.close"]');
      if (await materialsClose.isVisible()) await materialsClose.click();
      const selectTiming = async () => {
        await page.locator(`[data-project-timeline-clip="${video.id}"]`).click();
        await page
          .getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupTiming'),
            exact: true,
          })
          .click();
      };
      await selectTiming();
      const field = page.getByRole('textbox', {
        name: label('videoEditor.sidebar.playbackRateLabel'),
        exact: true,
      });
      await field.fill('0.0625');
      await field.press('Enter');
      await expect.poll(async () => (await readNativeVideoProject(page))?.duration).toBe(2);
      const accepted = (await readNativeVideoProject(page))!;
      expect(accepted.version).toBe(27);
      expect(
        accepted.clips.every(
          (clip) => (clip.type === 'VIDEO' || clip.type === 'AUDIO') && clip.playbackRate === 0.0625
        )
      ).toBe(true);
      await expect(field).toHaveValue('0.0625');
      await field.focus();
      await field.blur();
      await expect(field).toHaveValue('0.0625');
      expect((await readNativeVideoProject(page))!.clips).toEqual(accepted.clips);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await readNativeVideoProject(page))?.duration).toBe(0.125);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(async () => (await readNativeVideoProject(page))?.duration).toBe(2);
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await selectTiming();
      await expect(field).toHaveValue('0.0625');
      await page.evaluate(() => document.fonts.ready);
      const row = field.locator(
        'xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.numeric-row"]'
      );
      await checkInspectorPaintedFont(page, row.locator('span').first(), 'slow-rate-font');
      expect(await field.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await field.blur();
      await page.screenshot({ path: info.outputPath('slow-rate-inspector.png'), fullPage: false });
      const saved = (await readNativeVideoProject(page))!;
      expect(saved.clips).toEqual(accepted.clips);
      await page.setViewportSize({ width: 1200, height: viewport.size.height });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
      ).toBe(true);
      await page.setViewportSize({ ...viewport.size });
      const encoded = await encodedNativeVideoSamples(page, host.origin, saved, format, []);
      const reference = structuredClone(saved);
      reference.clips = reference.clips.map((clip) =>
        clip.type === 'VIDEO' || clip.type === 'AUDIO'
          ? { ...clip, playbackRate: 1, sourceDuration: 2, duration: 2 }
          : clip
      );
      const control = await encodedNativeVideoSamples(page, host.origin, reference, format, []);
      await writeFile(
        info.outputPath('slow-rate-export.json'),
        JSON.stringify({ encoded, control }, null, 2)
      );
      expect(encoded.duration).toBe(control.duration);
      expect(Math.abs(encoded.duration - 2)).toBeLessThanOrEqual(1 / 40);
      expect(encoded.size).toBeGreaterThan(100);
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
