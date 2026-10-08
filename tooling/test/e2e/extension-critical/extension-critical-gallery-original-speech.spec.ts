import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { installSpeechPortFixture, speechModelResponse } from '../support/voiceover-speech-fixture';

async function persisted(page: Page) {
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
  if (!workspace) return null;
  return replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewAdvancedContentBaseline(workspace.advanced)
  ).advancedContent.audio;
}

for (const variant of [
  { locale: 'en' as const, theme: 'light', width: 1280, height: 560 },
  { locale: 'ru' as const, theme: 'dark', width: 1920, height: 900 },
  { locale: 'en' as const, theme: 'light', width: 1200, height: 560 },
]) {
  test(`original speech remains independent from voiceover (${variant.width}/${variant.locale})`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width: variant.width, height: variant.height });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
        runtimeResponses: { AI_SETTINGS_QUERY: speechModelResponse },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await installSpeechPortFixture(page);
      const open = async () => {
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      };
      await open();
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', {
          name: translate('gallery.videoReview.advancedEditing', variant.locale),
          exact: true,
        })
        .click();
      const openSpeech = async () => {
        const original = dialog
          .locator('[data-ui="gallery.videoReview.trackHeader"]')
          .filter({ hasText: translate('gallery.videoReview.audioOriginal', variant.locale) });
        await original
          .getByRole('button', {
            name: translate('gallery.videoReview.speechTitle', variant.locale),
            exact: true,
          })
          .click();
      };
      await openSpeech();
      const panel = dialog.locator('[data-ui="gallery.videoReview.speechPanel"]');
      await expect(panel).toBeVisible();
      if (variant.width < 1280) {
        const scroll = dialog.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        await expect
          .poll(() => scroll.evaluate((node) => node.scrollWidth - node.clientWidth))
          .toBeGreaterThan(0);
        await scroll.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
      }
      const button = (key: Parameters<typeof translate>[0]) =>
        panel.getByRole('button', { name: translate(key, variant.locale), exact: true });
      await button('gallery.videoReview.speechRecognizeAll').click();
      const phrases = panel.locator('[data-ui="gallery.videoReview.speechPhrase"]');
      await expect(phrases).toHaveCount(3);
      expect((await persisted(page))?.voiceover).toHaveLength(0);
      const phrase = phrases.nth(1);
      const text = phrase.getByRole('textbox', {
        name: translate('gallery.videoReview.speechText', variant.locale),
        exact: true,
      });
      await text.fill('Edited original phrase.');
      await text.press('Tab');
      await expect
        .poll(async () => (await persisted(page))?.originalSpeech?.transcript.phrases[1]?.text)
        .toBe('Edited original phrase.');
      await phrase
        .getByRole('button', {
          name: translate('gallery.videoReview.speechGenerate', variant.locale),
          exact: true,
        })
        .click();
      const audio = phrase.locator('[data-ui="gallery.videoReview.speechPreview"] audio');
      await expect(audio).toBeVisible();
      await audio.evaluate((node: HTMLAudioElement) => node.play());
      await expect
        .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
        .toBeGreaterThan(0);
      await audio.evaluate((node: HTMLAudioElement) => node.pause());
      const apply = phrase.getByRole('button', {
        name: translate('gallery.videoReview.speechApply', variant.locale),
        exact: true,
      });
      await apply.scrollIntoViewIfNeeded();
      await expect(apply).toBeInViewport();
      await page.screenshot({
        path: info.outputPath('original-speech-preview.png'),
        fullPage: false,
      });
      expect((await persisted(page))?.originalSpeech?.transcript.replacements).toHaveLength(0);
      await apply.click();
      await expect
        .poll(async () => (await persisted(page))?.originalSpeech?.transcript.replacements.length)
        .toBe(1);
      const saved = (await persisted(page))!;
      expect(saved.voiceover).toHaveLength(0);
      const replacement = saved.originalSpeech!.transcript.replacements[0]!;
      expect(replacement.originalVolume).toBe(0);
      const revoice = dialog.locator('[data-ui="gallery.videoReview.revoiceTrack"]');
      await expect(revoice.locator('button')).toHaveCount(1);
      await revoice.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('original-speech-revoice.png'),
        fullPage: false,
      });
      await revoice.locator('button').click();
      const accepted = panel.locator(`[data-speech-replacement-id="${replacement.id}"]`);
      await accepted.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('original-speech-accepted.png'),
        fullPage: false,
      });
      await accepted
        .getByRole('button', {
          name: translate('gallery.videoReview.speechToggleReplacement', variant.locale),
          exact: true,
        })
        .click();
      await expect
        .poll(
          async () => (await persisted(page))?.originalSpeech?.transcript.replacements[0]?.enabled
        )
        .toBe(false);
      await page.reload();
      await installSpeechPortFixture(page);
      await open();
      await openSpeech();
      await expect(panel.locator(`[data-speech-replacement-id="${replacement.id}"]`)).toBeVisible();
      await panel
        .locator(`[data-speech-replacement-id="${replacement.id}"]`)
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('original-speech-reopened.png'),
        fullPage: false,
      });
      await panel
        .getByRole('button', {
          name: translate('gallery.videoReview.speechRestorePhrase', variant.locale),
          exact: true,
        })
        .click();
      await expect
        .poll(async () => (await persisted(page))?.originalSpeech?.transcript.replacements.length)
        .toBe(0);
      expect((await persisted(page))?.voiceover).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
