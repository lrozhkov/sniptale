import { describe, expect, it } from 'vitest';

import type { PromptTemplate } from '../../contracts/settings';
import {
  createPromptTemplateDraft,
  requirePromptTemplateUpdate,
  sortPromptTemplates,
  touchPromptTemplateSelection,
  updatePromptTemplateList,
} from './helpers';

function createTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: overrides.id ?? 'template-1',
    name: overrides.name ?? 'Template',
    content: overrides.content ?? 'Content',
    ...(overrides.enabled === undefined ? {} : { enabled: overrides.enabled }),
    ...(overrides.isDefault === undefined
      ? { isDefault: false }
      : { isDefault: overrides.isDefault }),
    ...(overrides.lastUsedAt === undefined ? {} : { lastUsedAt: overrides.lastUsedAt }),
  };
}

function verifySortPromptTemplates() {
  const sortedTemplates = sortPromptTemplates([
    createTemplate({ id: 'plain' }),
    createTemplate({ id: 'default', isDefault: true }),
    createTemplate({ id: 'recent', lastUsedAt: 200 }),
    createTemplate({ id: 'older', lastUsedAt: 100 }),
  ]);

  expect(sortedTemplates.map((template) => template.id)).toEqual([
    'recent',
    'older',
    'default',
    'plain',
  ]);
}

function verifyDisabledTemplatesSortLast() {
  const sortedTemplates = sortPromptTemplates([
    createTemplate({ id: 'disabled-first', enabled: false, lastUsedAt: 500 }),
    createTemplate({ id: 'enabled-last' }),
    createTemplate({ id: 'disabled-last', enabled: false }),
  ]);

  expect(sortedTemplates.map((template) => template.id)).toEqual([
    'enabled-last',
    'disabled-first',
    'disabled-last',
  ]);
}

function verifyPromptTemplateDraftHelpers() {
  const newTemplate = createPromptTemplateDraft({
    id: 'new-id',
    name: 'New template',
    content: 'Template content',
  });

  expect(newTemplate).toEqual({
    id: 'new-id',
    name: 'New template',
    content: 'Template content',
    isDefault: false,
  });

  const updatedTemplate = requirePromptTemplateUpdate(
    [createTemplate({ id: 'new-id', name: 'Old name' })],
    'new-id',
    { name: 'Updated name' }
  );

  expect(updatedTemplate.name).toBe('Updated name');
  expect(
    updatePromptTemplateList(
      [createTemplate({ id: 'new-id', name: 'Old name' }), createTemplate({ id: 'keep' })],
      updatedTemplate
    ).map((template) => template.name)
  ).toEqual(['Updated name', 'Template']);
}

function verifyPromptTemplateSelectionTouch() {
  const selectedTemplate = createTemplate({ id: 'selected' });
  const updatedTemplates = touchPromptTemplateSelection(
    [createTemplate({ id: 'other', lastUsedAt: 10 }), selectedTemplate],
    selectedTemplate,
    50
  );

  expect(updatedTemplates.map((template) => template.id)).toEqual(['selected', 'other']);
  expect(updatedTemplates[0]?.lastUsedAt).toBe(50);
}

describe('prompt-templates state helpers', () => {
  it(
    'sorts last-used templates ahead of defaults and ordinary templates',
    verifySortPromptTemplates
  );
  it('sorts disabled system templates after enabled templates', verifyDisabledTemplatesSortLast);
  it(
    'creates and updates prompt-template drafts through pure helpers',
    verifyPromptTemplateDraftHelpers
  );
  it(
    'touches selected templates and re-sorts the list by last use',
    verifyPromptTemplateSelectionTouch
  );
});
