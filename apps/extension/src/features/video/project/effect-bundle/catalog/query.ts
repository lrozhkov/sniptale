import { parseEffectV1Source, type EffectV1Kind } from '@sniptale/runtime-contracts/effect-v1';
import type { EffectBundleCatalogDocumentEntry, EffectBundleCatalogEntry } from './index';

export interface EffectCatalogFilter {
  query: string;
  kind: 'all' | EffectV1Kind;
  theme: 'all' | 'light' | 'dark' | 'unspecified';
}
export function describeCatalogDocument(
  document: EffectBundleCatalogDocumentEntry,
  locale: 'en' | 'ru'
) {
  const parsed = parseEffectV1Source(document.source).document;
  // The SDK collection explicitly names theme variants with these suffixes; other IDs are unclassified.
  const variant = /(?:[._-])(light|dark)$/.exec(document.id)?.[1];
  const theme = variant === 'light' || variant === 'dark' ? variant : 'unspecified';
  const label = parsed?.label[locale] ?? parsed?.label.en ?? document.id;
  return {
    label:
      theme === 'unspecified'
        ? label
        : label.replace(/\s*·\s*(?:Dark|Light|Тёмная|Темная|Светлая)$/iu, ''),
    description: parsed?.description?.[locale] ?? parsed?.description?.en ?? '',
    theme,
  };
}
export function queryEffectCatalog(
  catalog: EffectBundleCatalogEntry,
  filter: EffectCatalogFilter,
  locale: 'en' | 'ru'
) {
  const query = filter.query.trim().toLocaleLowerCase(locale);
  return catalog.documents.filter((document) => {
    const metadata = describeCatalogDocument(document, locale);
    return (
      (filter.kind === 'all' || document.kind === filter.kind) &&
      (filter.theme === 'all' || metadata.theme === filter.theme) &&
      [catalog.label[locale], document.id, metadata.label, metadata.description].some((value) =>
        value.toLocaleLowerCase(locale).includes(query)
      )
    );
  });
}

export function getEffectCatalogThemes(
  catalogs: readonly EffectBundleCatalogEntry[]
): Exclude<EffectCatalogFilter['theme'], 'all'>[] {
  const present = new Set(
    catalogs.flatMap((catalog) =>
      catalog.documents.map((document) => describeCatalogDocument(document, 'en').theme)
    )
  );
  return (['light', 'dark', 'unspecified'] as const).filter((theme) => present.has(theme));
}
