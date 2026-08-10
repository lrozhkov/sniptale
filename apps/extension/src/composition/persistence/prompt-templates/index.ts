import type { PromptTemplate } from '../../../contracts/settings';
import type { AppLocale } from '../../../platform/i18n';
import { browserStorage } from '../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseStoredPromptTemplates, parseStoredTemplateOrder } from './guards';
import {
  createSystemPromptTemplateCatalog,
  isSystemPromptTemplateId,
  PROMPT_TEMPLATE_CATALOG_REVISION,
  mergePromptTemplateCatalog,
} from './catalog';

const PROMPT_TEMPLATES_KEY = 'sniptale_prompt_templates';
const TEMPLATE_ORDER_KEY = 'sniptale_template_order';
const logger = createLogger({ namespace: 'SharedPromptTemplatesStorage' });
let promptTemplateMutationQueue = Promise.resolve<void>(undefined);

/**
 * Инициализация хранилища шаблонов дефолтными значениями
 */
async function initializeDefaultTemplates(): Promise<PromptTemplate[]> {
  const defaultTemplates = createSystemPromptTemplateCatalog();
  await browserStorage.local.set({ [PROMPT_TEMPLATES_KEY]: defaultTemplates });
  logger.debug('Initialized default prompt templates', {
    templateCount: defaultTemplates.length,
  });
  return defaultTemplates;
}

function warnAboutInvalidStoredTemplates(invalidEntryCount: number, hasInvalidRoot: boolean): void {
  if (hasInvalidRoot) {
    logger.warn('Ignoring invalid prompt templates payload root from storage');
  }

  if (invalidEntryCount > 0) {
    logger.warn('Dropped invalid prompt templates from storage', {
      invalidEntryCount,
    });
  }
}

function warnAboutInvalidTemplateOrder(invalidEntryCount: number, hasInvalidRoot: boolean): void {
  if (hasInvalidRoot) {
    logger.warn('Ignoring invalid template order payload root from storage');
  }

  if (invalidEntryCount > 0) {
    logger.warn('Dropped invalid template order entries from storage', {
      invalidEntryCount,
    });
  }
}

function queuePromptTemplateMutation<T>(run: () => Promise<T>): Promise<T> {
  const nextMutation = promptTemplateMutationQueue.catch(() => undefined).then(run);
  promptTemplateMutationQueue = nextMutation.then(
    () => undefined,
    () => undefined
  );
  return nextMutation;
}

async function loadStoredPromptTemplates(): Promise<PromptTemplate[]> {
  const result = await browserStorage.local.get([PROMPT_TEMPLATES_KEY]);
  const parsedTemplates = parseStoredPromptTemplates(result[PROMPT_TEMPLATES_KEY]);

  warnAboutInvalidStoredTemplates(
    parsedTemplates.invalidEntryCount,
    parsedTemplates.hasInvalidRoot
  );

  return parsedTemplates.templates;
}

async function materializePromptTemplatesForMutation(): Promise<PromptTemplate[]> {
  const templates = await loadStoredPromptTemplates();
  return templates.length > 0
    ? mergePromptTemplateCatalog(templates)
    : initializeDefaultTemplates();
}

/**
 * Получение всех шаблонов промптов
 */
export async function getPromptTemplates(locale?: AppLocale): Promise<PromptTemplate[]> {
  const templates = await loadStoredPromptTemplates();
  return mergePromptTemplateCatalog(templates, locale);
}

/**
 * Сохранение шаблона (создание или обновление)
 */
export async function savePromptTemplate(template: PromptTemplate): Promise<PromptTemplate> {
  return queuePromptTemplateMutation(async () => {
    const templates = await materializePromptTemplatesForMutation();
    const index = templates.findIndex((current) => current.id === template.id);
    const nextTemplates = [...templates];
    const persistedTemplate = isSystemPromptTemplateId(template.id)
      ? {
          ...template,
          customized: true,
          enabled: template.enabled !== false,
          isDefault: true,
          systemRevision: PROMPT_TEMPLATE_CATALOG_REVISION,
        }
      : template;

    if (index >= 0) {
      nextTemplates[index] = persistedTemplate;
    } else {
      nextTemplates.push(persistedTemplate);
    }

    await browserStorage.local.set({ [PROMPT_TEMPLATES_KEY]: nextTemplates });
    logger.debug('Saved prompt template', {
      templateId: template.id,
    });
    return persistedTemplate;
  });
}

