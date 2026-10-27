import {
  parseVoiceHistoryEntry,
  type VoiceHistoryEntry,
} from '@sniptale/runtime-contracts/voice-input';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  type ViewportSize,
} from '@playwright/test';
import {
  translate,
  type AppLocale,
  type TranslationKey,
} from '../../../../apps/extension/src/platform/i18n';
import {
  createGuideProject,
  createGuideStep,
} from '../../../../apps/extension/src/features/scenario/project/factories';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';

export const RAW_TRANSCRIPT = 'synthetic microphone words before correction';
export const CORRECTED_TRANSCRIPT = 'Synthetic microphone words after correction.';
export const CORRECTION_PROMPT = 'Correct punctuation only. Preserve the original meaning.';
export const PROVIDER_NAME = 'Native voice loopback';
export const ASR_MODEL_NAME = 'Native dictation ASR';
export const TEXT_MODEL_NAME = 'Native dictation correction';
const SETTINGS_PATH = '/apps/extension/src/settings/index.html';
type Stage = 'asr' | 'correction';
type ResponseMode = 'ok' | 'error' | 'hold';
export const ui = (page: Page | Locator, name: string) => page.locator(`[data-ui="${name}"]`);
const label = (locale: AppLocale, key: TranslationKey) => translate(key, locale);

async function requestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value)
      ? value
      : typeof value === 'string'
        ? Buffer.from(value)
        : null;
    if (!chunk) throw new Error('Synthetic request chunk invalid');
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('Synthetic request exceeded its test budget');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function wavDescriptor(body: Buffer) {
  const start = body.indexOf('RIFF');
  if (start < 0 || body.length < start + 44) return null;
  return {
    magic: body.toString('ascii', start + 8, start + 12),
    format: body.readUInt16LE(start + 20),
    channels: body.readUInt16LE(start + 22),
    sampleRate: body.readUInt32LE(start + 24),
    sampleBits: body.readUInt16LE(start + 34),
    dataBytes: body.readUInt32LE(start + 40),
    filenameIsPrivate: body.includes('filename="audio.wav"'),
    modelIsSelected: body.includes('synthetic-asr'),
  };
}

function correctionPayload(body: Buffer): unknown {
  const value: unknown = JSON.parse(body.toString('utf8'));
  if (typeof value !== 'object' || value === null || !('model' in value) || !('messages' in value))
    return null;
  return { model: value.model, messages: value.messages };
}

/** Real HTTP replies reach the service worker without replacing extension runtime or fetch APIs. */
export async function startVoiceProvider() {
  let transcript = RAW_TRANSCRIPT;
  const modes: Record<Stage, ResponseMode> = { asr: 'ok', correction: 'ok' };
  const pending: Record<Stage, Set<ServerResponse>> = { asr: new Set(), correction: new Set() };
  const uploads: Array<ReturnType<typeof wavDescriptor>> = [];
  const corrections: unknown[] = [];
  const respond = (stage: Stage, response: ServerResponse) => {
    if (response.destroyed) return;
    if (modes[stage] === 'hold') {
      pending[stage].add(response);
      return;
    }
    response.writeHead(modes[stage] === 'error' ? 500 : 200, {
      'content-type': 'application/json',
    });
    response.end(
      JSON.stringify(
        modes[stage] === 'error'
          ? { error: { message: 'Synthetic provider failure' } }
          : stage === 'asr'
            ? { text: transcript }
            : {
                choices: [
                  {
                    finish_reason: 'stop',
                    message: { role: 'assistant', content: CORRECTED_TRANSCRIPT },
                  },
                ],
              }
      )
    );
  };
  const server = createServer((request, response) => {
    const stage =
      request.url === '/v1/audio/transcriptions'
        ? 'asr'
        : request.url === '/v1/chat/completions'
          ? 'correction'
          : null;
    if (!stage || request.method !== 'POST') {
      response.writeHead(404).end();
      return;
    }
    void requestBody(request)
      .then((body) => {
        if (stage === 'asr') uploads.push(wavDescriptor(body));
        else corrections.push(correctionPayload(body));
        respond(stage, response);
      })
      .catch(() => {
        if (!response.destroyed) response.writeHead(400).end();
      });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Synthetic provider address missing');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    uploads,
    corrections,
    setTranscript(text: string) {
      transcript = text;
    },
    hold(stage: Stage) {
      modes[stage] = 'hold';
    },
    respond(stage: Stage, mode: Exclude<ResponseMode, 'hold'> = 'ok') {
      modes[stage] = mode;
      for (const response of pending[stage]) respond(stage, response);
      pending[stage].clear();
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}

export async function openVoiceSettings(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}${SETTINGS_PATH}?section=voice-input`);
  await expect(ui(page, 'settings.voice.backend')).toBeVisible();
}

async function grantSyntheticProvider(page: Page, origin: string) {
  // This established native fixture gesture grants the same optional origin permission as Settings.
  await page.evaluate((origin) => {
    const button = document.createElement('button');
    button.textContent = 'Grant synthetic voice provider';
    button.style.cssText = 'position:fixed;right:8px;top:8px;z-index:2147483647';
    button.onclick = async () => {
      button.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${origin}/*`] })
      );
    };
    document.body.append(button);
  }, origin);
  const grant = page.getByRole('button', { name: 'Grant synthetic voice provider', exact: true });
  await grant.click();
  await expect(grant).toHaveAttribute('data-granted', 'true');
  await grant.evaluate((node) => node.remove());
}

