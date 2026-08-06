import type { PromptTemplate } from '../../../contracts/settings';
import { translate, type AppLocale } from '../../../platform/i18n';

export const PROMPT_TEMPLATE_CATALOG_REVISION = 1;

const SYSTEM_PROMPT_TEMPLATE_IDS = {
  anonymize: 'default-anonymize',
  emoji: 'default-emoji',
  markup: 'default-markup',
  replaceNames: 'default-replace-names',
  style: 'default-style',
  translate: 'default-translate',
} as const;

const SYSTEM_TEMPLATE_DEFINITIONS = [
  ['replaceNames', 'templateReplaceNamesName', 'templateReplaceNamesContent'],
  ['translate', 'templateTranslateName', 'templateTranslateContent'],
  ['anonymize', 'templateAnonymizeName', 'templateAnonymizeContent'],
  ['style', 'templateStyleName', 'templateStyleContent'],
  ['emoji', 'templateEmojiName', 'templateEmojiContent'],
  ['markup', 'templateMarkupName', 'templateMarkupContent'],
] as const;

type PromptTemplateFingerprint = Pick<PromptTemplate, 'content' | 'id' | 'name'>;

// Immutable revision-0 fingerprints. Keep old entries when canonical copy changes so
// revisionless defaults can still be distinguished from user-customized templates.
const LEGACY_SYSTEM_TEMPLATE_FINGERPRINTS: readonly PromptTemplateFingerprint[] = [
  {
    id: 'default-replace-names',
    name: 'Замена имён',
    content: 'Замени все имена на героев Властелина колец',
  },
  {
    id: 'default-replace-names',
    name: 'Replace names',
    content: 'Replace all names with Lord of the Rings characters',
  },
  {
    id: 'default-translate',
    name: 'Перевод',
    content: 'Переведи весь текст на английский язык',
  },
  {
    id: 'default-translate',
    name: 'Translate',
    content: 'Translate all text to English',
  },
  {
    id: 'default-anonymize',
    name: 'Анонимизация',
    content: 'Скрой все суммы и цены звёздочками (****)',
  },
  {
    id: 'default-anonymize',
    name: 'Anonymize',
    content: 'Hide all amounts and prices with asterisks (****)',
  },
  {
    id: 'default-style',
    name: 'Стиль',
    content: 'Перепиши весь текст в официальном деловом стиле',
  },
  {
    id: 'default-style',
    name: 'Style',
    content: 'Rewrite all text in a formal business style',
  },
  {
    id: 'default-emoji',
    name: 'Эмодзи',
    content: 'Добавь подходящие эмодзи в текст для оживления контента',
  },
  {
    id: 'default-emoji',
    name: 'Emoji',
    content: 'Add suitable emoji to make the content livelier',
  },
  {
    id: 'default-markup',
    name: 'Маркировка',
    content: 'Выдели ключевые слова жирным шрифтом, добавив markdown разметку',
  },
  {
    id: 'default-markup',
    name: 'Markup',
    content: 'Highlight keywords in bold using markdown markup',
  },
];

function createSystemTemplate(
  definition: (typeof SYSTEM_TEMPLATE_DEFINITIONS)[number],
  locale?: AppLocale
): PromptTemplate {
  const [idKey, nameKey, contentKey] = definition;
  return {
    content: translate(`shared.defaults.${contentKey}`, locale),
    customized: false,
    enabled: true,
    id: SYSTEM_PROMPT_TEMPLATE_IDS[idKey],
    isDefault: true,
    name: translate(`shared.defaults.${nameKey}`, locale),
    systemRevision: PROMPT_TEMPLATE_CATALOG_REVISION,
  };
}

export function createSystemPromptTemplateCatalog(locale?: AppLocale): PromptTemplate[] {
  return SYSTEM_TEMPLATE_DEFINITIONS.map((definition) => createSystemTemplate(definition, locale));
}

export function isSystemPromptTemplateId(id: string): boolean {
  return Object.values(SYSTEM_PROMPT_TEMPLATE_IDS).some((systemId) => systemId === id);
}

function matchesPromptTemplateFingerprint(
  template: PromptTemplate,
  fingerprints: readonly PromptTemplateFingerprint[]
): boolean {
  return fingerprints.some(
    (fingerprint) =>
      fingerprint.id === template.id &&
      fingerprint.name === template.name &&
      fingerprint.content === template.content
  );
}

export function mergePromptTemplateCatalogWithHistory(
  storedTemplates: PromptTemplate[],
  canonicalCatalog: PromptTemplate[],
  knownUntouchedFingerprints: readonly PromptTemplateFingerprint[],
  revision: number
): PromptTemplate[] {
  if (storedTemplates.length === 0) return canonicalCatalog;

  const storedById = new Map(storedTemplates.map((template) => [template.id, template]));
  const systemTemplates = canonicalCatalog.map((canonical) => {
    const stored = storedById.get(canonical.id);
    if (!stored) return { ...canonical, enabled: false };
    const customized =
      stored.customized ?? !matchesPromptTemplateFingerprint(stored, knownUntouchedFingerprints);
    return {
      ...(customized ? stored : canonical),
      customized,
      enabled: stored.enabled !== false,
      id: canonical.id,
      isDefault: true,
      systemRevision: revision,
      ...(stored.lastUsedAt === undefined ? {} : { lastUsedAt: stored.lastUsedAt }),
    };
  });
  const userTemplates = storedTemplates.filter(
    (template) => !isSystemPromptTemplateId(template.id)
  );
  return [...systemTemplates, ...userTemplates];
}

export function mergePromptTemplateCatalog(
  storedTemplates: PromptTemplate[],
  locale?: AppLocale
): PromptTemplate[] {
  const canonicalCatalog = createSystemPromptTemplateCatalog(locale);
  return mergePromptTemplateCatalogWithHistory(
    storedTemplates,
    canonicalCatalog,
    [...LEGACY_SYSTEM_TEMPLATE_FINGERPRINTS, ...canonicalCatalog],
    PROMPT_TEMPLATE_CATALOG_REVISION
  );
}
