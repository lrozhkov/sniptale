import type { PromptTemplate } from '../../contracts/settings';
import type { AppLocale } from '../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  deletePromptTemplate,
  getPromptTemplates,
  loadTemplateOrder,
  resetPromptTemplate,
  savePromptTemplate,
  saveTemplateOrder,
  setPromptTemplateEnabled,
  updateTemplateLastUsed,
} from '../../composition/persistence/prompt-templates';
import {
  applyPromptTemplateOrder,
  createPromptTemplateDraft,
  requirePromptTemplateUpdate,
  sortPromptTemplates,
} from './helpers';

const logger = createLogger({ namespace: 'PromptTemplates' });

export type PromptTemplateCreationDeps = {
  createId: () => string;
};

function getDefaultPromptTemplateCreationDeps(): PromptTemplateCreationDeps {
  return {
    createId: () => crypto.randomUUID(),
  };
}

export async function loadPromptTemplateList(locale?: AppLocale): Promise<PromptTemplate[]> {
  try {
    const [loadedTemplates, orderedIds] = await Promise.all([
      getPromptTemplates(locale),
      loadTemplateOrder(),
    ]);
    return applyPromptTemplateOrder(sortPromptTemplates(loadedTemplates), orderedIds);
  } catch (error) {
    logger.error('Failed to load prompt templates', error);
    throw error;
  }
}

export async function savePromptTemplateOrder(templates: readonly PromptTemplate[]): Promise<void> {
  await saveTemplateOrder(templates.map((template) => template.id));
}

export async function createPromptTemplateRecord(
  name: string,
  content: string,
  deps: PromptTemplateCreationDeps = getDefaultPromptTemplateCreationDeps()
): Promise<PromptTemplate> {
  try {
    const newTemplate = createPromptTemplateDraft({
      id: deps.createId(),
      name,
      content,
    });

    await savePromptTemplate(newTemplate);
    return newTemplate;
  } catch (error) {
    logger.error('Failed to add prompt template', error);
    throw error;
  }
}

export async function savePromptTemplatePatch(
  templates: PromptTemplate[],
  id: string,
  patch: Partial<PromptTemplate>
): Promise<PromptTemplate> {
  try {
    const updatedTemplate = requirePromptTemplateUpdate(templates, id, patch);

    return await savePromptTemplate(updatedTemplate);
  } catch (error) {
    logger.error('Failed to update prompt template', error);
    throw error;
  }
}

export async function deletePromptTemplateRecord(id: string): Promise<void> {
  try {
    await deletePromptTemplate(id);
  } catch (error) {
    logger.error('Failed to delete prompt template', error);
    throw error;
  }
}

export async function setPromptTemplateEnabledRecord(
  id: string,
  enabled: boolean
): Promise<PromptTemplate> {
  try {
    return await setPromptTemplateEnabled(id, enabled);
  } catch (error) {
    logger.error('Failed to update prompt template availability', error);
    throw error;
  }
}

export async function resetPromptTemplateRecord(
  id: string,
  locale?: AppLocale
): Promise<PromptTemplate> {
  try {
    return await resetPromptTemplate(id, locale);
  } catch (error) {
    logger.error('Failed to reset prompt template', error);
    throw error;
  }
}

export async function touchPromptTemplateRecord(
  template: PromptTemplate,
  now: () => number = Date.now
): Promise<{ content: string; lastUsedAt: number }> {
  try {
    const lastUsedAt = now();
    await updateTemplateLastUsed(template.id);
    return { content: template.content, lastUsedAt };
  } catch (error) {
    logger.error('Failed to select prompt template', error);
    throw error;
  }
}
