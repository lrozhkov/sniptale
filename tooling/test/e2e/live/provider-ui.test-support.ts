import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { z } from 'zod';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { getAIProviderDefinition } from '../../../../apps/extension/src/contracts/settings/ai-provider';
import type { AIModelOperation } from '../../../../apps/extension/src/contracts/settings/model-operation';
import { readLiveCredential } from './configuration';
import type { LiveModel, LiveProfile } from './profiles';

const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
const owned = new WeakMap<Page, Map<string, string>>();
export interface LiveConnection {
  providerId: string;
  modelId: string;
  modelCode: string;
  displayName: string;
  providerName: string;
  settingsUrl: string;
}

/** Registers the exact connection identity owned by this temporary browser scenario. */
export function registerLiveProvider(page: Page, providerId: string, settingsUrl: string): void {
  const records = owned.get(page) ?? new Map<string, string>();
  records.set(providerId, settingsUrl);
  owned.set(page, records);
}

/** Removes plaintext from open controls before failure artifacts can inspect the page. */
export async function clearLivePasswords(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const field of document.querySelectorAll<HTMLInputElement>('input[type="password"]'))
      field.value = '';
  });
}

/** Uses existing Settings deletion for only the registered test connections. */
export async function cleanupLiveProviders(page: Page): Promise<void> {
  for (const [id, url] of owned.get(page) ?? []) {
    await page.goto(url);
    await expect(page.getByRole('region', { name: 'Providers', exact: true })).toBeVisible();
    const target = page.locator(`[data-settings-collection-item="${id}"]`);
    if ((await target.count()) === 0) continue;
    await target
      .getByRole('button', { name: label('settings.collection.actions.menu'), exact: true })
      .click();
    await page
      .getByRole('button', { name: label('settings.collection.actions.delete'), exact: true })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: label('common.actions.delete'), exact: true })
      .click();
    await expect(target).toHaveCount(0);
  }
  owned.delete(page);
}

