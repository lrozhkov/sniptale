import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './live-fixture';
import { registerLiveProvider, configureLiveModel } from './provider-ui';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { chooseInspectorValue } from '../support/inspector-utilities';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
} from '../../../../apps/extension/src/features/scenario/project/public';
import { translate, type TranslationKey } from '../../../../apps/extension/src/platform/i18n';

const label = (key: TranslationKey) => translate(key, 'en');
const PRIVATE_BODY = 'LOCAL_PROVIDER_PRIVATE_BODY';
const TEXT_MODEL = 'Local text error model';
const ASR_MODEL = 'Local recognition error model';
const SPEECH_MODEL = 'Local speech error model';
const SOURCE_TEXT = 'Keep this authored source text.';
interface FailureCase {
  name: string;
  status: number;
  code?: string;
  message?: string;
  label: TranslationKey;
}
const failures: readonly FailureCase[] = [
  { name: 'credential', status: 401, label: 'settings.aiProviders.providerStatusInvalidKey' },
  { name: 'quota', status: 402, label: 'settings.aiProviders.providerStatusQuota' },
  { name: 'permission', status: 403, label: 'settings.aiProviders.providerStatusDenied' },
  { name: 'model', status: 404, label: 'settings.aiProviders.providerStatusModelUnavailable' },
  {
    name: 'rate',
    status: 429,
    code: 'slow_down',
    label: 'settings.aiProviders.providerStatusRate',
  },
  {
    name: 'credit-quota',
    status: 429,
    code: 'credit_balance_exhausted',
    label: 'settings.aiProviders.providerStatusQuota',
  },
  {
    name: 'documented-quota',
    status: 429,
    code: 'insufficient_quota',
    label: 'settings.aiProviders.providerStatusQuota',
  },
  {
    name: 'reserved-message-quota',
    status: 429,
    code: 'credit_balance_exhausted',
    message: 'provider-auth',
    label: 'settings.aiProviders.providerStatusQuota',
  },
  { name: 'service', status: 500, label: 'settings.aiProviders.providerStatusUnavailable' },
];

test.use({ trace: 'off', video: 'off', screenshot: 'off', actionTimeout: 15000 });

