import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'en' as const, theme: 'dark', width: 1280, height: 560 },
  { locale: 'ru' as const, theme: 'light', width: 1920, height: 900 },
  { locale: 'en' as const, theme: 'light', width: 1200, height: 560 },
]) {
  test(`montage subtitle download ${variant.locale} ${variant.width}`, async ({ page }, info) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const project = createEmptyVideoProject('Subtitle export');
    project.version = 5;
    project.duration = 12;
    project.textDocuments = [
      {
        id: 'text',
        binding: { kind: 'project' },
        document: {
          version: 1,
          fragments: [
            {
              id: 'phrase',
              start: 2,
              end: 4,
              text: 'Привет / Hello',
              originalText: '',
              timeDomain: 'result',
              alignment: 'manual',
              revision: 0,
              timingRevision: 0,
              showInVideo: false,
              language: 'ru',
            },
          ],
        },
      },
    ];
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await page.emulateMedia({ colorScheme: variant.theme === 'dark' ? 'dark' : 'light' });
    try {
      await applyHarnessBootstrap(page, {
        videoProjects: [project],
        apiBehavior: { runtimeFallback: 'typed-success' },
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.addInitScript(
        (locale) => localStorage.setItem('sniptale-locale-preference', locale),
        variant.locale
      );
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${variant.theme}`
      );
      await page.locator('[data-ui="video-editor.timeline.toolbar.project-menu"]').click();
      await page
        .getByRole('button', { name: label('videoEditor.app.exportButton'), exact: true })
        .click();
      const panel = page.locator('[data-ui="video-editor.export.subtitles"]');
      await panel.locator('summary').click();
      const download = panel.getByRole('button', {
        name: label('gallery.videoReview.subtitlesDownload'),
        exact: true,
      });
      await download.scrollIntoViewIfNeeded();
      await expect(download).toBeEnabled();
      await expect(download).toBeInViewport();
      const event = page.waitForEvent('download');
      await download.click();
      const artifact = await event;
      expect(artifact.suggestedFilename()).toBe('subtitles.srt');
      const path = await artifact.path();
      if (!path) throw new Error('Subtitle file unavailable');
      expect(await readFile(path, 'utf8')).toContain(
        '00:00:02,000 --> 00:00:04,000\nПривет / Hello'
      );
      await expect(panel.getByRole('status')).toHaveText(
        label('gallery.videoReview.subtitlesDownloadStarted')
      );
      const shown = panel.getByRole('switch', {
        name: label('gallery.videoReview.subtitlesOnlyShown'),
        exact: true,
      });
      await shown.click();
      await expect(download).toBeDisabled();
      await shown.click();
      await download.scrollIntoViewIfNeeded();
      await expect(download).toBeEnabled();
      await page.screenshot({ path: info.outputPath('subtitle-export.png'), fullPage: false });
      const submit = page.getByRole('button', {
        name: label('videoEditor.exportDialog.submit'),
        exact: true,
      });
      await expect(submit).toBeInViewport();
      const dialog = page.getByRole('dialog');
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      );
      await page
        .getByRole('button', { name: label('videoEditor.exportDialog.cancel'), exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
