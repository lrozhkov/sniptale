import type { ReactNode } from 'react';
import type { AppLocale } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';
import type { DesignSystemRegistryEntry } from '../../catalog/registry/types';
import { DesignSystemCatalogEntryDetails, getDesignSystemScopeLabel } from '../../catalog/card';
import { localize } from '../../catalog/localization';
import { CatalogSectionState, ResultBadge } from './primitives';

const SECTION_CLASS =
  'rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)] p-5';

const SUMMARY_ROW_CLASS =
  'w-full rounded-[14px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_58%,transparent)] px-4 py-3 ' +
  'text-left transition hover:border-[var(--sniptale-color-border-strong)]';

const ACTIVE_SUMMARY_ROW_CLASS =
  'border-[var(--sniptale-color-border-accent-strong)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_18%,var(--sniptale-color-surface-panel)_82%)]';

const SUMMARY_META_CLASS =
  'rounded-full border border-[var(--sniptale-color-border-soft)] px-2 py-0.5 text-xs ' +
  'font-semibold uppercase tracking-[0.12em] text-[var(--sniptale-color-text-secondary)]';

export function DesignSystemCatalogExplorerSection(props: {
  sectionId: string;
  title: string;
  description: string;
  entries: DesignSystemRegistryEntry[];
  expandedEntryId: string | null;
  locale: AppLocale;
  onSelectEntry: (componentId: string) => void;
  previewMap: Map<string, ReactNode>;
}) {
  return (
    <section id={props.sectionId} className={SECTION_CLASS + ' scroll-mt-36'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div
            className={[
              'text-xs font-semibold uppercase tracking-[0.14em]',
              'text-[var(--sniptale-color-text-muted-strong)]',
            ].join(' ')}
          >
            {props.title}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
            {props.description}
          </p>
        </div>
        <ResultBadge
          label={translate('designSystem.page.resultsLabel', props.locale)}
          value={props.entries.length}
        />
      </div>

      <CatalogSectionState
        entries={props.entries}
        locale={props.locale}
        previewMap={props.previewMap}
        renderEntry={(entry) => (
          <DesignSystemCatalogExplorerEntry
            key={entry.componentId}
            entry={entry}
            expanded={props.expandedEntryId === entry.componentId}
            locale={props.locale}
            onSelect={props.onSelectEntry}
            previewMap={props.previewMap}
          />
        )}
      />
    </section>
  );
}

function DesignSystemCatalogExplorerEntry(props: {
  entry: DesignSystemRegistryEntry;
  expanded: boolean;
  locale: AppLocale;
  onSelect: (componentId: string) => void;
  previewMap: Map<string, ReactNode>;
}) {
  const summaryClassName = [SUMMARY_ROW_CLASS, props.expanded ? ACTIVE_SUMMARY_ROW_CLASS : '']
    .filter(Boolean)
    .join(' ');

  return (
    <article className="space-y-3">
      <button
        type="button"
        className={summaryClassName}
        aria-expanded={props.expanded}
        aria-label={translate('designSystem.page.openEntryDetails', props.locale)}
        onClick={() => props.onSelect(props.entry.componentId)}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <DesignSystemEntryIdentity entry={props.entry} locale={props.locale} />
          <DesignSystemEntryMeta entry={props.entry} locale={props.locale} />
        </div>
      </button>

      {props.expanded ? (
        <div
          className={
            'rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
            'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)] p-4'
          }
        >
          <DesignSystemCatalogEntryDetails
            entry={props.entry}
            locale={props.locale}
            previewMap={props.previewMap}
          />
        </div>
      ) : null}
    </article>
  );
}

function DesignSystemEntryIdentity(props: { entry: DesignSystemRegistryEntry; locale: AppLocale }) {
  return (
    <div>
      <div className="text-base font-semibold text-[var(--sniptale-color-text-primary-strong)]">
        {localize(props.locale, props.entry.labelRu, props.entry.labelEn)}
      </div>
      <div className="mt-1 font-mono text-xs text-[var(--sniptale-color-text-dim)]">
        {props.entry.componentId}
      </div>
    </div>
  );
}

function DesignSystemEntryMeta(props: { entry: DesignSystemRegistryEntry; locale: AppLocale }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className={SUMMARY_META_CLASS}>{props.entry.kind}</span>
      <span className={SUMMARY_META_CLASS}>
        {getDesignSystemScopeLabel(props.locale, props.entry.scope)}
      </span>
      <span className={SUMMARY_META_CLASS}>
        {translate('designSystem.page.variantsCountLabel', props.locale)}{' '}
        {props.entry.variants.length}
      </span>
      <span className={SUMMARY_META_CLASS}>
        {translate('designSystem.page.usageCountLabel', props.locale)}{' '}
        {props.entry.usageContexts.length}
      </span>
    </div>
  );
}