async function addNativeModel(page: Page, locale: AppLocale, operation: 'text' | 'transcription') {
  const models = page.getByRole('region', {
    name: label(locale, 'settings.aiProviders.modelsTitle'),
    exact: true,
  });
  await models
    .getByRole('button', { name: label(locale, 'common.actions.add'), exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', {
      name: label(locale, 'settings.aiProviders.modelProviderPlaceholder'),
      exact: true,
    })
    .click();
  await page.getByRole('option', { name: PROVIDER_NAME, exact: true }).click();
  await dialog
    .getByRole('button', {
      name: label(locale, 'settings.aiProviders.modelManualEntry'),
      exact: true,
    })
    .click();
  await dialog
    .getByPlaceholder(label(locale, 'settings.aiProviders.modelNamePlaceholder'), { exact: true })
    .fill(operation === 'text' ? TEXT_MODEL_NAME : ASR_MODEL_NAME);
  await dialog
    .getByPlaceholder(label(locale, 'settings.aiProviders.modelCodePlaceholder'), { exact: true })
    .fill(operation === 'text' ? 'synthetic-text' : 'synthetic-asr');
  if (operation === 'transcription') {
    await dialog
      .locator('summary')
      .filter({ hasText: label(locale, 'settings.aiProviders.modelOperationsTitle') })
      .click();
    await dialog
      .getByRole('button', {
        name: `${label(locale, 'settings.aiProviders.modelOperationsTitle')}: ${label(locale, 'settings.aiProviders.modelOperationTranscription')}`,
        exact: true,
      })
      .click();
    await page
      .getByRole('option', {
        name: label(locale, 'settings.aiProviders.modelSupportYes'),
        exact: true,
      })
      .click();
    await dialog
      .getByRole('button', {
        name: `${label(locale, 'settings.aiProviders.modelOperationsTitle')}: ${label(locale, 'settings.aiProviders.modelOperationText')}`,
        exact: true,
      })
      .click();
    await page
      .getByRole('option', {
        name: label(locale, 'settings.aiProviders.modelSupportNo'),
        exact: true,
      })
      .click();
    await dialog
      .locator('summary')
      .filter({ hasText: label(locale, 'settings.aiProviders.modelInputTitle') })
      .click();
    await dialog
      .getByRole('button', {
        name: `${label(locale, 'settings.aiProviders.modelInputTitle')}: ${label(locale, 'settings.aiProviders.modelModalityAudio')}`,
        exact: true,
      })
      .click();
    await page
      .getByRole('option', {
        name: label(locale, 'settings.aiProviders.modelSupportYes'),
        exact: true,
      })
      .click();
  }
  const save = dialog.getByRole('button', {
    name: label(locale, 'common.actions.add'),
    exact: true,
  });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await expect(dialog).toHaveCount(0);
}