async function startLocalProvider() {
  const first = failures[0];
  if (!first) throw new Error('Local failure matrix is empty');
  let failure: FailureCase = first;
  const posts: string[] = [];
  let catalogReads = 0;
  const server = createServer((request, response) => {
    request.resume();
    if (request.method === 'GET' && request.url === '/v1/models') {
      catalogReads++;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ data: [{ id: 'local-text', name: TEXT_MODEL, type: 'chat' }] })
      );
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(404).end();
      return;
    }
    posts.push(request.url ?? '');
    response.writeHead(failure.status, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({ error: { message: failure.message ?? PRIVATE_BODY, code: failure.code } })
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local provider address missing');
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    posts,
    get catalogReads() {
      return catalogReads;
    },
    select(next: FailureCase) {
      failure = next;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
type LocalProvider = Awaited<ReturnType<typeof startLocalProvider>>;

async function click(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.click();
}

async function configureLocalProvider(page: Page, extensionId: string, provider: LocalProvider) {
  const settingsUrl = `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=ai-connections`;
  const name = `Live E2E local ${randomUUID()}`;
  await page.goto(settingsUrl);
  await page.evaluate(() => chrome.storage.local.set({ 'sniptale-locale-preference': 'en' }));
  await page.reload();
  const region = page.getByRole('region', { name: 'Providers', exact: true });
  await click(region.getByRole('button', { name: 'Add', exact: true }));
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Provider', { exact: true }).click();
  await page.getByRole('option', { name: 'OpenAI-compatible', exact: true }).click();
  await dialog.locator('input').first().fill(name);
  await dialog
    .getByPlaceholder(label('settings.aiProviders.providerApiUrlPlaceholder'))
    .fill(provider.endpoint);
  await page.evaluate(() => {
    const input = document.querySelector('[role="dialog"] input[type="password"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('Local credential field missing');
    input.value = 'synthetic-local-errors-key';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(dialog.getByRole('button', { name: 'Add', exact: true }));
  await expect(dialog).toHaveCount(0);
  const providerId = await page.evaluate(async (name) => {
    const values: unknown = (await chrome.storage.local.get('sniptale_ai_providers'))[
      'sniptale_ai_providers'
    ];
    if (!Array.isArray(values)) throw new Error('Local provider list missing');
    for (const value of values) {
      const entry: unknown = value;
      if (
        typeof entry === 'object' &&
        entry !== null &&
        'name' in entry &&
        entry.name === name &&
        'id' in entry &&
        typeof entry.id === 'string'
      )
        return entry.id;
    }
    throw new Error('Local provider identity missing');
  }, name);
  registerLiveProvider(page, providerId, settingsUrl);
  await expect(region.locator(`[data-settings-collection-item="${providerId}"]`)).toContainText(
    'Catalog accessible',
    { timeout: 45000 }
  );
  expect(provider.catalogReads).toBeGreaterThan(0);
  expect(provider.posts).toHaveLength(0);
  return { name, providerId, settingsUrl };
}

async function addAudioModel(
  page: Page,
  connection: Awaited<ReturnType<typeof configureLocalProvider>>,
  operation: 'transcription' | 'speech'
) {
  await configureLiveModel(
    page,
    {
      providerId: connection.providerId,
      providerName: connection.name,
      settingsUrl: connection.settingsUrl,
    },
    {
      modelId: `local-${operation}`,
      displayName: operation === 'speech' ? SPEECH_MODEL : ASR_MODEL,
      audio:
        operation === 'speech'
          ? { speech: { voiceId: 'fixture-voice', responseFormat: 'wav' } }
          : { transcription: { responseFormat: 'verbose_json', timestampGranularity: 'word' } },
    },
    operation,
    'manual'
  );
}

async function openTextSource(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  const project = createGuideProject('Local errors source', `local-errors-${randomUUID()}`, 1000);
  const step = createGuideStep('Selected step', 'local-step');
  step.blocks = [
    { kind: 'text', id: 'local-text', paragraphs: createGuideParagraphs(SOURCE_TEXT) },
  ];
  project.items = [step];
  await page.evaluate(async (project) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('scenario_projects', 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      tx.objectStore('scenario_projects').put({
        id: project.id,
        project,
        createdAt: 1000,
        updatedAt: 1000,
        workspaceRevision: 1,
        lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
      });
      await done;
    } finally {
      db.close();
    }
  }, project);
  const url = `chrome-extension://${extensionId}/apps/extension/src/scenario-editor/index.html?projectId=${project.id}`;
  await page.goto(url);
  await expect(page.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
    project.name
  );
  return { url, id: project.id };
}

async function expectFailure(
  panel: Locator,
  failure: FailureCase,
  provider: LocalProvider,
  before: number,
  path: string
) {
  await expect(panel.getByRole('alert')).toHaveText(label(failure.label), { timeout: 30000 });
  await expect(panel).not.toContainText(PRIVATE_BODY);
  expect(provider.posts.slice(before)).toEqual([path]);
}

async function openVideoSource(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
  await page.goto(
    `chrome-extension://${extensionId}/apps/extension/src/video-editor/index.html?id=beta-v1-recording`
  );
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  await expect
    .poll(async () => (await readNativeVideoProject(page))?.clips.length ?? 0)
    .toBeGreaterThan(0);
  const source = await readNativeVideoProject(page);
  if (!source) throw new Error('Local native video source missing');
  const url = `chrome-extension://${extensionId}/apps/extension/src/video-editor/index.html?project=${source.id}`;
  await page.goto(url);
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  return { source, url };
}

type VideoSource = NonNullable<Awaited<ReturnType<typeof readNativeVideoProject>>>;
async function expectVideoSource(page: Page, source: VideoSource) {
  expect(new URL(page.url()).searchParams.get('project')).toBe(source.id);
  const retained = await readNativeVideoProject(page, source.id);
  if (!retained) throw new Error('Local video project missing after operation');
  expect(retained.id).toBe(source.id);
  expect(retained.clips).toEqual(source.clips);
  expect(retained.assets).toEqual(source.assets);
  expect(retained.textDocuments ?? []).toEqual(source.textDocuments ?? []);
}

async function checkRecognitionFailures(
  page: Page,
  provider: LocalProvider,
  source: VideoSource,
  projectUrl: string
) {
  const clip = source.clips.find(
    (entry) =>
      (entry.type === 'VIDEO' || entry.type === 'AUDIO') &&
      source.assets.find((asset) => asset.id === entry.assetId)?.metadata.hasAudio
  );
  if (!clip) throw new Error('Committed native audio fixture has no audible clip');
  for (const failure of failures) {
    provider.select(failure);
    await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
    await click(
      page.getByRole('button', { name: label('gallery.videoReview.recognitionTitle'), exact: true })
    );
    const panel = page.locator('[data-ui="video-editor.recognition.panel"]');
    await panel.locator('.sniptale-ai-model-selector-trigger').click();
    await panel.getByRole('button', { name: ASR_MODEL, exact: true }).click();
    const before = provider.posts.length;
    await click(
      panel.getByRole('button', {
        name: label('gallery.videoReview.recognitionStart'),
        exact: true,
      })
    );
    await click(
      panel.getByRole('button', {
        name: label('gallery.videoReview.speechConsentContinue'),
        exact: true,
      })
    );
    await expectFailure(panel, failure, provider, before, '/v1/audio/transcriptions');
    await expectVideoSource(page, source);
    await page.goto(projectUrl);
    await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
    await expectVideoSource(page, source);
    expect(provider.posts.length).toBe(before + 1);
  }
}

async function openSpeechSource(page: Page) {
  const previous = await readNativeVideoProject(page);
  const previousFragments =
    previous?.textDocuments?.flatMap((entry) => entry.document.fragments).length ?? 0;
  await click(
    page.getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
  );
  await click(
    page.getByRole('button', { name: label('videoEditor.sidebar.textDocuments'), exact: true })
  );
  const text = page.locator('[data-ui="video-editor.text.panel"]');
  await click(
    text.getByRole('button', { name: label('videoEditor.sidebar.newProjectText'), exact: true })
  );
  const phrase = text.getByRole('textbox', {
    name: label('gallery.videoReview.speechText'),
    exact: true,
  });
  await phrase.fill(SOURCE_TEXT);
  await phrase.press('Tab');
  await expect
    .poll(async () => {
      const fragments =
        (await readNativeVideoProject(page))?.textDocuments?.flatMap(
          (entry) => entry.document.fragments
        ) ?? [];
      return fragments.length > previousFragments && fragments.at(-1)?.text === SOURCE_TEXT;
    })
    .toBe(true);
  await click(text.locator('[data-project-text-voice]').last());
  const voice = page.locator('[data-ui="video-editor.text-voice.panel"]');
  await voice.locator('.sniptale-ai-model-selector-trigger').click();
  await voice.getByRole('button', { name: SPEECH_MODEL, exact: true }).click();
  await voice
    .getByRole('textbox', { name: label('gallery.videoReview.speechVoice'), exact: true })
    .fill('alloy');
  await chooseInspectorValue(page, voice, label('gallery.videoReview.speechFormat'), 'WAV');
  return voice;
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`local text failures preserve source ${name}`, async ({ page, extensionId }) => {
    test.setTimeout(240000);
    await page.setViewportSize(size);
    const provider = await startLocalProvider();
    try {
      const connection = await configureLocalProvider(page, extensionId, provider);
      const project = await openTextSource(page, extensionId);
      await page.getByRole('button', { name: 'AI assistance', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const picker = dialog.locator('.sniptale-ai-model-selector-trigger');
      await picker.click();
      await page
        .getByPlaceholder(label('aiModal.modelSearchPlaceholder'), { exact: true })
        .fill(TEXT_MODEL);
      await page.getByTitle(TEXT_MODEL, { exact: true }).click();
      await expect(picker).toContainText(connection.name);
      await dialog.locator('textarea').fill('Improve the selected text.');
      for (const failure of failures) {
        provider.select(failure);
        const before = provider.posts.length;
        await dialog.getByRole('button', { name: 'Get suggestions', exact: true }).click();
        await expectFailure(dialog, failure, provider, before, '/v1/chat/completions');
        await expect(picker).toContainText(connection.name);
        await expect(
          dialog.getByRole('button', { name: 'Get suggestions', exact: true })
        ).toBeEnabled();
        await expect(
          dialog.getByRole('button', { name: 'Apply selected', exact: true })
        ).toHaveCount(0);
      }
      await page.keyboard.press('Escape');
      const body = page.getByRole('textbox', { name: label('scenario.editor.body'), exact: true });
      await expect(body).toHaveValue(SOURCE_TEXT);
      const beforeReopen = provider.posts.length;
      await page.goto(project.url);
      expect(new URL(page.url()).searchParams.get('projectId')).toBe(project.id);
      await expect(body).toHaveValue(SOURCE_TEXT);
      expect(provider.posts.length).toBe(beforeReopen);
    } finally {
      await provider.close();
    }
  });

  test(`local native audio failures preserve source and reopen ${name}`, async ({
    page,
    extensionId,
  }) => {
    test.setTimeout(480000);
    await page.setViewportSize(size);
    const provider = await startLocalProvider();
    try {
      const connection = await configureLocalProvider(page, extensionId, provider);
      await addAudioModel(page, connection, 'transcription');
      await addAudioModel(page, connection, 'speech');
      const { source, url } = await openVideoSource(page, extensionId);
      await checkRecognitionFailures(page, provider, source, url);
      const voice = await openSpeechSource(page);
      const authored = await readNativeVideoProject(page, source.id);
      if (!authored) throw new Error('Local authored speech source missing');
      for (const failure of failures) {
        provider.select(failure);
        const before = provider.posts.length;
        await click(
          voice.getByRole('button', {
            name: label('gallery.videoReview.speechGenerate'),
            exact: true,
          })
        );
        await click(
          voice.getByRole('button', {
            name: label('gallery.videoReview.speechConsentContinue'),
            exact: true,
          })
        );
        await expectFailure(voice, failure, provider, before, '/v1/audio/speech');
        await expectVideoSource(page, authored);
      }
      const beforeChoice = provider.posts.length;
      await voice.locator('.sniptale-ai-model-selector-trigger').click();
      await voice.getByRole('button', { name: SPEECH_MODEL, exact: true }).click();
      await expect(voice.getByRole('alert')).toHaveCount(0);
      expect(provider.posts.length).toBe(beforeChoice);
      await page.goto(url);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expectVideoSource(page, authored);
      expect(provider.posts.length).toBe(beforeChoice);
    } finally {
      await provider.close();
    }
  });
}
