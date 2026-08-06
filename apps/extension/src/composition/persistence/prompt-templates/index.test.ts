import { beforeEach, describe, expect, it, vi } from 'vitest';

const { browserStorageLocalGetMock, browserStorageLocalSetMock } = vi.hoisted(() => ({
  browserStorageLocalGetMock: vi.fn(),
  browserStorageLocalSetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', (_importOriginal) => ({
  browserStorage: {
    local: {
      get: browserStorageLocalGetMock,
      set: browserStorageLocalSetMock,
    },
  },
}));

import type { PromptTemplate } from '../../../contracts/settings';
import {
  createSystemPromptTemplateCatalog,
  mergePromptTemplateCatalogWithHistory,
  PROMPT_TEMPLATE_CATALOG_REVISION,
} from './catalog';
import {
  deletePromptTemplate,
  getPromptTemplates,
  loadTemplateOrder,
  savePromptTemplate,
  saveTemplateOrder,
  updateTemplateLastUsed,
} from './index';

function createTemplate(id: string, name = `Template ${id}`): PromptTemplate {
  return {
    id,
    name,
    content: `Content ${id}`,
  };
}

function storedPromptTemplates(value: unknown) {
  return { sniptale_prompt_templates: value };
}

function resetPromptTemplateStorageMocks() {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(Date, 'now').mockReturnValue(7000);
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalSetMock.mockResolvedValue(undefined);
}

async function verifyDefaultInitialization() {
  const templates = await getPromptTemplates();

  const expectedTemplates = createSystemPromptTemplateCatalog();

  expect(browserStorageLocalSetMock).not.toHaveBeenCalled();
  expect(templates).toEqual(expectedTemplates);
}

async function verifyDefaultTemplateIdsStayStableAcrossReads() {
  const firstRead = await getPromptTemplates();
  const secondRead = await getPromptTemplates();

  expect(firstRead.map((template) => template.id)).toEqual(
    secondRead.map((template) => template.id)
  );
}

async function verifyMutationsMaterializeDefaultsWhenStorageIsEmpty() {
  await savePromptTemplate(createTemplate('t-1'));

  expect(browserStorageLocalSetMock).toHaveBeenCalledTimes(2);
  expect(browserStorageLocalSetMock).toHaveBeenNthCalledWith(1, {
    sniptale_prompt_templates: expect.arrayContaining([
      expect.objectContaining({
        id: 'default-replace-names',
        isDefault: true,
      }),
    ]),
  });
  expect(browserStorageLocalSetMock).toHaveBeenNthCalledWith(2, {
    sniptale_prompt_templates: expect.arrayContaining([createTemplate('t-1')]),
  });
}

async function verifyTemplateReadWriteAndDeleteFlow() {
  browserStorageLocalGetMock
    .mockResolvedValueOnce(storedPromptTemplates([createTemplate('t-1'), createTemplate('t-2')]))
    .mockResolvedValueOnce(storedPromptTemplates([createTemplate('t-1'), createTemplate('t-2')]))
    .mockResolvedValueOnce(storedPromptTemplates([createTemplate('t-1'), createTemplate('t-2')]))
    .mockResolvedValueOnce(storedPromptTemplates([createTemplate('t-1'), createTemplate('t-2')]));

  const loadedTemplates = await getPromptTemplates();
  expect(loadedTemplates.filter((template) => !template.isDefault)).toEqual([
    createTemplate('t-1'),
    createTemplate('t-2'),
  ]);
  expect(loadedTemplates.filter((template) => template.isDefault)).toHaveLength(6);

  await savePromptTemplate({
    id: 't-2',
    name: 'Updated template',
    content: 'Updated content',
  });
  await savePromptTemplate(createTemplate('t-3'));
  await deletePromptTemplate('t-1');

  const persistedUsers = (callIndex: number) =>
    browserStorageLocalSetMock.mock.calls[callIndex]?.[0].sniptale_prompt_templates.filter(
      (template: PromptTemplate) => !template.isDefault
    );
  expect(persistedUsers(0)).toEqual([
    createTemplate('t-1'),
    { id: 't-2', name: 'Updated template', content: 'Updated content' },
  ]);
  expect(persistedUsers(1)).toEqual([
    createTemplate('t-1'),
    createTemplate('t-2'),
    createTemplate('t-3'),
  ]);
  expect(persistedUsers(2)).toEqual([createTemplate('t-2')]);
}

