import type { PromptTemplate } from '../../contracts/settings';
import { translate } from '../../platform/i18n';

export function getPromptTemplateErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : translate('content.runtime.unknownError');
}

export function sortPromptTemplates(templates: PromptTemplate[]): PromptTemplate[] {
  return [...templates].sort((left, right) => {
    if (left.enabled === false && right.enabled !== false) return 1;
    if (left.enabled !== false && right.enabled === false) return -1;
    if (left.lastUsedAt && right.lastUsedAt) {
      return right.lastUsedAt - left.lastUsedAt;
    }
    if (left.lastUsedAt) {
      return -1;
    }
    if (right.lastUsedAt) {
      return 1;
    }
    if (left.isDefault && !right.isDefault) {
      return -1;
    }
    if (!left.isDefault && right.isDefault) {
      return 1;
    }
    return 0;
  });
}

export function applyPromptTemplateOrder(
  templates: PromptTemplate[],
  orderedIds: readonly string[]
): PromptTemplate[] {
  const byId = new Map(templates.map((template) => [template.id, template]));
  const ordered = orderedIds.flatMap((id) => {
    const template = byId.get(id);
    if (!template) return [];
    byId.delete(id);
    return [template];
  });
  return [...ordered, ...templates.filter((template) => byId.has(template.id))];
}

export function movePromptTemplateBefore(
  templates: PromptTemplate[],
  itemId: string,
  beforeItemId: string | null
): PromptTemplate[] {
  const item = templates.find((template) => template.id === itemId);
  if (!item || beforeItemId === itemId) return templates;
  const next = templates.filter((template) => template.id !== itemId);
  const targetIndex =
    beforeItemId === null
      ? next.length
      : next.findIndex((template) => template.id === beforeItemId);
  if (targetIndex < 0) return templates;
  next.splice(targetIndex, 0, item);
  return next.every((template, index) => template.id === templates[index]?.id) ? templates : next;
}

export function createPromptTemplateDraft(args: {
  id: string;
  name: string;
  content: string;
}): PromptTemplate {
  return {
    id: args.id,
    name: args.name,
    content: args.content,
    isDefault: false,
  };
}

export function requirePromptTemplateUpdate(
  templates: PromptTemplate[],
  id: string,
  patch: Partial<PromptTemplate>
): PromptTemplate {
  const existingTemplate = templates.find((template) => template.id === id);
  if (!existingTemplate) {
    throw new Error(translate('content.runtime.templateNotFound'));
  }

  return {
    ...existingTemplate,
    ...patch,
  };
}

export function updatePromptTemplateList(
  templates: PromptTemplate[],
  nextTemplate: PromptTemplate
): PromptTemplate[] {
  return templates.map((template) => (template.id === nextTemplate.id ? nextTemplate : template));
}

export function touchPromptTemplateSelection(
  templates: PromptTemplate[],
  selectedTemplate: PromptTemplate,
  lastUsedAt: number
): PromptTemplate[] {
  const updatedTemplates = templates.map((template) =>
    template.id === selectedTemplate.id ? { ...template, lastUsedAt } : template
  );

  return sortPromptTemplates(updatedTemplates);
}
