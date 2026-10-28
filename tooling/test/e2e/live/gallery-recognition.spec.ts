import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './live-fixture';
import { getLiveProfile } from './configuration';
import { setupLiveProvider, type LiveConnection } from './provider-ui';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { persistedReviewContent } from '../support/voiceover-speech-fixture';
import { chooseInspectorValue } from '../support/inspector-utilities';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { parseAIScenarioSelections } from '../../../../apps/extension/src/contracts/settings/ai-catalog';

const profile = getLiveProfile();
const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
test.skip(!profile.models.transcription, 'Selected profile does not declare transcription');

async function selections(page: Page) {
  const value: unknown = await page.evaluate(async () => {
    const data: unknown = await chrome.storage.local.get('sniptale_ai_scenario_selections');
    return typeof data === 'object' && data !== null && 'sniptale_ai_scenario_selections' in data
      ? data.sniptale_ai_scenario_selections
      : undefined;
  });
  return parseAIScenarioSelections(value);
}

async function recognizeSource(
  page: Page,
  panel: Locator,
  connection: LiveConnection,
  consentRequired: boolean
) {
  const before = await persistedReviewContent(page);
  const start = panel.getByRole('button', {
    name: label('gallery.videoReview.recognitionStart'),
    exact: true,
  });
  await start.scrollIntoViewIfNeeded();
  await start.click();
  const proceed = panel.getByRole('button', {
    name: label('gallery.videoReview.speechConsentContinue'),
    exact: true,
  });
  if (consentRequired) {
    await expect(proceed).toBeVisible();
    await expect(panel).toContainText(connection.providerName);
  }
  if (await proceed.count()) {
    await proceed.scrollIntoViewIfNeeded();
    await proceed.click();
  }
  const result = panel.locator('[data-ui="gallery.videoReview.recognitionResult"]');
  await expect
    .poll(async () => (await result.count()) > 0 || (await panel.getByRole('alert').count()) > 0, {
      timeout: 130000,
    })
    .toBe(true);
  expect(await persistedReviewContent(page)).toEqual(before);
  if (!(await result.count())) {
    await expect(panel.getByRole('alert')).toBeVisible();
    throw new Error(
      'Selected profile Gallery recognition failed; saved source and content were preserved.'
    );
  }
  const phrase = result.locator('[data-ui="gallery.videoReview.textPhrase"]').first();
  await expect(phrase).toBeVisible();
  const expand = phrase.locator('button[aria-expanded="false"]').first();
  if (await expand.count()) await expand.click();
  const recognized = await phrase
    .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
    .inputValue();
  expect(recognized.trim().length).toBeGreaterThan(5);
  const apply = panel.getByRole('button', {
    name: label('gallery.videoReview.recognitionApply'),
    exact: true,
  });
  await apply.scrollIntoViewIfNeeded();
  await apply.click();
  await expect
    .poll(async () => (await persistedReviewContent(page))?.text?.fragments.length ?? 0)
    .toBeGreaterThan(before?.text?.fragments.length ?? 0);
  expect(
    (await persistedReviewContent(page))?.text?.fragments.some(
      (fragment) => fragment.text === recognized
    )
  ).toBe(true);
  expect((await persistedReviewContent(page))?.audio).toEqual(before?.audio);
}