async function verifyTemplateOrderContracts() {
  await saveTemplateOrder(['t-2', 't-1']);

  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    sniptale_template_order: ['t-2', 't-1'],
  });

  browserStorageLocalGetMock.mockResolvedValueOnce({
    sniptale_template_order: ['t-3', 't-1'],
  });
  await expect(loadTemplateOrder()).resolves.toEqual(['t-3', 't-1']);

  const error = new Error('set failed');
  browserStorageLocalSetMock.mockRejectedValueOnce(error);

  await expect(saveTemplateOrder(['t-4'])).resolves.toBeUndefined();
  expect(console.warn).toHaveBeenCalledWith(
    '[SharedPromptTemplatesStorage]',
    'Failed to save template order',
    expect.objectContaining({ message: error.message })
  );

  browserStorageLocalGetMock.mockRejectedValueOnce(new Error('get failed'));
  await expect(loadTemplateOrder()).resolves.toEqual([]);
}

async function verifyInvalidStoredValuesAreDropped() {
  browserStorageLocalGetMock
    .mockResolvedValueOnce({
      sniptale_prompt_templates: [createTemplate('t-1'), { id: 'broken', name: 'Broken template' }],
    })
    .mockResolvedValueOnce({
      sniptale_template_order: ['t-2', 3, 't-1'],
    });

  const templates = await getPromptTemplates();
  expect(templates.filter((template) => !template.isDefault)).toEqual([createTemplate('t-1')]);
  await expect(loadTemplateOrder()).resolves.toEqual(['t-2', 't-1']);

  expect(console.warn).toHaveBeenNthCalledWith(
    1,
    '[SharedPromptTemplatesStorage]',
    'Dropped invalid prompt templates from storage',
    { invalidEntryCount: 1 }
  );
  expect(console.warn).toHaveBeenNthCalledWith(
    2,
    '[SharedPromptTemplatesStorage]',
    'Dropped invalid template order entries from storage',
    { invalidEntryCount: 1 }
  );
}

async function verifyLastUsedUpdate() {
  browserStorageLocalGetMock.mockResolvedValueOnce(
    storedPromptTemplates([createTemplate('t-1'), createTemplate('t-2')])
  );

  await updateTemplateLastUsed('t-2');

  const persisted = browserStorageLocalSetMock.mock.calls[0]?.[0].sniptale_prompt_templates;
  expect(persisted.filter((template: PromptTemplate) => !template.isDefault)).toEqual([
    createTemplate('t-1'),
    { ...createTemplate('t-2'), lastUsedAt: 7000 },
  ]);

  browserStorageLocalGetMock.mockResolvedValueOnce(storedPromptTemplates([createTemplate('t-1')]));

  await updateTemplateLastUsed('missing');

  expect(browserStorageLocalSetMock).toHaveBeenCalledTimes(1);
}

async function verifyConcurrentTemplateMutationsAreSerialized() {
  let storedTemplates = [createTemplate('t-1')];
  browserStorageLocalGetMock.mockImplementation(async (keys: string[]) => ({
    sniptale_prompt_templates: keys.includes('sniptale_prompt_templates')
      ? storedTemplates
      : undefined,
  }));
  browserStorageLocalSetMock.mockImplementation(async (payload) => {
    if (payload.sniptale_prompt_templates) {
      storedTemplates = payload.sniptale_prompt_templates;
    }
  });

  await Promise.all([savePromptTemplate(createTemplate('t-2')), deletePromptTemplate('t-1')]);

  expect(storedTemplates.filter((template) => !template.isDefault)).toEqual([
    createTemplate('t-2'),
  ]);
}

