import type { PromptTemplate } from '../../../contracts/settings';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';

interface ParsedPromptTemplatesStorageValue {
  hasInvalidRoot: boolean;
  invalidEntryCount: number;
  templates: PromptTemplate[];
}

interface ParsedTemplateOrderStorageValue {
  hasInvalidRoot: boolean;
  invalidEntryCount: number;
  orderedIds: string[];
}

function isPromptTemplate(value: unknown): value is PromptTemplate {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['name']) &&
    isString(value['content']) &&
    (value['isDefault'] === undefined || isBoolean(value['isDefault'])) &&
    (value['lastUsedAt'] === undefined || isNumber(value['lastUsedAt']))
  );
}

export function parseStoredPromptTemplates(value: unknown): ParsedPromptTemplatesStorageValue {
  if (value === undefined) {
    return { templates: [], hasInvalidRoot: false, invalidEntryCount: 0 };
  }

  if (!Array.isArray(value)) {
    return { templates: [], hasInvalidRoot: true, invalidEntryCount: 0 };
  }

  const templates = value.filter(isPromptTemplate);
  return {
    templates,
    hasInvalidRoot: false,
    invalidEntryCount: value.length - templates.length,
  };
}

export function parseStoredTemplateOrder(value: unknown): ParsedTemplateOrderStorageValue {
  if (value === undefined) {
    return { orderedIds: [], hasInvalidRoot: false, invalidEntryCount: 0 };
  }

  if (!Array.isArray(value)) {
    return { orderedIds: [], hasInvalidRoot: true, invalidEntryCount: 0 };
  }

  const orderedIds = value.filter(isString);
  return {
    orderedIds,
    hasInvalidRoot: false,
    invalidEntryCount: value.length - orderedIds.length,
  };
}
