import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PromptTemplate } from '../../contracts/settings';

const mocks = vi.hoisted(() => ({
  deletePromptTemplateMock: vi.fn(),
  getPromptTemplatesMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  savePromptTemplateMock: vi.fn(),
  updateTemplateLastUsedMock: vi.fn(),
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    child: vi.fn(),
    debug: vi.fn(),
    error: mocks.loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../composition/persistence/prompt-templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/prompt-templates')>()),
  deletePromptTemplate: mocks.deletePromptTemplateMock,
  getPromptTemplates: mocks.getPromptTemplatesMock,
  savePromptTemplate: mocks.savePromptTemplateMock,
  updateTemplateLastUsed: mocks.updateTemplateLastUsedMock,
}));

function createTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    content: overrides.content ?? 'Prompt body',
    id: overrides.id ?? 'template-1',
    name: overrides.name ?? 'Template',
    ...(overrides.isDefault === undefined
      ? { isDefault: false }
      : { isDefault: overrides.isDefault }),
    ...(overrides.lastUsedAt === undefined ? {} : { lastUsedAt: overrides.lastUsedAt }),
  };
}

async function importPromptTemplateService() {
  vi.resetModules();
  return import('./service');
}

beforeEach(() => {
  mocks.deletePromptTemplateMock.mockReset();
  mocks.getPromptTemplatesMock.mockReset();
  mocks.loggerErrorMock.mockReset();
  mocks.savePromptTemplateMock.mockReset();
  mocks.updateTemplateLastUsedMock.mockReset();
  mocks.getPromptTemplatesMock.mockResolvedValue([]);
  mocks.savePromptTemplateMock.mockResolvedValue(undefined);
  mocks.deletePromptTemplateMock.mockResolvedValue(undefined);
  mocks.updateTemplateLastUsedMock.mockResolvedValue(undefined);
});

describe('prompt-template service loading', () => {
  it('loads and sorts prompt templates from shared storage', async () => {
    const service = await importPromptTemplateService();
    mocks.getPromptTemplatesMock.mockResolvedValue([
      createTemplate({ id: 'plain' }),
      createTemplate({ id: 'recent', lastUsedAt: 200 }),
      createTemplate({ id: 'default', isDefault: true }),
    ]);

    const templates = await service.loadPromptTemplateList();

    expect(templates.map((template) => template.id)).toEqual(['recent', 'default', 'plain']);
  });

  it('logs and rethrows load failures', async () => {
    const service = await importPromptTemplateService();
    const failure = new Error('load failed');
    mocks.getPromptTemplatesMock.mockRejectedValue(failure);

    await expect(service.loadPromptTemplateList()).rejects.toBe(failure);

    expect(mocks.loggerErrorMock).toHaveBeenCalledWith('Failed to load prompt templates', failure);
  });
});

describe('prompt-template service creation', () => {
  it('creates new templates using injected ids', async () => {
    const service = await importPromptTemplateService();

    const template = await service.createPromptTemplateRecord('New template', 'New content', {
      createId: () => 'created-id',
    });

    expect(template).toEqual({
      content: 'New content',
      id: 'created-id',
      isDefault: false,
      name: 'New template',
    });
    expect(mocks.savePromptTemplateMock).toHaveBeenCalledWith(template);
  });

  it('creates ids through crypto.randomUUID when no creation deps are provided', async () => {
    const service = await importPromptTemplateService();
    const randomUUID = vi.fn(() => 'crypto-id');
    vi.stubGlobal('crypto', { randomUUID });

    await service.createPromptTemplateRecord('Generated', 'Body');

    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(mocks.savePromptTemplateMock).toHaveBeenCalledWith({
      content: 'Body',
      id: 'crypto-id',
      isDefault: false,
      name: 'Generated',
    });
  });
});

describe('prompt-template service storage mutations', () => {
  it('updates templates through storage', async () => {
    const service = await importPromptTemplateService();
    const templates = [
      createTemplate({ id: 'selected', name: 'Old name' }),
      createTemplate({ id: 'other', lastUsedAt: 10 }),
    ];

    const updatedTemplate = await service.savePromptTemplatePatch(templates, 'selected', {
      name: 'Updated name',
    });
    expect(updatedTemplate.name).toBe('Updated name');
    expect(mocks.savePromptTemplateMock).toHaveBeenCalledWith(updatedTemplate);
  });

  it('deletes and touches templates through storage', async () => {
    const service = await importPromptTemplateService();
    const updatedTemplate = createTemplate({ id: 'selected', name: 'Updated name' });

    const selection = await service.touchPromptTemplateRecord(updatedTemplate, () => 500);
    expect(selection).toEqual({ content: 'Prompt body', lastUsedAt: 500 });
    expect(mocks.updateTemplateLastUsedMock).toHaveBeenCalledWith('selected');

    await service.deletePromptTemplateRecord('other');
    expect(mocks.deletePromptTemplateMock).toHaveBeenCalledWith('other');
  });
});

describe('prompt-template service mutation failures', () => {
  it('logs and rethrows create, update, delete, and touch failures', async () => {
    const service = await importPromptTemplateService();
    const templates = [createTemplate()];
    const addFailure = new Error('add failed');
    mocks.savePromptTemplateMock.mockRejectedValueOnce(addFailure);

    await expect(service.createPromptTemplateRecord('Broken', 'Body')).rejects.toBe(addFailure);
    expect(mocks.loggerErrorMock).toHaveBeenCalledWith('Failed to add prompt template', addFailure);

    const updateFailure = new Error('save failed');
    mocks.savePromptTemplateMock.mockRejectedValueOnce(updateFailure);
    await expect(
      service.savePromptTemplatePatch(templates, 'template-1', { name: 'Broken' })
    ).rejects.toBe(updateFailure);
    expect(mocks.loggerErrorMock).toHaveBeenCalledWith(
      'Failed to update prompt template',
      updateFailure
    );

    const removeFailure = new Error('remove failed');
    mocks.deletePromptTemplateMock.mockRejectedValueOnce(removeFailure);
    await expect(service.deletePromptTemplateRecord('template-1')).rejects.toBe(removeFailure);
    expect(mocks.loggerErrorMock).toHaveBeenCalledWith(
      'Failed to delete prompt template',
      removeFailure
    );

    const selectFailure = new Error('select failed');
    mocks.updateTemplateLastUsedMock.mockRejectedValueOnce(selectFailure);
    await expect(service.touchPromptTemplateRecord(templates[0]!)).rejects.toBe(selectFailure);
    expect(mocks.loggerErrorMock).toHaveBeenCalledWith(
      'Failed to select prompt template',
      selectFailure
    );
  });
});