async function verifySystemTemplateMigrationAndToggle() {
  const legacy = createSystemPromptTemplateCatalog('en')[0]!;
  browserStorageLocalGetMock.mockResolvedValueOnce(storedPromptTemplates([legacy]));
  const migrated = await getPromptTemplates();
  expect(migrated[0]).toMatchObject({
    customized: false,
    enabled: true,
    systemRevision: PROMPT_TEMPLATE_CATALOG_REVISION,
  });

  browserStorageLocalGetMock.mockResolvedValueOnce(storedPromptTemplates(migrated));
  await deletePromptTemplate(legacy.id);
  expect(
    browserStorageLocalSetMock.mock.calls
      .at(-1)?.[0]
      .sniptale_prompt_templates.find((template: PromptTemplate) => template.id === legacy.id)
  ).toMatchObject({ enabled: false, isDefault: true });
}

async function verifyCustomizedSystemTemplateSurvivesMigration() {
  const canonical = createSystemPromptTemplateCatalog('en')[0]!;
  const customized: PromptTemplate = {
    id: canonical.id,
    isDefault: true,
    name: canonical.name,
    content: 'My custom instruction',
  };
  browserStorageLocalGetMock.mockResolvedValueOnce(storedPromptTemplates([customized]));
  const loaded = await getPromptTemplates();
  expect(loaded[0]).toMatchObject({ content: 'My custom instruction', customized: true });
}

function verifyRevisionlessDefaultsUseHistoricalFingerprints() {
  const current = createSystemPromptTemplateCatalog('en')[0]!;
  const {
    customized: _customized,
    enabled: _enabled,
    systemRevision: _systemRevision,
    ...legacy
  } = current;
  const nextCanonical = {
    ...legacy,
    content: 'Replace names with fictional characters',
    systemRevision: 2,
  };
  const migrated = mergePromptTemplateCatalogWithHistory([legacy], [nextCanonical], [legacy], 2);
  const customized = mergePromptTemplateCatalogWithHistory(
    [{ ...legacy, content: 'Use my private naming policy' }],
    [nextCanonical],
    [legacy],
    2
  );

  expect(migrated[0]).toMatchObject({
    content: nextCanonical.content,
    customized: false,
    systemRevision: 2,
  });
  expect(customized[0]).toMatchObject({
    content: 'Use my private naming policy',
    customized: true,
    systemRevision: 2,
  });
}

async function verifyInvalidRootFallsBackToDefaults() {
  browserStorageLocalGetMock.mockResolvedValueOnce(storedPromptTemplates({ broken: true }));

  const templates = await getPromptTemplates();

  expect(templates).toHaveLength(6);
  expect(console.warn).toHaveBeenCalledWith(
    '[SharedPromptTemplatesStorage]',
    'Ignoring invalid prompt templates payload root from storage'
  );
}

describe('prompt-templates', () => {
  beforeEach(resetPromptTemplateStorageMocks);

  it(
    'returns default templates without writing them when the storage is empty',
    verifyDefaultInitialization
  );
  it(
    'keeps default template ids stable across repeated reads',
    verifyDefaultTemplateIdsStayStableAcrossReads
  );
  it(
    'materializes defaults only when a mutation needs persisted templates',
    verifyMutationsMaterializeDefaultsWhenStorageIsEmpty
  );
  it('reads, updates, appends, and deletes prompt templates', verifyTemplateReadWriteAndDeleteFlow);
  it(
    'saves and loads template order with graceful fallback on storage failures',
    verifyTemplateOrderContracts
  );
  it(
    'drops invalid prompt template and ordering entries from storage',
    verifyInvalidStoredValuesAreDropped
  );
  it('updates lastUsedAt only for existing templates', verifyLastUsedUpdate);
  it(
    'serializes concurrent prompt-template mutations',
    verifyConcurrentTemplateMutationsAreSerialized
  );
  it(
    'falls back to defaults when the prompt templates root payload is invalid',
    verifyInvalidRootFallsBackToDefaults
  );
  it(
    'migrates localized system templates and toggles them instead of deleting',
    verifySystemTemplateMigrationAndToggle
  );
  it(
    'preserves customized system templates during catalog migration',
    verifyCustomizedSystemTemplateSurvivesMigration
  );
  it(
    'updates revisionless defaults through historical fingerprints without overwriting custom copy',
    verifyRevisionlessDefaultsUseHistoricalFingerprints
  );
});
