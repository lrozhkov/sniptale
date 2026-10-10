import { expect, test, type Locator, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import {
  installSpeechPortFixture,
  persistedReviewContent,
  persistedSpeech,
  speechModelResponse,
  syntheticSpeechWav,
} from '../support/voiceover-speech-fixture';
const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');

async function uploadAudio(page: Page, dialog: Locator, lane: 'voiceover' | 'music', name: string) {
  const header = dialog.locator('[data-ui="gallery.videoReview.trackHeader"]').filter({
    hasText: label(
      lane === 'voiceover' ? 'gallery.videoReview.audioVoiceover' : 'gallery.videoReview.audioMusic'
    ),
  });
  await header
    .getByRole('button', {
      name: label(
        lane === 'voiceover'
          ? 'gallery.videoReview.audioImport'
          : 'gallery.videoReview.musicLibrary'
      ),
      exact: true,
    })
    .click();
  const drawer = page.locator('[data-ui="music.library.drawer"]');
  await expect(drawer).toBeVisible();
  await drawer.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'audio/wav',
    buffer: syntheticSpeechWav(lane === 'voiceover' ? 3 : 6),
  });
  await expect(drawer).toHaveCount(0);
}
test('ordinary voiceover recognition links canonical text and excludes Music', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1280, height: 560 });
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
      runtimeResponses: { AI_SETTINGS_QUERY: speechModelResponse },
    });
    await page.goto(host.origin + GALLERY_HARNESS_PATH + '?theme=light');
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
      .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
      .click();
    const panel = dialog.locator('[data-ui="gallery.videoReview.speechPanel"]');
    let total = 0;
    for (const name of ['first-voice.wav', 'second-voice.wav']) {
      await uploadAudio(page, dialog, 'voiceover', name);
      await dialog.locator('[data-audio-lane="voiceover"] [data-audio-id]').last().click();
      await expect(panel.locator('[data-ui="gallery.videoReview.audioInspector"]')).toBeVisible();
      const before = (await persistedReviewContent(page))?.audio;
      await panel
        .getByRole('button', { name: label('gallery.videoReview.recognitionStart'), exact: true })
        .click();
      await panel
        .getByRole('button', {
          name: label('gallery.videoReview.speechConsentContinue'),
          exact: true,
        })
        .click();
      const phrases = panel
        .locator('[data-ui="gallery.videoReview.recognitionResult"]')
        .locator('[data-ui="gallery.videoReview.textPhrase"]');
      await expect(phrases).toHaveCount(3);
      expect((await persistedReviewContent(page))?.text?.fragments.length ?? 0).toBe(total);
      const apply = panel.getByRole('button', {
        name: label('gallery.videoReview.recognitionApply'),
        exact: true,
      });
      await apply.scrollIntoViewIfNeeded();
      await expect(apply).toBeInViewport();
      await apply.click();
      total += 3;
      await expect
        .poll(async () => (await persistedReviewContent(page))?.text?.fragments.length)
        .toBe(total);
      expect((await persistedReviewContent(page))?.audio).toEqual(before);
      const related = panel.getByRole('button', { name: 'First phrase.', exact: true });
      await expect(related).toBeVisible();
      await related.click();
      await expect(panel).toHaveCount(0);
      await expect(dialog.locator('[data-ui="gallery.videoReview.textDocument"]')).toHaveCount(0);
      await expect(
        dialog.getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
      ).toHaveValue('First phrase.');
    }
    const accepted = await persistedReviewContent(page);
    expect(
      accepted?.text?.fragments.every(
        (fragment) => fragment.timeDomain === 'result' && fragment.origin?.kind === 'voiceover'
      )
    ).toBe(true);
    expect((await persistedSpeech(page))?.clips).toHaveLength(2);
    await uploadAudio(page, dialog, 'music', 'music-only.wav');
    await dialog.locator('[data-audio-lane="music"] [data-audio-id]').last().click();
    await expect(panel).toHaveCount(0);
    await expect(
      dialog.getByRole('button', {
        name: label('gallery.videoReview.recognitionStart'),
        exact: true,
      })
    ).toHaveCount(0);
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.textTrackOpen'), exact: true })
      .click();
    const document = dialog.locator('[data-ui="gallery.videoReview.textDocument"]');
    await expect(document.locator('[data-ui="gallery.videoReview.textPhrase"]')).toHaveCount(6);
    await page.screenshot({
      path: info.outputPath('voiceover-recognized-track-text.png'),
      fullPage: false,
    });
    await page.reload();
    await open();
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.textTrackOpen'), exact: true })
      .click();
    await expect(document.locator('[data-ui="gallery.videoReview.textPhrase"]')).toHaveCount(6);
    expect((await persistedReviewContent(page))?.audio.music).toHaveLength(1);
    expect((await persistedSpeech(page))?.clips).toHaveLength(2);
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