export async function configureNativeProvider(
  page: Page,
  extensionId: string,
  locale: AppLocale,
  origin: string
) {
  await page.goto(`chrome-extension://${extensionId}${SETTINGS_PATH}?section=ai-connections`);
  await grantSyntheticProvider(page, origin);
  const providers = page.getByRole('region', {
    name: label(locale, 'settings.aiProviders.providersTitle'),
    exact: true,
  });
  await providers
    .getByRole('button', { name: label(locale, 'common.actions.add'), exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').nth(0).fill(PROVIDER_NAME);
  await dialog.locator('input').nth(1).fill(`${origin}/v1`);
  await dialog.locator('input[type=password]').fill('synthetic-voice-fixture-key');
  const save = dialog.getByRole('button', {
    name: label(locale, 'common.actions.add'),
    exact: true,
  });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await expect(dialog).toHaveCount(0);
  await addNativeModel(page, locale, 'transcription');
  await addNativeModel(page, locale, 'text');
}

export async function configureVoicePreferences(
  page: Page,
  extensionId: string,
  locale: AppLocale
) {
  await openVoiceSettings(page, extensionId);
  await ui(page, 'settings.voice.backend')
    .getByRole('button', { name: label(locale, 'settings.voiceInput.backendModel'), exact: true })
    .click();
  const asr = ui(page, 'settings.voice.transcription-model').locator(
    '.sniptale-ai-model-selector-trigger'
  );
  await asr.click();
  await expect(page.getByRole('button', { name: TEXT_MODEL_NAME, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ASR_MODEL_NAME, exact: true }).click();
  await ui(page, 'settings.voice.correction').click();
  await ui(page, 'settings.voice.correction-model')
    .locator('.sniptale-ai-model-selector-trigger')
    .click();
  await expect(page.getByRole('button', { name: ASR_MODEL_NAME, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: TEXT_MODEL_NAME, exact: true }).click();
  const prompt = ui(page, 'settings.voice.correction-prompt');
  await prompt.fill(CORRECTION_PROMPT);
  await ui(page, 'settings.voice.prompt-save').scrollIntoViewIfNeeded();
  await ui(page, 'settings.voice.prompt-save').click();
  await expect(ui(page, 'settings.voice.prompt-save')).toBeDisabled();
  await page.reload();
  await expect(asr).toContainText(ASR_MODEL_NAME);
  await expect(ui(page, 'settings.voice.correction')).toHaveAttribute('aria-checked', 'true');
  await expect(ui(page, 'settings.voice.correction-model')).toContainText(TEXT_MODEL_NAME);
  await expect(prompt).toHaveValue(CORRECTION_PROMPT);
}

export async function withVoiceBrowser(
  viewport: ViewportSize,
  locale: AppLocale,
  run: (fixture: {
    page: Page;
    extensionId: string;
    provider: Awaited<ReturnType<typeof startVoiceProvider>>;
    context: Awaited<ReturnType<typeof launchExtensionBrowser>>['context'];
  }) => Promise<void>
) {
  const provider = await startVoiceProvider();
  let browser: Awaited<ReturnType<typeof launchExtensionBrowser>> | null = null;
  try {
    browser = await launchExtensionBrowser({ viewport, fakeMediaDevices: true });
    await browser.context.grantPermissions(['microphone', 'clipboard-read', 'clipboard-write']);
    const page = await browser.context.newPage();
    await page.goto(
      `chrome-extension://${browser.extensionId}${SETTINGS_PATH}?section=ai-connections`
    );
    await expect(page.getByRole('region', { name: /^(Providers|Провайдеры)$/u })).toBeVisible();
    await page.evaluate(
      async ({ locale, theme }) =>
        chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        }),
      { locale, theme: locale === 'en' ? 'light' : 'dark' }
    );
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await configureNativeProvider(page, browser.extensionId, locale, provider.origin);
    await configureVoicePreferences(page, browser.extensionId, locale);
    await run({ page, extensionId: browser.extensionId, provider, context: browser.context });
  } finally {
    if (browser) await closeExtensionBrowser(browser, { removeUserDataDir: true });
    await provider.close();
  }
}

export async function recordSettingsMicrophone(page: Page) {
  await ui(page, 'settings.voice.start').scrollIntoViewIfNeeded();
  await ui(page, 'settings.voice.start').click();
  await expect(ui(page, 'settings.voice.stop')).toBeVisible();
  // Retain real microphone frames long enough to operate native audio playback.
  await page.waitForTimeout(800);
  await ui(page, 'settings.voice.stop').click();
}

export async function readVoiceStorage(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = ['voice_input_history', 'media_library'];
    const tx = db.transaction(stores, 'readonly');
    const catalogResult = new Promise<unknown>((resolve, reject) => {
      const request = tx.objectStore('voice_input_history').get('catalog');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const libraryResult = new Promise<number>((resolve, reject) => {
      const request = tx.objectStore('media_library').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [catalog, libraryCount] = await Promise.all([catalogResult, libraryResult]);
    db.close();
    let privateAudio: number;
    try {
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('sniptale-voice-input');
      const names: string[] = [];
      for await (const name of root.keys()) names.push(name);
      privateAudio = names.length;
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
      privateAudio = 0;
    }
    return { catalog, libraryCount, privateAudio };
  });
}

export async function voiceScreenshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1);
  const horizontal = page.locator('.sniptale-settings-viewport');
  if (await horizontal.count()) {
    const layout = await horizontal.evaluate((node) => {
      const workspace = node.querySelector(':scope > .sniptale-settings-workspace');
      if (!(workspace instanceof HTMLElement)) throw new Error('Settings workspace missing');
      return {
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        workspaceWidth: workspace.getBoundingClientRect().width,
        minWidth: getComputedStyle(workspace).minWidth,
      };
    });
    expect(layout.minWidth).toBe('1280px');
    const expectedWidth = Math.max(1280, layout.clientWidth);
    expect(Math.abs(layout.workspaceWidth - expectedWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.scrollWidth - expectedWidth)).toBeLessThanOrEqual(1);
  }
  const content = ui(page, 'settings.page.content-scroll');
  if (await content.count())
    expect(
      await content.evaluate((node) => node.scrollWidth - node.clientWidth)
    ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

export async function openNativeVoiceScenario(page: Page, extensionId: string) {
  const project = createGuideProject('Global voice integration', 'voice-native-scenario', 1000);
  project.items = [createGuideStep('Original title', 'voice-step')];
  await page.evaluate(async (project) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('scenario_projects', 'readwrite');
    tx.objectStore('scenario_projects').put({
      id: project.id,
      project,
      createdAt: 1000,
      updatedAt: 1000,
      workspaceRevision: 1,
      lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, project);
  await page.goto(
    `chrome-extension://${extensionId}/apps/extension/src/scenario-editor/index.html?projectId=${project.id}`
  );
  const field = page.getByRole('textbox', { name: /^(Step title|Заголовок шага)$/u });
  await expect(field).toHaveValue('Original title');
  return {
    field,
    microphone: field.locator('xpath=..').locator('[data-ui="scenario.voice-input"]'),
  };
}

export async function readVoiceEntries(page: Page): Promise<VoiceHistoryEntry[]> {
  const { catalog } = await readVoiceStorage(page);
  if (
    typeof catalog !== 'object' ||
    catalog === null ||
    !('entries' in catalog) ||
    !Array.isArray(catalog.entries)
  )
    throw new Error('Native voice catalog missing');
  return catalog.entries.map((value: unknown) => {
    const entry = parseVoiceHistoryEntry(value);
    if (!entry) throw new Error('Native voice entry invalid');
    return entry;
  });
}

export async function captureVoicePreferences(page: Page, info: TestInfo, name: string) {
  const original = await page.locator('html').getAttribute('data-theme');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      async (theme) => chrome.storage.local.set({ 'sniptale-theme-preference': theme }),
      theme
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await ui(page, 'settings.voice.backend').scrollIntoViewIfNeeded();
    await voiceScreenshot(page, info, `${name}-models-${theme}`);
    await ui(page, 'settings.voice.prompt-save').scrollIntoViewIfNeeded();
    await voiceScreenshot(page, info, `${name}-prompt-${theme}`);
  }
  if (original === 'light' || original === 'dark') {
    await page.evaluate(
      async (theme) => chrome.storage.local.set({ 'sniptale-theme-preference': theme }),
      original
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', original);
  }
}

/** Settings intentionally keeps a 1280px workspace; its outer viewport owns compact panning. */
export async function proveCompactVoiceReachability(page: Page, info: TestInfo) {
  const horizontal = page.locator('.sniptale-settings-viewport');
  const prompt = ui(page, 'settings.voice.correction-prompt');
  await prompt.scrollIntoViewIfNeeded();
  const budget = await horizontal.evaluate((node) => ({
    width: node.clientWidth,
    range: node.scrollWidth - node.clientWidth,
  }));
  expect(budget.range).toBeGreaterThan(0);
  expect(Math.abs(budget.range - (1280 - budget.width))).toBeLessThanOrEqual(1);
  await horizontal.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await expect.poll(() => horizontal.evaluate((node) => node.scrollLeft)).toBe(budget.range);
  const frame = (await horizontal.boundingBox())!;
  const workspace = (await horizontal
    .locator(':scope > .sniptale-settings-workspace')
    .boundingBox())!;
  expect(Math.abs(workspace.x + workspace.width - frame.x - budget.width)).toBeLessThanOrEqual(1);
  await voiceScreenshot(page, info, 'compact-right-edge');
  // Align the whole prompt inside the viewport after proving the maximum horizontal pan.
  await prompt.evaluate((node) => {
    const viewport = node.closest('.sniptale-settings-viewport');
    if (!(viewport instanceof HTMLElement)) throw new Error('Settings scroll owner missing');
    const field = node.getBoundingClientRect();
    viewport.scrollLeft +=
      field.right - viewport.getBoundingClientRect().left - viewport.clientWidth + 8;
  });
  for (const control of [
    prompt,
    ui(page, 'settings.voice.prompt-save'),
    ui(page, 'settings.voice.prompt-reset'),
  ]) {
    await expect(control).toBeInViewport({ ratio: 1 });
    const bounds = (await control.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(frame.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(frame.x + budget.width + 1);
  }
  await prompt.click();
  await expect(prompt).toBeFocused();
  await voiceScreenshot(page, info, 'compact-prompt-controls');
}