async function select(
  page: Page,
  dialog: Locator,
  key: Parameters<typeof translate>[0],
  option: string
) {
  await dialog.getByLabel(label(key), { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function addConnection(page: Page, extensionId: string, profile: LiveProfile) {
  const settingsUrl = `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=ai-connections`;
  const providerName = `Live E2E ${profile.id} ${randomUUID()}`;
  const key = readLiveCredential();
  await page.goto(settingsUrl);
  const providers = page.getByRole('region', { name: 'Providers', exact: true });
  await providers.getByRole('button', { name: 'Add', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const definition = getAIProviderDefinition(profile.connectionType);
  await select(page, dialog, 'settings.aiProviders.providerTypeLabel', definition.label);
  await dialog
    .getByLabel(label('settings.aiProviders.providerNameLabel'), { exact: true })
    .fill(providerName);
  const endpoint = dialog.getByLabel(label('settings.aiProviders.providerApiUrlLabel'), {
    exact: true,
  });
  if (profile.endpoint !== definition.baseUrl || profile.connectionType === 'openai-compatible') {
    if (!(await endpoint.isVisible())) await dialog.locator('summary').click();
    await endpoint.fill(profile.endpoint);
  }
  if (profile.management === 'manual')
    await select(page, dialog, 'settings.aiProviders.providerManagementLabel', 'Manual');
  try {
    await page.evaluate((value) => {
      const field = document.querySelector<HTMLInputElement>(
        '[role="dialog"] input[type="password"]'
      );
      if (!field) throw new Error('The credential control is unavailable.');
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }, key);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 45000 });
  } finally {
    await clearLivePasswords(page);
  }
  const row = providers
    .locator('[data-settings-collection-item]')
    .filter({ hasText: providerName });
  await expect(row).toHaveCount(1);
  const providerId = await row.getAttribute('data-settings-collection-item');
  if (!providerId) throw new Error('The accepted test connection has no identity.');
  registerLiveProvider(page, providerId, settingsUrl);
  if (profile.management === 'automatic')
    await expect(row).toContainText('Catalog accessible', { timeout: 45000 });
  return { providerId, providerName, settingsUrl };
}

const storedModel = z.object({
  id: z.string(),
  providerId: z.string(),
  modelCode: z.string(),
  displayName: z.string(),
});
async function findModel(page: Page, providerId: string, modelCode: string) {
  const value: unknown = await page.evaluate(
    async () => (await chrome.storage.local.get('sniptale_ai_models'))['sniptale_ai_models']
  );
  const parsed = z.array(storedModel).safeParse(value);
  return parsed.success
    ? parsed.data.find((model) => model.providerId === providerId && model.modelCode === modelCode)
    : undefined;
}

async function configureManualCapabilities(
  page: Page,
  dialog: Locator,
  operation: AIModelOperation
) {
  for (const [group, item] of [
    [
      'settings.aiProviders.modelOperationsTitle',
      operation === 'text'
        ? 'settings.aiProviders.modelOperationText'
        : operation === 'speech'
          ? 'settings.aiProviders.modelOperationSpeech'
          : 'settings.aiProviders.modelOperationTranscription',
    ],
    [
      'settings.aiProviders.modelInputTitle',
      operation === 'transcription'
        ? 'settings.aiProviders.modelModalityAudio'
        : 'settings.aiProviders.modelModalityText',
    ],
    [
      'settings.aiProviders.modelOutputTitle',
      operation === 'speech'
        ? 'settings.aiProviders.modelModalityAudio'
        : 'settings.aiProviders.modelModalityText',
    ],
  ] as const) {
    const details = dialog
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: label(group) }) });
    if (!(await details.getAttribute('open'))) {
      if (
        !(await dialog.getByLabel(`${label(group)}: ${label(item)}`, { exact: true }).isVisible())
      )
        await details.locator('summary').click();
    }
    await dialog.getByLabel(`${label(group)}: ${label(item)}`, { exact: true }).click();
    await page.getByRole('option', { name: 'Yes', exact: true }).click();
  }
  if (operation !== 'text') {
    await dialog
      .getByLabel(
        `${label('settings.aiProviders.modelOperationsTitle')}: ${label('settings.aiProviders.modelOperationText')}`,
        { exact: true }
      )
      .click();
    await page.getByRole('option', { name: 'No', exact: true }).click();
  }
}

async function configureAudio(
  page: Page,
  dialog: Locator,
  entry: LiveModel,
  operation: AIModelOperation
) {
  if (operation === 'text') return;
  const parameters = dialog.locator('details').filter({
    has: page
      .locator('summary')
      .filter({ hasText: label('settings.aiProviders.modelAudioParameters') }),
  });
  if (
    !(await dialog
      .getByLabel(label('settings.aiProviders.modelOperationLabel'), { exact: true })
      .isVisible())
  )
    await parameters.locator('summary').click();
  await select(
    page,
    dialog,
    'settings.aiProviders.modelOperationLabel',
    operation === 'speech' ? 'Speech generation' : 'Transcription'
  );
  const transcription = entry.audio?.transcription;
  if (operation === 'transcription' && transcription) {
    if (transcription.transport === 'audio-chat') {
      await select(
        page,
        dialog,
        'settings.aiProviders.modelAudioTransport',
        label('settings.aiProviders.modelAudioMultimodal')
      );
      if (transcription.chatProtocol === 'bothub')
        await select(
          page,
          dialog,
          'settings.aiProviders.modelAudioChatProtocol',
          label('settings.aiProviders.modelAudioProtocolBothub')
        );
      await select(
        page,
        dialog,
        'settings.aiProviders.modelAudioStructuredOutput',
        label(
          transcription.structuredOutput === 'json_object'
            ? 'settings.aiProviders.modelAudioJsonObject'
            : 'settings.aiProviders.modelAudioJsonSchema'
        )
      );
    } else {
      await select(
        page,
        dialog,
        'settings.aiProviders.modelAudioFormat',
        transcription.responseFormat === 'json'
          ? 'JSON'
          : label('settings.aiProviders.modelAudioVerboseJson')
      );
      await select(
        page,
        dialog,
        'settings.aiProviders.modelAudioTimestamps',
        label(
          transcription.timestampGranularity === 'word'
            ? 'settings.aiProviders.modelAudioTimestampsWord'
            : transcription.timestampGranularity === 'segment'
              ? 'settings.aiProviders.modelAudioTimestampsSegment'
              : 'settings.aiProviders.modelAudioTimestampsNone'
        )
      );
    }
    if (transcription.language)
      await dialog
        .getByLabel(label('settings.aiProviders.modelAudioLanguage'), { exact: true })
        .fill(transcription.language);
    if (transcription.prompt)
      await dialog
        .getByLabel(label('settings.aiProviders.modelAudioPrompt'), { exact: true })
        .fill(transcription.prompt);
  }
  const speech = entry.audio?.speech;
  if (operation === 'speech' && speech) {
    await dialog
      .getByLabel(label('settings.aiProviders.modelAudioVoice'), { exact: true })
      .fill(speech.voiceId);
    await select(
      page,
      dialog,
      'settings.aiProviders.modelAudioFormat',
      speech.responseFormat === 'pcm'
        ? label('settings.aiProviders.modelAudioPcm')
        : speech.responseFormat.toUpperCase()
    );
    if (speech.speed !== undefined)
      await dialog
        .getByLabel(label('settings.aiProviders.modelAudioSpeed'), { exact: true })
        .fill(String(speech.speed));
    if (speech.instructions)
      await dialog
        .getByLabel(label('settings.aiProviders.modelAudioInstructions'), { exact: true })
        .fill(speech.instructions);
  }
}

