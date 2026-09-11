import { readCatalogPresentation } from './presentation';
import { type EffectV1Kind } from '@sniptale/runtime-contracts/effect-v1';
import type { EffectBundleCatalogDocumentEntry, EffectBundleCatalogEntry } from './index';

export interface EffectCatalogFilter {
  query: string;
  kind: 'all' | EffectV1Kind;
  theme: string;
}
export interface EffectCatalogTheme {
  value: string;
  label: string;
  description?: string;
}
export function describeCatalogDocument(
  document: EffectBundleCatalogDocumentEntry,
  locale: 'en' | 'ru'
) {
  const parsed = readCatalogPresentation(document);
  const preset = parsed?.controlPresets?.find(
    (item) =>
      item.id ===
      (document.previewPresetId?.startsWith('user:')
        ? parsed.defaultControlPresetId
        : (document.previewPresetId ?? parsed.defaultControlPresetId))
  );
  const userPreset = document.presetPreferences?.presets.find(
    (item) => `user:${item.id}` === document.previewPresetId
  );
  return {
    label: parsed?.label[locale] ?? parsed?.label.en ?? document.id,
    description: parsed?.description?.[locale] ?? parsed?.description?.en ?? '',
    theme: preset ? `theme:${preset.theme.id}` : 'unspecified',
    style: preset
      ? `style:${preset.theme.id}:${userPreset ? `user-${userPreset.id}` : preset.style.id}`
      : userPreset
        ? `style:user:${userPreset.id}`
        : 'unspecified',
    themeLabel: preset?.theme.label[locale] ?? preset?.theme.label.en ?? '',
    styleLabel: userPreset?.name ?? preset?.style.label[locale] ?? preset?.style.label.en ?? '',
  };
}
export function queryEffectCatalog(
  catalog: EffectBundleCatalogEntry,
  filter: EffectCatalogFilter,
  locale: 'en' | 'ru'
) {
  const query = filter.query.trim().toLocaleLowerCase(locale);
  return catalog.documents
    .flatMap((document) => {
      const presets = readCatalogPresentation(document)?.controlPresets;
      const variants = presets?.length
        ? presets.map((preset) => ({ ...document, previewPresetId: preset.id }))
        : [document];
      variants.push(
        ...(document.presetPreferences?.presets ?? []).map((preset) => ({
          ...document,
          previewPresetId: `user:${preset.id}`,
        }))
      );
      const choice = document.presetPreferences?.defaultPreset;
      const defaultId = choice ? `${choice.kind === 'user' ? 'user:' : ''}${choice.id}` : undefined;
      return defaultId
        ? variants.sort(
            (a, b) =>
              Number(b.previewPresetId === defaultId) - Number(a.previewPresetId === defaultId)
          )
        : variants;
    })
    .filter((document) => {
      const metadata = describeCatalogDocument(document, locale);
      return (
        (filter.kind === 'all' || document.kind === filter.kind) &&
        (filter.theme === 'all' ||
          metadata.theme === filter.theme ||
          metadata.style === filter.theme) &&
        [
          catalog.label[locale],
          document.id,
          metadata.label,
          metadata.description,
          metadata.themeLabel,
          metadata.styleLabel,
        ].some((value) => value.toLocaleLowerCase(locale).includes(query))
      );
    });
}
export function getEffectCatalogThemes(
  catalogs: readonly EffectBundleCatalogEntry[],
  locale: 'en' | 'ru' = 'en'
): EffectCatalogTheme[] {
  const groups = new Map<string, { label: string; styles: Map<string, string> }>();
  for (const catalog of catalogs)
    for (const document of queryEffectCatalog(
      catalog,
      { query: '', kind: 'all', theme: 'all' },
      locale
    )) {
      const metadata = describeCatalogDocument(document, locale);
      if (metadata.theme === 'unspecified' && metadata.style === 'unspecified') continue;
      const group = groups.get(metadata.theme) ?? { label: metadata.themeLabel, styles: new Map() };
      group.styles.set(metadata.style, metadata.styleLabel);
      groups.set(metadata.theme, group);
    }
  return [...groups]
    .sort((a, b) => a[1].label.localeCompare(b[1].label, locale))
    .flatMap(([value, group]) => [
      ...(group.label ? [{ value, label: group.label }] : []),
      ...[...group.styles]
        .sort((a, b) => a[1].localeCompare(b[1], locale))
        .map(([value, label]) => ({ value, label: `  ${label}`, description: group.label })),
    ]);
}
