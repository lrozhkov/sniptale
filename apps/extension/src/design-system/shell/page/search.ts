import type { AppLocale } from '../../../platform/i18n';
import type { DesignSystemRegistryEntry } from '../../catalog/registry/types';
import { DESIGN_SYSTEM_REGISTRY } from '../../catalog/registry';
import { localize } from '../../catalog/localization';
import type { DesignSystemPageFilters } from './filters';

export function filterDesignSystemEntries(
  locale: AppLocale,
  filters: DesignSystemPageFilters,
  normalizedQuery: string
): DesignSystemRegistryEntry[] {
  return DESIGN_SYSTEM_REGISTRY.filter((entry) => {
    if (filters.scopeFilter !== 'all' && entry.scope !== filters.scopeFilter) {
      return false;
    }

    if (filters.kindFilter !== 'all' && entry.kind !== filters.kindFilter) {
      return false;
    }

    if (filters.selectedUsageIds.length > 0 && !matchesUsageFilters(entry, filters)) {
      return false;
    }

    if (normalizedQuery === '') {
      return true;
    }

    return buildSearchableFields(locale, entry).some((field) =>
      field.toLowerCase().includes(normalizedQuery)
    );
  });
}

function matchesUsageFilters(
  entry: DesignSystemRegistryEntry,
  filters: DesignSystemPageFilters
): boolean {
  const usageIds = entry.usageContexts.map((usage) => usage.usageId);

  return filters.usageFilterMode === 'all'
    ? filters.selectedUsageIds.every((usageId) => usageIds.includes(usageId))
    : filters.selectedUsageIds.some((usageId) => usageIds.includes(usageId));
}

function buildSearchableFields(locale: AppLocale, entry: DesignSystemRegistryEntry): string[] {
  return [
    entry.componentId,
    localize(locale, entry.labelRu, entry.labelEn),
    localize(locale, entry.descriptionRu, entry.descriptionEn),
    entry.source,
    ...entry.sourceFiles,
    ...entry.variants.flatMap((variant) => [
      variant.variantId,
      localize(locale, variant.labelRu, variant.labelEn),
      localize(locale, variant.descriptionRu, variant.descriptionEn),
      ...(locale === 'ru' ? variant.technicalNotesRu : variant.technicalNotesEn),
    ]),
    ...entry.usageContexts.flatMap((usage) => [
      usage.usageId,
      localize(locale, usage.labelRu, usage.labelEn),
      ...usage.files,
    ]),
  ];
}
