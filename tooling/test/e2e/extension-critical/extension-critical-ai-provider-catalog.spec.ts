import type { Page } from '@playwright/test';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
} from '../../../../apps/extension/src/features/scenario/project/public';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '../support/extension-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';

// The real credential must never enter a trace, recording, screenshot, or assertion output.
test.use({ trace: 'off', video: 'off', screenshot: 'off', actionTimeout: 10000 });

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`real neuraldeep.ru setup and automatic catalog ${viewport.width}`, async ({
    page,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize(viewport);
    const url = `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=ai-connections`;
    await page.goto(url);
    const providers = page.getByRole('region', { name: /^(Providers|Провайдеры)$/u });
    await expect(providers).toBeVisible();
    // Fresh profiles hydrate the initial English preference after the first paint.
    await expect(providers).toHaveAttribute('aria-label', 'Providers');
    const locale = 'en';
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    await providers.getByRole('button', { name: label('common.actions.add'), exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByLabel(label('settings.aiProviders.providerTypeLabel'), { exact: true })
      .click();
    const options = page.getByRole('option');
    await expect(options.first()).toHaveText('OpenAI-compatible');
    const names = await options.allTextContents();
    expect(names.some((name) => name.trim() === 'neuraldeep.ru')).toBe(true);
    await page.getByRole('option', { name: 'neuraldeep.ru', exact: true }).click();
    await expect(dialog.locator('input[type="url"]')).toHaveValue('https://api.neuraldeep.ru/v1');
    await expect(dialog).toContainText(label('settings.aiProviders.providerAutomaticHint'));
    await dialog
      .getByLabel(label('settings.aiProviders.providerManagementLabel'), { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      dialog.getByLabel(label('settings.aiProviders.providerManagementLabel'), { exact: true })
    ).toBeInViewport();
    await page.screenshot({ path: info.outputPath('provider-form.png'), fullPage: false });
    const connectionName = `neuraldeep.ru ${viewport.width}`;
    await dialog
      .getByPlaceholder(label('settings.aiProviders.providerNamePlaceholder'), { exact: true })
      .fill(connectionName);
    await expect(dialog.locator('input[type="password"]')).toHaveCount(1);
    const credential = (
      await readFile(
        join(
          homedir(),
          '.config/sniptale-agent/sniptale-api-keys/neuraldeep/sniptale-agent-test.key'
        ),
        'utf8'
      )
    ).trim();
    await page.evaluate((value) => {
      const input = document.querySelector<HTMLInputElement>(
        '[role="dialog"] input[type="password"]'
      );
      if (!input) throw new Error('Credential control is unavailable');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, credential);
    await dialog.getByRole('button', { name: label('common.actions.add'), exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 45000 });
    const row = providers
      .locator('[data-settings-collection-item]')
      .filter({ hasText: connectionName });
    await expect(row).toContainText(label('settings.aiProviders.providerStatusCatalog'), {
      timeout: 15000,
    });
    const evidence = await page.evaluate(async (name) => {
      const state = await chrome.storage.local.get(['sniptale_ai_providers', 'sniptale_ai_models']);
      const records = state['sniptale_ai_providers'] as {
        id: string;
        name: string;
        connectionType: string;
        management: string;
        apiKey?: unknown;
      }[];
      const provider = records.find((entry) => entry.name === name);
      const models = state['sniptale_ai_models'] as { providerId: string; source: string }[];
      return {
        providerId: provider?.id,
        type: provider?.connectionType,
        management: provider?.management,
        plaintextStored: provider ? Object.hasOwn(provider, 'apiKey') : true,
        modelCount: models.filter(
          (model) => model.providerId === provider?.id && model.source === 'catalog'
        ).length,
      };
    }, connectionName);
    expect(evidence.type).toBe('neuraldeep');
    expect(evidence.management).toBe('automatic');
    expect(evidence.plaintextStored).toBe(false);
    expect(evidence.modelCount).toBeGreaterThan(0);
    const manualModels = page.getByRole('region', {
      name: label('settings.aiProviders.modelsTitle'),
      exact: true,
    });
    await expect(manualModels.locator('[data-settings-collection-item]')).toHaveCount(0);
    await expect(page.locator('[data-collection-inline-action="set-default"]')).toHaveCount(0);
    await row
      .getByRole('button', { name: label('settings.aiProviders.providerCheckAction'), exact: true })
      .click();
    await expect(
      row.getByRole('button', {
        name: label('settings.aiProviders.providerCheckPending'),
        exact: true,
      })
    ).toBeVisible();
    await expect(
      row.getByRole('button', {
        name: label('settings.aiProviders.providerCheckAction'),
        exact: true,
      })
    ).toBeEnabled({ timeout: 45000 });
    await expect(row).toContainText(label('settings.aiProviders.providerStatusCatalog'));
    await expect(row).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined))
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    });
    await page.screenshot({ path: info.outputPath('provider-connected.png'), fullPage: false });
    await page.reload();
    await expect(providers).toContainText(connectionName);
    if (viewport.width === 1280) {
      if (!evidence.providerId) throw new Error('Connected provider identity is unavailable');
      const model = await runRealScenarioText(
        page,
        extensionId,
        evidence.providerId,
        url,
        info.outputPath('scenario-ai-proposal.png')
      );
      await expect(row).toBeVisible();
      await row.getByRole('switch').click();
      await expect(row.getByRole('switch')).toBeChecked({ timeout: 45000 });
      await runRealPageText(
        page,
        extensionId,
        hostOrigin,
        model,
        info.outputPath('page-text-applied.png')
      );
    }
    if (viewport.width === 1920) {
      await runConcurrentProviderToggle(
        page,
        url,
        connectionName,
        info.outputPath('provider-concurrent-toggle.png')
      );
    }
    // Cleanup exercises the product confirmation and its sanctioned messaging transport.
    await row
      .getByRole('button', { name: label('settings.collection.actions.menu'), exact: true })
      .click();
    await row
      .getByRole('button', { name: label('settings.collection.actions.delete'), exact: true })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: label('common.actions.delete'), exact: true })
      .click();
    await expect(row).toHaveCount(0);
  });
}

