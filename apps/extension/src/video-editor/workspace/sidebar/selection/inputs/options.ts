import type { TranslationKey } from '../../../../../platform/i18n';
import { translate } from '../../../../../platform/i18n';
import type { TemplateVocabularyDefinition } from '../../../../../features/video/project/template/vocabulary';
import type { GlassSelectOption } from '../../../../../ui/glass-select';

interface TemplateCatalogDefinition<TValue extends string> {
  descriptionKey: TranslationKey;
  groupLabelKey: TranslationKey;
  labelKey: TranslationKey;
  templateKind: TValue;
}

export function buildVocabularySelectOptions<TValue extends string>(
  definitions: readonly TemplateVocabularyDefinition<TValue>[]
): GlassSelectOption<TValue>[] {
  return definitions.map((definition) => ({
    value: definition.value,
    label: translate(definition.labelKey),
  }));
}

export function buildTemplateCatalogOptions<TValue extends string>(
  values: readonly TValue[],
  getDefinition: (value: TValue) => TemplateCatalogDefinition<TValue>
): GlassSelectOption<TValue>[] {
  return values.map((value) => {
    const definition = getDefinition(value);

    return {
      description: translate(definition.descriptionKey),
      groupLabel: translate(definition.groupLabelKey),
      label: translate(definition.labelKey),
      value,
    };
  });
}

export function getSelectedOptionLabel<TValue extends string>(
  options: readonly GlassSelectOption<TValue>[],
  value: TValue
) {
  return options.find((option) => option.value === value)?.label ?? value;
}