/** Configures exact model properties through the same form for live and local scenarios. */
export async function configureLiveModel(
  page: Page,
  connection: Pick<LiveConnection, 'providerId' | 'providerName' | 'settingsUrl'>,
  entry: LiveModel,
  operation: AIModelOperation,
  entryMode: 'catalog' | 'manual'
) {
  const models = page.getByRole('region', { name: 'Models', exact: true });
  await models.getByRole('button', { name: 'Add', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('button[aria-haspopup="listbox"]').first().click();
  await page.getByRole('option', { name: connection.providerName, exact: true }).click();
  if (entryMode === 'catalog') {
    const existing = await findModel(page, connection.providerId, entry.modelId);
    if (!existing) throw new Error('The selected live model is absent from this provider catalog.');
    await dialog.locator('.sniptale-ai-model-selector-trigger').click();
    await dialog.locator('.sniptale-dropdown-menu').getByRole('textbox').fill(entry.modelId);
    await dialog.getByRole('button', { name: existing.displayName, exact: true }).click();
  } else {
    await dialog
      .getByRole('button', { name: label('settings.aiProviders.modelManualEntry'), exact: true })
      .click();
    await dialog
      .getByPlaceholder(label('settings.aiProviders.modelNamePlaceholder'))
      .fill(entry.displayName);
    await dialog
      .getByPlaceholder(label('settings.aiProviders.modelCodePlaceholder'))
      .fill(entry.modelId);
    await configureManualCapabilities(page, dialog, operation);
  }
  await configureAudio(page, dialog, entry, operation);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** Configures the selected provider through product UI and returns only nonsensitive fixture identities. */
export async function setupLiveProvider(
  page: Page,
  extensionId: string,
  profile: LiveProfile,
  operation: AIModelOperation
): Promise<LiveConnection> {
  const entry = profile.models[operation];
  if (!entry) throw new Error('The selected profile does not declare this operation.');
  const connection = await addConnection(page, extensionId, profile);
  if (profile.management === 'manual' || entry.audio)
    await configureLiveModel(
      page,
      connection,
      entry,
      operation,
      profile.management === 'automatic' ? 'catalog' : 'manual'
    );
  const model = await findModel(page, connection.providerId, entry.modelId);
  if (!model) throw new Error('The selected live model is absent from this provider catalog.');
  return {
    ...connection,
    modelId: model.id,
    modelCode: model.modelCode,
    displayName: model.displayName,
  };
}