test('real neuraldeep.ru rejects an invalid credential without losing the connection', async ({
  page,
  extensionId,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 560 });
  await page.goto(
    `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=ai-connections`
  );
  const providers = page.getByRole('region', { name: 'Providers', exact: true });
  await expect(providers).toBeVisible();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  await providers.getByRole('button', { name: label('common.actions.add'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(label('settings.aiProviders.providerTypeLabel'), { exact: true }).click();
  await page.getByRole('option', { name: 'neuraldeep.ru', exact: true }).click();
  const name = 'neuraldeep.ru invalid credential';
  await dialog
    .getByLabel(label('settings.aiProviders.providerNameLabel'), { exact: true })
    .fill(name);
  await dialog.locator('input[type="password"]').fill('sniptale-invalid-test-credential');
  await dialog.getByRole('button', { name: label('common.actions.add'), exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 45000 });
  const row = providers.locator('[data-settings-collection-item]').filter({ hasText: name });
  await expect(row).toContainText(label('settings.aiProviders.providerStatusInvalidKey'));
  await expect(row).not.toContainText(label('settings.aiProviders.providerStatusCatalog'));
  await page.reload();
  await expect(row).toContainText(label('settings.aiProviders.providerStatusInvalidKey'));
  await row
    .getByRole('button', { name: label('settings.collection.actions.menu'), exact: true })
    .click();
  await row
    .getByRole('button', { name: label('settings.collection.actions.delete'), exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: label('common.actions.delete'), exact: true })
    .click();
  await expect(row).toHaveCount(0);
});

async function runRealScenarioText(
  page: Page,
  extensionId: string,
  providerId: string,
  settingsUrl: string,
  screenshotPath: string
) {
  const model = await page.evaluate(async (providerId) => {
    const data = await chrome.storage.local.get('sniptale_ai_models');
    const models = data['sniptale_ai_models'] as {
      id: string;
      modelCode: string;
      providerId: string;
      displayName: string;
    }[];
    return models.find(
      (entry) => entry.providerId === providerId && entry.modelCode === 'qwen3.6-35b-a3b-noreason'
    );
  }, providerId);
  if (!model) throw new Error('The live text integration model is unavailable in the catalog');
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  const project = createGuideProject(
    'Provider integration proof',
    'provider-integration-proof',
    1000
  );
  const step = createGuideStep('Selected step', 'integration-step');
  step.blocks = [
    { kind: 'text', id: 'integration-text', paragraphs: createGuideParagraphs('Draft sentence.') },
  ];
  project.items = [step];
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
  const selectionBeforeOpen = await page.evaluate(
    async () =>
      (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
        'sniptale_ai_scenario_selections'
      ] ?? {}
  );
  const projectUrl =
    `chrome-extension://${extensionId}/apps/extension/src/scenario-editor/index.html` +
    `?projectId=${project.id}`;
  await page.goto(projectUrl);
  await expect(page.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
    project.name
  );
  await page.getByRole('button', { name: 'AI assistance', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const picker = dialog.locator('.sniptale-ai-model-selector-trigger');
  await expect(picker).toBeEnabled();
  const selectionAfterOpen = await page.evaluate(
    async () =>
      (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
        'sniptale_ai_scenario_selections'
      ] ?? {}
  );
  expect(selectionAfterOpen).toEqual(selectionBeforeOpen);
  await picker.click();
  await page
    .getByPlaceholder(translate('aiModal.modelSearchPlaceholder', 'en'), { exact: true })
    .fill(model.displayName);
  await page.getByTitle(model.displayName, { exact: true }).click();
  await expect(picker).toContainText(model.displayName);
  await dialog.locator('textarea').fill(
    'Replace the text with exactly: Integration text verified. Use only the setText operation for ' +
      'stepId integration-step and blockId integration-text. Return exactly this JSON structure: ' +
      JSON.stringify({
        operations: [
          {
            type: 'setText',
            stepId: 'integration-step',
            blockId: 'integration-text',
            text: 'Integration text verified.',
          },
        ],
      })
  );
  const responses: {
    status: number;
    path: string;
    responseBytes: number;
    json: boolean;
    choices: number;
  }[] = [];
  const collectResponse = async (response: import('@playwright/test').Response) => {
    const url = new URL(response.url());
    if (url.origin !== 'https://api.neuraldeep.ru' || !url.pathname.endsWith('/chat/completions'))
      return;
    const body = await response.text().catch(() => null);
    let json = false;
    let choices = 0;
    if (body !== null) {
      try {
        const value: unknown = JSON.parse(body);
        json = true;
        if (
          value !== null &&
          typeof value === 'object' &&
          'choices' in value &&
          Array.isArray(value.choices)
        )
          choices = value.choices.length;
      } catch {
        /* Retain only format metadata for the synthetic integration request. */
      }
    }
    responses.push({
      status: response.status(),
      path: url.pathname,
      responseBytes: body === null ? 0 : Buffer.byteLength(body),
      json,
      choices,
    });
  };
  page.context().on('response', collectResponse);
  await dialog.getByRole('button', { name: 'Get suggestions', exact: true }).click();
  try {
    await expect(dialog.getByRole('button', { name: 'Apply selected', exact: true })).toBeEnabled({
      timeout: 60000,
    });
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      screenshotPath.replace(/\.png$/u, '-response.json'),
      JSON.stringify(responses, null, 2)
    );
    throw error;
  } finally {
    page.context().off('response', collectResponse);
  }
  await expect(dialog).toContainText('Integration text verified.');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await dialog.getByRole('button', { name: 'Apply selected', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: translate('scenario.editor.body', 'en'), exact: true })
  ).toHaveValue('Integration text verified.');
  await expect(
    page.getByRole('button', {
      name: `${translate('editor.documentActions.autosaveTitle', 'en')}: ${translate('common.states.saved', 'en')}`,
      exact: true,
    })
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
    project.name
  );
  await expect(
    page.getByRole('textbox', { name: translate('scenario.editor.body', 'en'), exact: true })
  ).toHaveValue('Integration text verified.');
  await page.getByRole('button', { name: 'AI assistance', exact: true }).click();
  await expect(dialog.locator('.sniptale-ai-model-selector-trigger')).toContainText(
    model.displayName
  );
  const selections = await page.evaluate(async () => {
    const data = await chrome.storage.local.get('sniptale_ai_scenario_selections');
    const records = data['sniptale_ai_scenario_selections'] as Record<string, { modelId: string }>;
    return { scenarios: Object.keys(records), modelId: records['scenario-edit']?.modelId };
  });
  expect(selections.scenarios).toEqual(['scenario-edit']);
  expect(selections.modelId).toBe(model.id);
  await page.keyboard.press('Escape');
  await page.goto(settingsUrl);
  const row = page
    .locator('[data-settings-collection-item]')
    .filter({ hasText: 'neuraldeep.ru 1280' });
  await row.getByRole('switch').click();
  await expect(row.getByRole('switch')).not.toBeChecked();
  await page.goto(projectUrl);
  await expect(page.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
    project.name
  );
  await page.getByRole('button', { name: 'AI assistance', exact: true }).click();
  await expect(dialog).toContainText(translate('scenario.editor.guideAiModelUnavailable', 'en'));
  await expect(dialog.getByRole('button', { name: 'Get suggestions', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.goto(settingsUrl);
  return model;
}

async function runRealPageText(
  settings: Page,
  extensionId: string,
  hostOrigin: string,
  model: { id: string; displayName: string },
  screenshotPath: string
) {
  const before = await settings.evaluate(
    async () =>
      (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
        'sniptale_ai_scenario_selections'
      ]
  );
  const { page, popup } = await openDesignReview(settings.context(), extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  const ui = (name: string) => page.locator(`[data-ui="${name}"]`);
  try {
    await page.evaluate(() => {
      const text = document.createElement('p');
      text.id = 'live-page-text';
      text.textContent = 'Original synthetic page text';
      text.style.cssText =
        'position:absolute;left:32px;top:90px;background:white;color:black;padding:8px;font:20px Georgia;z-index:1';
      (document.querySelector('main') ?? document.body).append(text);
    });
    await ui('content.toolbar.mode-selector-button').click();
    await ui('content.toolbar.mode-option.quick-edit').click();
    await ui('content.toolbar.ai-text').click();
    const source = page.locator('#live-page-text');
    await source.click();
    const popover = ui('content.ai-text.popover');
    await expect(popover).toBeVisible();
    expect(
      await settings.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
            'sniptale_ai_scenario_selections'
          ]
      )
    ).toEqual(before);
    const selector = popover.locator('.sniptale-ai-model-selector-trigger');
    await selector.click();
    await page
      .getByPlaceholder(translate('aiModal.modelSearchPlaceholder', 'en'), { exact: true })
      .fill(model.displayName);
    await page.getByTitle(model.displayName, { exact: true }).click();
    await expect(selector).toContainText(model.displayName);
    await expect(ui('content.ai-text.submit')).toBeDisabled();
    await ui('content.ai-text.prompt').fill(
      'Return exactly these four words and nothing else: Revised synthetic page text'
    );
    await ui('content.ai-text.submit').click();
    await expect(source).toHaveText('Revised synthetic page text', { timeout: 60000 });
    await expect(popover).toHaveCount(0);
    const remembered = await settings.evaluate(
      async () =>
        (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
          'sniptale_ai_scenario_selections'
        ]
    );
    expect(remembered).toEqual(
      expect.objectContaining({
        'page-edit': expect.objectContaining({ modelId: model.id }),
        'scenario-edit': expect.objectContaining({ modelId: model.id }),
      })
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.keyboard.press('Control+z');
    await expect(source).toHaveText('Original synthetic page text');
    await source.click();
    await expect(popover.locator('.sniptale-ai-model-selector-trigger')).toContainText(
      model.displayName
    );
    expect(
      await settings.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
            'sniptale_ai_scenario_selections'
          ]
      )
    ).toEqual(remembered);
    await page.keyboard.press('Escape');
    await runRealPageExtraction(
      settings,
      page,
      model,
      screenshotPath.replace('page-text-applied', 'page-extract-applied')
    );
  } finally {
    await page.close();
    await popup.close();
  }
}

async function runConcurrentProviderToggle(
  page: Page,
  settingsUrl: string,
  connectionName: string,
  screenshotPath: string
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  const renamed = `${connectionName} renamed in another window`;
  const other = await page.context().newPage();
  await other.setViewportSize({ width: 1920, height: 900 });
  try {
    await other.goto(settingsUrl);
    const otherRow = other
      .locator('[data-settings-collection-item]')
      .filter({ hasText: connectionName });
    await otherRow
      .getByRole('button', { name: label('settings.collection.actions.edit'), exact: true })
      .click();
    const dialog = other.getByRole('dialog');
    await dialog
      .getByPlaceholder(label('settings.aiProviders.providerNamePlaceholder'), { exact: true })
      .fill(renamed);
    await dialog.getByRole('button', { name: label('common.actions.save'), exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(otherRow).toContainText(renamed);
    const staleRow = page
      .locator('[data-settings-collection-item]')
      .filter({ hasText: connectionName });
    await expect(staleRow).not.toContainText(renamed);
    await staleRow.getByRole('switch').click();
    await expect(staleRow.getByRole('switch')).not.toBeChecked();
    await expect(staleRow).toContainText(renamed);
    await staleRow.getByRole('switch').click();
    await expect(staleRow.getByRole('switch')).toBeChecked({ timeout: 45000 });
    await expect(staleRow).toContainText(label('settings.aiProviders.providerStatusCatalog'));
    await page.screenshot({ path: screenshotPath, fullPage: false });
  } finally {
    await other.close();
  }
}

async function runRealPageExtraction(
  settings: Page,
  page: Page,
  model: { id: string; displayName: string },
  screenshotPath: string
) {
  const original = 'Original synthetic page text';
  const before = await settings.evaluate(
    async () =>
      (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
        'sniptale_ai_scenario_selections'
      ]
  );
  await page.locator('[data-ui="content.toolbar.page-editing-mode.ai"]').click();
  const modal = page.locator('.sniptale-ai-modal-root');
  await expect(modal).toBeVisible();
  expect(
    await settings.evaluate(
      async () =>
        (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
          'sniptale_ai_scenario_selections'
        ]
    )
  ).toEqual(before);
  await modal.locator('.sniptale-ai-model-selector-trigger').click();
  await page
    .getByPlaceholder(translate('aiModal.modelSearchPlaceholder', 'en'), { exact: true })
    .fill(model.displayName);
  await page.getByTitle(model.displayName, { exact: true }).click();
  await page.screenshot({ path: screenshotPath.replace('applied', 'prepared'), fullPage: false });
  await modal
    .locator('.sniptale-tree-row-field')
    .filter({ hasText: original })
    .getByRole('checkbox')
    .check();
  const previewToggle = modal.locator('.sniptale-ai-data-preview-toggle');
  if ((await previewToggle.getAttribute('aria-pressed')) !== 'true') await previewToggle.click();
  const payload: unknown = JSON.parse(await modal.locator('.sniptale-json-preview').innerText());
  if (!payload || typeof payload !== 'object' || !('f' in payload) || !Array.isArray(payload.f))
    throw new Error('Synthetic extraction payload has no fields');
  const field: unknown = payload.f.find(
    (entry: unknown) => entry && typeof entry === 'object' && 'c' in entry && entry.c === original
  );
  if (!field || typeof field !== 'object') throw new Error('Synthetic extraction field is absent');
  const response = { i: '', f: [{ ...field, new: 'Updated synthetic extraction field' }], t: [] };
  await page
    .locator('#ai-prompt')
    .fill(
      'Return exactly this JSON object with no prose or code fences: ' + JSON.stringify(response)
    );
  const submit = modal.getByRole('button', {
    name: translate('aiModal.submitShortcutTitle', 'en'),
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('#live-page-text')).toHaveText('Updated synthetic extraction field', {
    timeout: 60000,
  });
  await expect(modal).toHaveCount(0);
  const after = await settings.evaluate(
    async () =>
      (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
        'sniptale_ai_scenario_selections'
      ]
  );
  expect(after).toEqual(
    expect.objectContaining({
      ...before,
      'page-extract': expect.objectContaining({ modelId: model.id }),
    })
  );
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.keyboard.press('Control+z');
  await expect(page.locator('#live-page-text')).toHaveText(original);
  await page.locator('[data-ui="content.toolbar.page-editing-mode.ai"]').click();
  await expect(modal.locator('.sniptale-ai-model-selector-trigger')).toContainText(
    model.displayName
  );
  expect(
    await settings.evaluate(
      async () =>
        (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
          'sniptale_ai_scenario_selections'
        ]
    )
  ).toEqual(after);
  await modal
    .getByRole('button', { name: translate('aiModal.closeTitle', 'en'), exact: true })
    .click();
  await settings.bringToFront();
  const enabled = settings
    .getByRole('region', { name: 'Providers', exact: true })
    .getByRole('switch');
  await enabled.click();
  await expect(enabled).not.toBeChecked();
  await page.bringToFront();
  await page.locator('[data-ui="content.toolbar.page-editing-mode.ai"]').click();
  await expect(
    modal.getByText(translate('aiModal.modelSelectionUnavailable', 'en'), { exact: true })
  ).toBeVisible();
  await expect(
    modal.getByRole('button', { name: translate('aiModal.submitShortcutTitle', 'en'), exact: true })
  ).toBeDisabled();
  expect(
    await settings.evaluate(
      async () =>
        (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
          'sniptale_ai_scenario_selections'
        ]
    )
  ).toEqual(after);
  await page.screenshot({
    path: screenshotPath.replace('applied', 'unavailable'),
    fullPage: false,
  });
  await modal
    .getByRole('button', { name: translate('aiModal.closeTitle', 'en'), exact: true })
    .click();
}
