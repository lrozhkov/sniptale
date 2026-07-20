import type { ReactNode } from 'react';
import type { AppLocale } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';
import type { DesignSystemRegistryEntry } from '../registry/types';
import {
  NOTE_ITEM_CLASS,
  PREVIEW_PANEL_CLASS,
  SECTION_LABEL_CLASS,
  SECTION_SURFACE_CLASS,
  STATUS_BADGE_CLASS,
} from './constants';
import { localize } from '../localization';

export function DesignSystemCatalogVariantsSection(props: {
  entry: DesignSystemRegistryEntry;
  locale: AppLocale;
  previewMap: Map<string, ReactNode>;
}) {
  return (
    <section className="space-y-4">
      <div className={SECTION_LABEL_CLASS}>
        {translate('designSystem.page.variantsTitle', props.locale)}
      </div>
      {props.entry.variants.map((variant) => (
        <DesignSystemCatalogVariantCard
          key={variant.variantId}
          componentId={props.entry.componentId}
          variant={variant}
          locale={props.locale}
          previewMap={props.previewMap}
        />
      ))}
    </section>
  );
}

function DesignSystemCatalogVariantCard(props: {
  componentId: string;
  variant: DesignSystemRegistryEntry['variants'][number];
  locale: AppLocale;
  previewMap: Map<string, ReactNode>;
}) {
  const previewKey = `${props.componentId}.${props.variant.variantId}`;
  const preview = props.previewMap.get(previewKey);

  if (!preview) {
    throw new Error(`Missing design-system preview for "${previewKey}".`);
  }

  return (
    <section className={SECTION_SURFACE_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-[var(--sniptale-color-text-primary-strong)]">
            {localize(props.locale, props.variant.labelRu, props.variant.labelEn)}
          </div>
          <div className="mt-1 text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
            {localize(props.locale, props.variant.descriptionRu, props.variant.descriptionEn)}
          </div>
        </div>
        <div className={STATUS_BADGE_CLASS}>{props.variant.variantId}</div>
      </div>

      <div className={PREVIEW_PANEL_CLASS}>{preview}</div>

      <DesignSystemVariantTechnicalNotes
        locale={props.locale}
        notes={
          props.locale === 'ru' ? props.variant.technicalNotesRu : props.variant.technicalNotesEn
        }
      />
    </section>
  );
}

function DesignSystemVariantTechnicalNotes(props: { locale: AppLocale; notes: string[] }) {
  return (
    <div className="mt-4">
      <div className={SECTION_LABEL_CLASS}>
        {translate('designSystem.page.technicalDetailsTitle', props.locale)}
      </div>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
        {props.notes.map((note) => (
          <li key={note} className={NOTE_ITEM_CLASS}>
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}
