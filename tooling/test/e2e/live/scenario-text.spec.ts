import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
} from '../../../../apps/extension/src/features/scenario/project/public';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { test, expect } from './live-fixture';
import { getLiveProfile } from './configuration';
import { setupLiveProvider, type LiveConnection } from './provider-ui';

const profile = getLiveProfile();
const acceptedText = 'Integration text verified.';
const bodyLabel = translate('scenario.editor.body', 'en');

test('Scenario text proposal Apply autosave reload and contextual selection', async ({
  page,
  extensionId,
}) => {
  test.skip(!profile.models.text, 'Selected profile does not declare text');
  test.setTimeout(180_000);
  const connection = await setupLiveProvider(page, extensionId, profile, 'text');
  const project = await seedTextProject(page, extensionId);
  const before = await contextualSelections(page);
  await page.goto(project.url);
  await expect(page.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
    project.name
  );
  await selectTextModel(page, connection, before);
  await applyTextProposal(page);
  await proveSavedText(page, project.name, connection, before);
  await page.keyboard.press('Escape');
  await page.goto(connection.settingsUrl);
  await expect(
    page.locator(`[data-settings-collection-item="${connection.providerId}"]`)
  ).toContainText(translate('settings.aiProviders.providerStatusOperation', 'en'));
});

async function seedTextProject(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  const project = createGuideProject('Live text integration proof', randomUUID(), 1000);
  const step = createGuideStep('Selected step', 'integration-step');
  step.blocks = [
    { kind: 'text', id: 'integration-text', paragraphs: createGuideParagraphs('Draft sentence.') },
  ];
  project.items = [step];
  await page.evaluate(async (project) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Live project database could not open'));
    });
    try {
      const tx = db.transaction('scenario_projects', 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Live project could not be seeded'));
        tx.onabort = () => reject(new Error('Live project seed was aborted'));
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
  return {
    name: project.name,
    url: `chrome-extension://${extensionId}/apps/extension/src/scenario-editor/index.html?projectId=${project.id}`,
  };
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

async function selectTextModel(
  page: Page,
  connection: LiveConnection,
  before: Record<string, string>
) {
  await page.getByRole('button', { name: 'AI assistance', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const picker = dialog.locator('.sniptale-ai-model-selector-trigger');
  await expect(picker).toBeEnabled();
  expect(await contextualSelections(page)).toEqual(before);
  await picker.click();
  await page
    .getByPlaceholder(translate('aiModal.modelSearchPlaceholder', 'en'), { exact: true })
    .fill(connection.displayName);
  await page.getByTitle(connection.displayName, { exact: true }).click();
  await expect(picker).toContainText(connection.displayName);
}

async function applyTextProposal(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.locator('textarea').fill(
    'Replace the text with exactly: Integration text verified. Use only the setText operation ' +
      'for stepId integration-step and blockId integration-text. Return exactly this JSON: ' +
      JSON.stringify({
        operations: [
          {
            type: 'setText',
            stepId: 'integration-step',
            blockId: 'integration-text',
            text: acceptedText,
          },
        ],
      })
  );
  await dialog.getByRole('button', { name: 'Get suggestions', exact: true }).click();
  const apply = dialog.getByRole('button', { name: 'Apply selected', exact: true });
  await expect(apply).toBeEnabled({ timeout: 90_000 });
  await expect(dialog).toContainText(acceptedText);
  await apply.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: bodyLabel, exact: true })).toHaveValue(
    acceptedText
  );
}

async function proveSavedText(
  page: Page,
  projectName: string,
  connection: LiveConnection,
  before: Record<string, string>
) {
  await expect(
    page.getByRole('button', {
      name: `${translate('editor.documentActions.autosaveTitle', 'en')}: ${translate('common.states.saved', 'en')}`,
      exact: true,
    })
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
    projectName
  );
  await expect(page.getByRole('textbox', { name: bodyLabel, exact: true })).toHaveValue(
    acceptedText
  );
  await page.getByRole('button', { name: 'AI assistance', exact: true }).click();
  await expect(
    page.getByRole('dialog').locator('.sniptale-ai-model-selector-trigger')
  ).toContainText(connection.displayName);
  expect(await contextualSelections(page)).toEqual({
    ...before,
    'scenario-edit': connection.modelId,
  });
}
