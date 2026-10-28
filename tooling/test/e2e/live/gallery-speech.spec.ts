import type { Locator, Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { persistedReviewContent } from '../support/voiceover-speech-fixture';
import { test, expect } from './live-fixture';
import { getLiveProfile } from './configuration';
import { setupLiveProvider, type LiveConnection } from './provider-ui';

const profile = getLiveProfile();
const sourceText = 'Проверка озвучки текста.';
const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');

test('Gallery speech preview Apply reload and retained playback after provider disable', async ({
  page,
  extensionId,
}) => {
  test.skip(!profile.models.speech, 'Selected profile does not declare speech');
  test.setTimeout(240_000);
  const connection = await setupLiveProvider(page, extensionId, profile, 'speech');
  const review = await prepareSpeechDocument(page, extensionId);
  const before = await contextualSelections(page);
  const voice = await openSpeechPanel(review);
  expect(await contextualSelections(page)).toEqual(before);
  await generateSpeechPreview(voice, connection);
  const accepted = await applySpeechPreview(page, voice);
  const remembered = await contextualSelections(page);
  expect(remembered).toEqual({ ...before, 'gallery-speech': connection.modelId });
  await page.reload();
  await expect(review).toBeVisible();
  expect((await persistedReviewContent(page))?.audio.voiceover[0]).toEqual(accepted);
  expect((await persistedReviewContent(page))?.text?.fragments[0]?.text).toBe(sourceText);
  await reopenSpeechPanel(review, connection);
  expect(await contextualSelections(page)).toEqual(remembered);
  await proveDisabledProviderRecovery(page, review, connection);
  expect((await persistedReviewContent(page))?.audio.voiceover[0]).toEqual(accepted);
});

async function prepareSpeechDocument(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
  await page.reload();
  await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
  await page.locator('[data-ui="gallery.videoReview.enter"]').click();
  const review = page.locator('dialog');
  await review
    .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
    .click();
  await review
    .getByRole('button', { name: label('gallery.videoReview.textTrackOpen'), exact: true })
    .click();
  const document = review.locator('[data-ui="gallery.videoReview.textDocument"]');
  await document
    .getByRole('button', { name: label('gallery.videoReview.textFragmentAdd'), exact: true })
    .click();
  await document
    .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
    .fill(sourceText);
  await expect
    .poll(async () => (await persistedReviewContent(page))?.text?.fragments[0]?.text)
    .toBe(sourceText);
  await document
    .getByRole('button', { name: label('gallery.videoReview.textViewCards'), exact: true })
    .click();
  return review;
}

async function contextualSelections(page: Page) {
  return page.evaluate(async () => {
    const data = await chrome.storage.local.get('sniptale_ai_scenario_selections');
    const value: unknown = data['sniptale_ai_scenario_selections'];
    if (value === undefined) return {};
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Live contextual selection storage is invalid');
    const result: Record<string, string> = {};
    const entries: Array<[string, unknown]> = Object.entries(value);
    for (const [key, row] of entries) {
      if (row === null || typeof row !== 'object' || !('modelId' in row))
        throw new Error('Live contextual selection entry is invalid');
      if (typeof row.modelId !== 'string')
        throw new Error('Live contextual model identity is invalid');
      result[key] = row.modelId;
    }
    return result;
  });
}

async function openSpeechPanel(review: Locator) {
  await review
    .locator('[data-ui="gallery.videoReview.textDocument"]')
    .getByRole('button', { name: label('gallery.videoReview.speechGenerate'), exact: true })
    .click();
  const voice = review.locator('[data-ui="gallery.videoReview.textVoice"]');
  await expect(voice.locator('.sniptale-ai-model-selector-trigger')).toBeEnabled();
  return voice;
}

async function generateSpeechPreview(voice: Locator, connection: LiveConnection) {
  const speech = profile.models.speech?.audio?.speech;
  if (!speech) throw new Error('Selected profile does not declare speech');
  const selector = voice.locator('.sniptale-ai-model-selector-trigger');
  await selector.click();
  const menu = voice.locator('.sniptale-dropdown-menu');
  await menu.getByRole('textbox').fill(connection.displayName);
  await menu.getByRole('button', { name: connection.displayName, exact: true }).click();
  await expect(selector).toContainText(connection.displayName);
  await voice
    .getByRole('textbox', { name: label('gallery.videoReview.speechVoice'), exact: true })
    .fill(speech.voiceId);
  await voice
    .getByRole('group', { name: label('gallery.videoReview.speechFormat'), exact: true })
    .getByRole('button', { name: speech.responseFormat.toUpperCase(), exact: true })
    .click();
  await voice
    .getByRole('button', { name: label('gallery.videoReview.speechGenerate'), exact: true })
    .click();
  await voice
    .getByRole('button', { name: label('gallery.videoReview.speechConsentContinue'), exact: true })
    .click();
  const preview = voice.locator('audio');
  await expect(preview).toHaveCount(1, { timeout: 130_000 });
  await expect
    .poll(() => preview.evaluate((audio: HTMLAudioElement) => audio.duration))
    .toBeGreaterThan(0);
  await preview.evaluate((audio: HTMLAudioElement) => audio.play());
  await expect
    .poll(() => preview.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0);
  await preview.evaluate((audio: HTMLAudioElement) => audio.pause());
}

async function applySpeechPreview(page: Page, voice: Locator) {
  expect((await persistedReviewContent(page))?.audio.voiceover).toHaveLength(0);
  await voice
    .getByRole('button', { name: label('gallery.videoReview.speechApply'), exact: true })
    .click();
  await expect
    .poll(async () => (await persistedReviewContent(page))?.audio.voiceover.length)
    .toBe(1);
  const accepted = (await persistedReviewContent(page))?.audio.voiceover[0];
  if (!accepted) throw new Error('Live speech Apply did not retain an accepted audio clip');
  return accepted;
}

async function reopenSpeechPanel(review: Locator, connection: LiveConnection) {
  await review
    .getByRole('button', { name: label('gallery.videoReview.textTrackOpen'), exact: true })
    .click();
  const document = review.locator('[data-ui="gallery.videoReview.textDocument"]');
  await document
    .getByRole('button', { name: label('gallery.videoReview.textViewCards'), exact: true })
    .click();
  await document.locator('[data-text-id] button[aria-expanded="false"]').first().click();
  const voice = await openSpeechPanel(review);
  await expect(voice.locator('.sniptale-ai-model-selector-trigger')).toContainText(
    connection.displayName
  );
}

async function proveDisabledProviderRecovery(
  page: Page,
  review: Locator,
  connection: LiveConnection
) {
  const voice = review.locator('[data-ui="gallery.videoReview.textVoice"]');
  const draft = voice.getByRole('textbox', {
    name: label('gallery.videoReview.speechVoice'),
    exact: true,
  });
  await draft.fill('retained after disable');
  const settings = await page.context().newPage();
  try {
    await settings.goto(connection.settingsUrl);
    const provider = settings.locator(`[data-settings-collection-item="${connection.providerId}"]`);
    await expect(provider).toContainText(label('settings.aiProviders.providerStatusOperation'));
    const toggle = provider.getByRole('switch');
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page.bringToFront();
    await voice.locator('.sniptale-ai-model-selector-trigger').click();
    await expect(
      voice.getByText(label('aiModal.modelSelectionUnavailable'), { exact: false })
    ).toBeVisible();
    await expect(
      voice.getByRole('button', { name: label('gallery.videoReview.speechGenerate'), exact: true })
    ).toBeDisabled();
    await expect(draft).toHaveValue('retained after disable');
    await voice
      .getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
      .click();
    await review
      .getByRole('button', { name: label('gallery.videoReview.play'), exact: true })
      .first()
      .click();
    const video = review.locator('video').first();
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
      .toBeGreaterThan(0.2);
  } finally {
    await settings.close();
  }
}
