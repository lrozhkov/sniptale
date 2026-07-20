import type { PromptTemplate } from '../../../contracts/settings';
import { browserStorage } from '../infrastructure/browser-storage';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseStoredPromptTemplates, parseStoredTemplateOrder } from './guards';

const PROMPT_TEMPLATES_KEY = 'sniptale_prompt_templates';
const TEMPLATE_ORDER_KEY = 'sniptale_template_order';
const logger = createLogger({ namespace: 'SharedPromptTemplatesStorage' });
let promptTemplateMutationQueue = Promise.resolve<void>(undefined);

const DEFAULT_TEMPLATE_IDS = {
  anonymize: 'default-anonymize',
  emoji: 'default-emoji',
  markup: 'default-markup',
  replaceNames: 'default-replace-names',
  style: 'default-style',
  translate: 'default-translate',
} as const;

// Дефолтные шаблоны для инициализации
function getDefaultTemplates(): PromptTemplate[] {
  return [
    {
      id: DEFAULT_TEMPLATE_IDS.replaceNames,
      name: translate('shared.defaults.templateReplaceNamesName'),
      content: translate('shared.defaults.templateReplaceNamesContent'),
      isDefault: true,
    },
    {
      id: DEFAULT_TEMPLATE_IDS.translate,
      name: translate('shared.defaults.templateTranslateName'),
      content: translate('shared.defaults.templateTranslateContent'),
      isDefault: true,
    },
    {
      id: DEFAULT_TEMPLATE_IDS.anonymize,
      name: translate('shared.defaults.templateAnonymizeName'),
      content: translate('shared.defaults.templateAnonymizeContent'),
      isDefault: true,
    },
    {
      id: DEFAULT_TEMPLATE_IDS.style,
      name: translate('shared.defaults.templateStyleName'),
      content: translate('shared.defaults.templateStyleContent'),
      isDefault: true,
    },
    {
      id: DEFAULT_TEMPLATE_IDS.emoji,
      name: translate('shared.defaults.templateEmojiName'),
      content: translate('shared.defaults.templateEmojiContent'),
      isDefault: true,
    },
    {
      id: DEFAULT_TEMPLATE_IDS.markup,
      name: translate('shared.defaults.templateMarkupName'),
      content: translate('shared.defaults.templateMarkupContent'),
      isDefault: true,
    },
  ];
}

/**
 * Инициализация хранилища шаблонов дефолтными значениями
 */
async function initializeDefaultTemplates(): Promise<PromptTemplate[]> {
  const defaultTemplates = getDefaultTemplates();
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

async function preparePromptTemplatesForMutation(): Promise<PromptTemplate[]> {
  const templates = await loadStoredPromptTemplates();
  if (templates.length > 0) {
    return templates;
  }

  return initializeDefaultTemplates();
}

/**
 * Получение всех шаблонов промптов
 */
export async function getPromptTemplates(): Promise<PromptTemplate[]> {
  const templates = await loadStoredPromptTemplates();
  return templates.length > 0 ? templates : getDefaultTemplates();
}

/**
 * Сохранение шаблона (создание или обновление)
 */
export async function savePromptTemplate(template: PromptTemplate): Promise<void> {
  await queuePromptTemplateMutation(async () => {
    const templates = await preparePromptTemplatesForMutation();
    const index = templates.findIndex((current) => current.id === template.id);
    const nextTemplates = [...templates];

    if (index >= 0) {
      nextTemplates[index] = template;
    } else {
      nextTemplates.push(template);
    }

    await browserStorage.local.set({ [PROMPT_TEMPLATES_KEY]: nextTemplates });
    logger.debug('Saved prompt template', {
      templateId: template.id,
    });
  });
}

/**
 * Удаление шаблона
 */
export async function deletePromptTemplate(id: string): Promise<void> {
  await queuePromptTemplateMutation(async () => {
    const templates = await preparePromptTemplatesForMutation();
    const filtered = templates.filter((template) => template.id !== id);

    await browserStorage.local.set({ [PROMPT_TEMPLATES_KEY]: filtered });
    logger.debug('Deleted prompt template', {
      templateId: id,
    });
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
    const templates = await preparePromptTemplatesForMutation();
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
