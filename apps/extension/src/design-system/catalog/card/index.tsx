import type { ReactNode } from 'react';
import type { AppLocale } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';
import type { DesignSystemRegistryEntry } from '../registry/types';
import {
  DesignSystemCatalogHeader,
  DesignSystemCatalogSourceFilesSection,
  DesignSystemCatalogSummarySection,
  DesignSystemCatalogUsageSection,
  DesignSystemCatalogVariantsSection,
} from './sections';

interface DesignSystemCatalogCardProps {
  entry: DesignSystemRegistryEntry;
  locale: AppLocale;
  previewMap: Map<string, ReactNode>;
}

const CARD_SURFACE_CLASS =
  'rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)] ' +
  'p-5 shadow-sm';

export function getDesignSystemScopeLabel(
  locale: AppLocale,
  scope: DesignSystemRegistryEntry['scope']
): string {
  return scope === 'shared-ui'
    ? translate('designSystem.page.scopeSharedLabel', locale)
    : translate('designSystem.page.scopeProductLabel', locale);
}

export function DesignSystemCatalogCard({
  entry,
  locale,
  previewMap,
}: DesignSystemCatalogCardProps) {
  const scopeLabel = getDesignSystemScopeLabel(locale, entry.scope);

  return (
    <article className={CARD_SURFACE_CLASS}>
      <DesignSystemCatalogHeader entry={entry} locale={locale} scopeLabel={scopeLabel} />
      <DesignSystemCatalogEntryDetails entry={entry} locale={locale} previewMap={previewMap} />
    </article>
  );
}

export function DesignSystemCatalogEntryDetails({
  entry,
  locale,
  previewMap,
}: DesignSystemCatalogCardProps) {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
      <div className="space-y-4">
        <DesignSystemCatalogSummarySection entry={entry} locale={locale} />
        <DesignSystemCatalogSourceFilesSection entry={entry} locale={locale} />
        <DesignSystemCatalogUsageSection entry={entry} locale={locale} />
      </div>

      <DesignSystemCatalogVariantsSection entry={entry} locale={locale} previewMap={previewMap} />
    </div>
  );
}
