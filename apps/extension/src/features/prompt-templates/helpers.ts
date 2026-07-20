import type { PromptTemplate } from '../../contracts/settings';
import { translate } from '../../platform/i18n';

export function getPromptTemplateErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : translate('content.runtime.unknownError');
}

export function sortPromptTemplates(templates: PromptTemplate[]): PromptTemplate[] {
  return [...templates].sort((left, right) => {
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