test('Gallery recognizes original and imported voiceover, remembers selection and preserves disabled-provider work', async ({
  page,
  extensionId,
}) => {
  test.setTimeout(360000);
  const connection = await setupLiveProvider(page, extensionId, profile, 'transcription');
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await seedReviewVideo(
    page,
    'speaking-source.webm',
    { width: 160, height: 90, duration: 12 },
    false,
    false,
    {
      bytes: new Uint8Array(
        await readFile(new URL('./fixtures/speaking-source.webm', import.meta.url))
      ),
      mimeType: 'video/webm',
    }
  );
  await page.reload();
  await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
  await page.locator('[data-ui="gallery.videoReview.enter"]').click();
  const review = page.locator('dialog');
  const header = review
    .locator('[data-ui="gallery.videoReview.trackHeader"]')
    .filter({ hasText: label('gallery.videoReview.audioOriginal') });
  const beforeChoices = await selections(page);
  await header
    .getByRole('button', { name: label('gallery.videoReview.speechTitle'), exact: true })
    .click();
  const panel = review.locator('[data-ui="gallery.videoReview.speechPanel"]');
  const selector = panel.locator('.sniptale-ai-model-selector-trigger');
  await expect(selector).toBeEnabled();
  expect(await selections(page)).toEqual(beforeChoices);
  await selector.click();
  const menu = review.locator('.sniptale-dropdown-menu');
  await menu.getByRole('textbox').fill(connection.displayName);
  await menu.getByRole('button', { name: connection.displayName, exact: true }).click();
  await test.step('Consent, recognize and Apply the original source', async () => {
    await recognizeSource(page, panel, connection, true);
  });
  const originalText = (await persistedReviewContent(page))?.text;
  expect(originalText?.fragments.some((fragment) => fragment.origin?.kind === 'original')).toBe(
    true
  );
  const remembered = await selections(page);
  expect(remembered).not.toEqual(beforeChoices);
  await page.reload();
  await expect(review).toBeVisible();
  expect((await persistedReviewContent(page))?.text).toEqual(originalText);
  if (!(await panel.count()))
    await header
      .getByRole('button', { name: label('gallery.videoReview.speechTitle'), exact: true })
      .click();
  await expect(selector).toContainText(connection.displayName);
  expect(await selections(page)).toEqual(remembered);
  await test.step('Import a voiceover and Apply recognition with the remembered model', async () => {
    await review
      .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
      .first()
      .click();
    const voiceHeader = review
      .locator('[data-ui="gallery.videoReview.trackHeader"]')
      .filter({ hasText: label('gallery.videoReview.audioVoiceover') });
    await voiceHeader
      .getByRole('button', { name: label('gallery.videoReview.audioImport'), exact: true })
      .click();
    const drawer = page.locator('[data-ui="music.library.drawer"]');
    await drawer
      .locator('input[type="file"]')
      .setInputFiles(fileURLToPath(new URL('./fixtures/speaking-upload.wav', import.meta.url)));
    await expect(drawer).toHaveCount(0);
    await review.locator('[data-audio-lane="voiceover"] [data-audio-id]').last().click();
    await expect(selector).toContainText(connection.displayName);
    expect(await selections(page)).toEqual(remembered);
    await recognizeSource(page, panel, connection, false);
  });
  const accepted = await persistedReviewContent(page);
  expect(accepted?.text?.fragments.some((fragment) => fragment.origin?.kind === 'original')).toBe(
    true
  );
  expect(accepted?.text?.fragments.some((fragment) => fragment.origin?.kind === 'voiceover')).toBe(
    true
  );
  await chooseInspectorValue(
    page,
    panel,
    label('gallery.videoReview.recognitionGrouping'),
    label('gallery.videoReview.recognitionSentences')
  );
  const settings = await page.context().newPage();
  await settings.goto(connection.settingsUrl);
  const toggle = settings
    .locator(`[data-settings-collection-item="${connection.providerId}"]`)
    .getByRole('switch');
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.bringToFront();
  await selector.click();
  await expect(
    panel.getByText(label('aiModal.modelSelectionUnavailable'), { exact: false })
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: label('gallery.videoReview.recognitionStart'), exact: true })
  ).toBeDisabled();
  await expect(
    panel.getByRole('button', {
      name: label('gallery.videoReview.recognitionGrouping'),
      exact: true,
    })
  ).toContainText(label('gallery.videoReview.recognitionSentences'));
  expect(await persistedReviewContent(page)).toEqual(accepted);
  await page.keyboard.press('Escape');
  await review
    .getByRole('button', { name: label('gallery.videoReview.play'), exact: true })
    .first()
    .click();
  await expect
    .poll(() =>
      review
        .locator('video')
        .first()
        .evaluate((video) => (video instanceof HTMLVideoElement ? video.currentTime : 0))
    )
    .toBeGreaterThan(0.2);
  await page.reload();
  await expect(review).toBeVisible();
  expect(await persistedReviewContent(page)).toEqual(accepted);
  await settings.close();
});
