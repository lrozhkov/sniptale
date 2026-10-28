import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './live-fixture';
import { getLiveProfile } from './configuration';
import { setupLiveProvider, type LiveConnection } from './provider-ui';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject as readProject } from '../support/native-video-project';
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

async function recognizeAudibleClip(
  page: Page,
  panel: Locator,
  connection: LiveConnection,
  clipName: string,
  projectId: string
) {
  const before = await readProject(page, projectId);
  if (!before) throw new Error('Saved Montage project unavailable before recognition');
  const start = panel.getByRole('button', {
    name: label('gallery.videoReview.recognitionStart'),
    exact: true,
  });
  await start.scrollIntoViewIfNeeded();
  await start.click();
  const consent = panel.locator('[data-ui="video-editor.recognition.consent"]');
  await expect(consent).toContainText(connection.providerName);
  await expect(consent).toContainText(connection.displayName);
  await expect(consent).toContainText(clipName);
  const proceed = consent.getByRole('button', {
    name: label('gallery.videoReview.speechConsentContinue'),
    exact: true,
  });
  await proceed.scrollIntoViewIfNeeded();
  await proceed.click();
  const proposal = panel.locator('[data-ui="video-editor.recognition.proposal"]');
  const recognized = proposal.getByRole('textbox').first();
  await expect
    .poll(
      async () => (await recognized.count()) > 0 || (await panel.getByRole('alert').count()) > 0,
      { timeout: 130000 }
    )
    .toBe(true);
  expect((await readProject(page, projectId))?.textDocuments ?? []).toEqual(
    before.textDocuments ?? []
  );
  expect((await readProject(page, projectId))?.assets).toEqual(before.assets);
  if (!(await recognized.count())) {
    await expect(panel.getByRole('alert')).toBeVisible();
    throw new Error(
      'Selected profile Montage recognition failed; saved source and text were preserved.'
    );
  }
  await expect(recognized).toBeVisible();
  const text = await recognized.inputValue();
  expect(text.trim().length).toBeGreaterThan(5);
  const apply = proposal.getByRole('button', {
    name: label('gallery.videoReview.recognitionApply'),
    exact: true,
  });
  await apply.scrollIntoViewIfNeeded();
  await apply.click();
  await expect
    .poll(
      async () =>
        (await readProject(page, projectId))?.textDocuments?.[0]?.document.fragments[0]?.text
    )
    .toBe(text);
  return text;
}

test('Montage recognizes an audible source, remembers selection and preserves disabled-provider work', async ({
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
  const editorUrl = `chrome-extension://${extensionId}/apps/extension/src/video-editor/index.html`;
  await page.goto(`${editorUrl}?id=beta-v1-recording`);
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  await expect.poll(async () => (await readProject(page))?.clips.length ?? 0).toBeGreaterThan(0);
  const before = await readProject(page);
  if (!before) throw new Error('Saved Montage project unavailable');
  const projectUrl = `${editorUrl}?project=${encodeURIComponent(before.id)}`;
  const clip = before.clips.find(
    (entry) =>
      (entry.type === 'VIDEO' || entry.type === 'AUDIO') &&
      before.assets.find((asset) => asset.id === entry.assetId)?.metadata.hasAudio
  );
  if (!clip || (clip.type !== 'VIDEO' && clip.type !== 'AUDIO'))
    throw new Error('Audible source clip unavailable');
  const beforeChoices = await selections(page);
  await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
  await page
    .getByRole('button', { name: label('gallery.videoReview.recognitionTitle'), exact: true })
    .click();
  const panel = page.locator('[data-ui="video-editor.recognition.panel"]');
  const selector = panel.locator('.sniptale-ai-model-selector-trigger');
  await expect(selector).toBeEnabled();
  expect(await selections(page)).toEqual(beforeChoices);
  await selector.click();
  const menu = panel.locator('.sniptale-dropdown-menu');
  await menu.getByRole('textbox').fill(connection.displayName);
  await menu.getByRole('button', { name: connection.displayName, exact: true }).click();
  const recognized =
    await test.step('Consent, recognize and Apply the bound audible source', async () => {
      return recognizeAudibleClip(page, panel, connection, clip.name, before.id);
    });
  const accepted = await readProject(page, before.id);
  expect(accepted?.clips).toEqual(
    before.clips.map((entry) => ({ ...entry, timelineLaneId: entry.timelineLaneId ?? null }))
  );
  expect(accepted?.assets).toEqual(before.assets);
  expect(accepted?.textDocuments?.[0]?.binding).toEqual({
    kind: 'source',
    assetId: clip.assetId,
    sourceInstanceId: clip.sourceInstanceId ?? clip.id,
  });
  const remembered = await selections(page);
  expect(remembered).not.toEqual(beforeChoices);
  await page.goto(projectUrl);
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  expect((await readProject(page, before.id))?.textDocuments).toEqual(accepted?.textDocuments);
  await test.step('Read the accepted text from the reopened project UI', async () => {
    await page
      .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
      .click();
    await page
      .getByRole('button', { name: label('videoEditor.sidebar.textDocuments'), exact: true })
      .click();
    const textPanel = page.locator('[data-ui="video-editor.text.panel"]');
    await textPanel
      .getByRole('button', { name: label('gallery.videoReview.textViewCards'), exact: true })
      .click();
    await textPanel.locator('article > button').first().click();
    await expect(
      textPanel
        .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
        .first()
    ).toHaveValue(recognized);
  });
  await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
  await page
    .getByRole('button', { name: label('gallery.videoReview.recognitionTitle'), exact: true })
    .click();
  await expect(selector).toContainText(connection.displayName);
  expect(await selections(page)).toEqual(remembered);
  const rangeStart = panel.getByRole('textbox', {
    name: label('gallery.videoReview.textFragmentStart'),
    exact: true,
  });
  await rangeStart.fill('1');
  await rangeStart.press('Enter');
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
  await expect(rangeStart).toHaveValue('1');
  await expectGrouping(panel);
  expect((await readProject(page, before.id))?.textDocuments).toEqual(accepted?.textDocuments);
  expect((await readProject(page, before.id))?.assets).toEqual(accepted?.assets);
  await page.keyboard.press('Escape');
  const play = page.getByRole('button', { name: label('videoEditor.timeline.play'), exact: true });
  await play.scrollIntoViewIfNeeded();
  await play.click();
  await expect
    .poll(() =>
      page
        .locator(
          '[data-ui="video-editor.workspace.viewer"] audio, [data-ui="video-editor.workspace.viewer"] video'
        )
        .evaluateAll((nodes) =>
          nodes.some(
            (media) => media instanceof HTMLMediaElement && !media.paused && media.currentTime > 0.2
          )
        )
    )
    .toBe(true);
  await page.goto(projectUrl);
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  expect((await readProject(page, before.id))?.textDocuments).toEqual(accepted?.textDocuments);
  expect((await readProject(page, before.id))?.assets).toEqual(accepted?.assets);
  await settings.close();
});

async function expectGrouping(panel: Locator) {
  const name = label('gallery.videoReview.recognitionGrouping');
  const selected = label('gallery.videoReview.recognitionSentences');
  const group = panel.getByRole('group', { name, exact: true });
  if (await group.count()) {
    await expect(group.getByRole('button', { name: selected, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  } else {
    await expect(panel.getByRole('button', { name, exact: true })).toContainText(selected);
  }
}
