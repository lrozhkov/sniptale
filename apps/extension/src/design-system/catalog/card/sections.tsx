import type { AppLocale } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';
import type { DesignSystemRegistryEntry } from '../registry/types';
import {
  FILE_PILL_CLASS,
  PANEL_BADGE_CLASS,
  SECTION_LABEL_CLASS,
  SECTION_SURFACE_CLASS,
  SOURCE_FILE_PILL_CLASS,
  STATUS_BADGE_CLASS,
  USAGE_CARD_CLASS,
} from './constants';
import { localize } from '../localization';
export { DesignSystemCatalogVariantsSection } from './variants';

export function DesignSystemCatalogHeader(props: {
  entry: DesignSystemRegistryEntry;
  locale: AppLocale;
  scopeLabel: string;
}) {
  const statusLabel =
    props.entry.status === 'active'
      ? translate('designSystem.page.statusActive', props.locale)
      : translate('designSystem.page.statusPlanned', props.locale);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div
          className={
            'flex flex-wrap items-center gap-2 text-xs font-semibold uppercase ' +
            'tracking-[0.14em] text-[var(--sniptale-color-text-muted-strong)]'
          }
        >
          <span>{props.entry.kind}</span>
          <span
            className={
              'rounded-full border border-[var(--sniptale-color-border-soft)] ' +
              'px-2 py-0.5 normal-case tracking-normal'
            }
          >
            {props.scopeLabel}
          </span>
        </div>
        <h3 className="mt-2 text-xl font-semibold text-[var(--sniptale-color-text-primary-strong)]">
          {localize(props.locale, props.entry.labelRu, props.entry.labelEn)}
        </h3>
        <div className="mt-1 text-sm text-[var(--sniptale-color-text-secondary)]">
          {props.entry.componentId}
        </div>
      </div>
      <div className={STATUS_BADGE_CLASS}>{statusLabel}</div>
    </div>
  );
}

export function DesignSystemCatalogSummarySection(props: {
  entry: DesignSystemRegistryEntry;
  locale: AppLocale;
}) {
  const summary = localize(props.locale, props.entry.descriptionRu, props.entry.descriptionEn);

  return (
    <section className={SECTION_SURFACE_CLASS}>
      <div className={SECTION_LABEL_CLASS}>
        {translate('designSystem.page.componentSummaryTitle', props.locale)}
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
        {summary}
      </p>
      <div className="mt-4 text-sm text-[var(--sniptale-color-text-secondary)]">
        <div>
          <span className="font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('designSystem.page.sourceLabel', props.locale)}
          </span>{' '}
          {props.entry.source}
        </div>
      </div>
    </section>
  );
}

export function DesignSystemCatalogSourceFilesSection(props: {
  entry: DesignSystemRegistryEntry;
  locale: AppLocale;
}) {
  return (
    <section className={SECTION_SURFACE_CLASS}>
      <div className={SECTION_LABEL_CLASS}>
        {translate('designSystem.page.sourceFilesTitle', props.locale)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {props.entry.sourceFiles.map((sourceFile) => (
          <span key={sourceFile} className={SOURCE_FILE_PILL_CLASS}>
            {sourceFile}
          </span>
        ))}
      </div>
    </section>
  );
}

export function DesignSystemCatalogUsageSection(props: {
  entry: DesignSystemRegistryEntry;
  locale: AppLocale;
}) {
  return (
    <section className={SECTION_SURFACE_CLASS}>
      <div className={SECTION_LABEL_CLASS}>
        {translate('designSystem.page.usageExamplesTitle', props.locale)}
      </div>
      <div className="mt-3 space-y-3">
        {props.entry.usageContexts.map((usage) => (
          <div key={usage.usageId} className={USAGE_CARD_CLASS}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
                  {localize(props.locale, usage.labelRu, usage.labelEn)}
                </div>
                <div className="mt-1 font-mono text-xs text-[var(--sniptale-color-text-dim)]">
                  {usage.usageId}
                </div>
              </div>
              <div className={PANEL_BADGE_CLASS}>
                {usage.status === 'active'
                  ? translate('designSystem.page.statusActive', props.locale)
                  : translate('designSystem.page.statusPlanned', props.locale)}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {usage.files.map((file) => (
                <span key={file} className={FILE_PILL_CLASS}>
                  {file}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