/** Restores a system template from the current localized catalog. */
export async function resetPromptTemplate(id: string, locale?: AppLocale): Promise<PromptTemplate> {
  return queuePromptTemplateMutation(async () => {
    if (!isSystemPromptTemplateId(id)) {
      throw new Error(`Prompt template ${id} is not a system template`);
    }

    const canonical = createSystemPromptTemplateCatalog(locale).find(
      (template) => template.id === id
    );
    if (!canonical) {
      throw new Error(`System prompt template ${id} is missing from the catalog`);
    }

    const templates = mergePromptTemplateCatalog(await loadStoredPromptTemplates(), locale);
    const index = templates.findIndex((template) => template.id === id);
    const current = templates[index];
    if (!current || index < 0) {
      throw new Error(`System prompt template ${id} is missing from the materialized catalog`);
    }

    const restored: PromptTemplate = {
      ...canonical,
      enabled: current.enabled !== false,
      ...(current.lastUsedAt === undefined ? {} : { lastUsedAt: current.lastUsedAt }),
    };
    const nextTemplates = [...templates];
    nextTemplates[index] = restored;
    await browserStorage.local.set({ [PROMPT_TEMPLATES_KEY]: nextTemplates });
    logger.debug('Reset system prompt template', { templateId: id });
    return restored;
  });
}

/** Deletes user-owned templates. System catalog entries are immutable. */
export async function deletePromptTemplate(id: string): Promise<void> {
  await queuePromptTemplateMutation(async () => {
    if (isSystemPromptTemplateId(id)) {
      throw new Error(`System prompt template ${id} cannot be deleted`);
    }
    const templates = await materializePromptTemplatesForMutation();
    const filtered = templates.filter((template) => template.id !== id);

    await browserStorage.local.set({ [PROMPT_TEMPLATES_KEY]: filtered });
    logger.debug('Deleted user prompt template', { templateId: id });
  });
}

/** Enables or disables a template without changing its customized state. */
export async function setPromptTemplateEnabled(
  id: string,
  enabled: boolean
): Promise<PromptTemplate> {
  return queuePromptTemplateMutation(async () => {
    const templates = await materializePromptTemplatesForMutation();
    const index = templates.findIndex((template) => template.id === id);
    const current = templates[index];
    if (!current || index < 0) {
      throw new Error(`Prompt template ${id} is missing from the materialized catalog`);
    }
    const updated = { ...current, enabled };
    const nextTemplates = [...templates];
    nextTemplates[index] = updated;
    await browserStorage.local.set({ [PROMPT_TEMPLATES_KEY]: nextTemplates });
    logger.debug('Updated prompt template availability', { enabled, templateId: id });
    return updated;
  });
}

export async function saveTemplateOrder(orderedIds: string[]): Promise<void> {
  try {
    await browserStorage.local.set({ [TEMPLATE_ORDER_KEY]: orderedIds });
  } catch (error) {
    // Template order is advisory-only: preserve local ordering and warn on storage failures.
    logger.warn('Failed to save template order', error);
  }
}

export async function loadTemplateOrder(): Promise<string[]> {
  try {
    const result = await browserStorage.local.get([TEMPLATE_ORDER_KEY]);
    const parsedOrder = parseStoredTemplateOrder(result[TEMPLATE_ORDER_KEY]);

    warnAboutInvalidTemplateOrder(parsedOrder.invalidEntryCount, parsedOrder.hasInvalidRoot);
    return parsedOrder.orderedIds;
  } catch {
    return [];
  }
}

/**
 * Обновление времени последнего использования шаблона
 */
export async function updateTemplateLastUsed(id: string): Promise<void> {
  await queuePromptTemplateMutation(async () => {
    const templates = await materializePromptTemplatesForMutation();
    const index = templates.findIndex((template) => template.id === id);

    if (index < 0) {
      return;
    }

    const nextTemplates = [...templates];
    const currentTemplate = nextTemplates[index];
    if (!currentTemplate) {
      return;
    }

    nextTemplates[index] = {
      ...currentTemplate,
      lastUsedAt: Date.now(),
    };
    await browserStorage.local.set({ [PROMPT_TEMPLATES_KEY]: nextTemplates });
  });
}
