import { ProductGlassInput } from '@sniptale/ui/product-glass-controls';
import { CompactSelect } from './compact-inspector-controls/primitives';
import { translate } from '../platform/i18n';
import type { EffectCatalogFilter } from '../features/video/project/effect-bundle/catalog/query';
import type { EffectFileImportResult } from '../composition/persistence/effect-bundles/import-files';

export function EffectCatalogControls({
  filter,
  onChange,
  disabled = false,
}: {
  filter: EffectCatalogFilter;
  onChange: (filter: EffectCatalogFilter) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-ui="effect-catalog.filters">
      <ProductGlassInput
        className="!h-9 min-w-0 flex-[1_1_160px]"
        disabled={disabled}
        aria-label={translate('videoEditor.effectsLibrary.searchPlaceholder')}
        placeholder={translate('videoEditor.effectsLibrary.searchPlaceholder')}
        value={filter.query}
        onChange={(event) => onChange({ ...filter, query: event.currentTarget.value })}
      />
      <CompactSelect
        aria-label={translate('videoEditor.effectsLibrary.category')}
        value={filter.kind}
        containerClassName="min-w-0 flex-[1_1_140px]"
        className="h-9 w-full rounded-lg border border-[var(--sniptale-color-border-soft)] px-3"
        disabled={disabled}
        options={[
          { value: 'all', label: translate('videoEditor.effectsLibrary.allCategories') },
          { value: 'standalone', label: translate('videoEditor.effectsLibrary.annotations') },
          { value: 'targetEffect', label: translate('videoEditor.effectsLibrary.videoEffects') },
          { value: 'transition', label: translate('videoEditor.effectsLibrary.transitions') },
        ]}
        onChange={(kind) => onChange({ ...filter, kind })}
      />
      <CompactSelect
        aria-label={translate('videoEditor.effectsLibrary.theme')}
        value={filter.theme}
        containerClassName="min-w-0 flex-[1_1_140px]"
        className="h-9 w-full rounded-lg border border-[var(--sniptale-color-border-soft)] px-3"
        disabled={disabled}
        options={[
          { value: 'all', label: translate('videoEditor.effectsLibrary.allThemes') },
          { value: 'light', label: translate('videoEditor.effectsLibrary.lightTheme') },
          { value: 'dark', label: translate('videoEditor.effectsLibrary.darkTheme') },
          { value: 'unspecified', label: translate('videoEditor.effectsLibrary.noTheme') },
        ]}
        onChange={(theme) => onChange({ ...filter, theme })}
      />
    </div>
  );
}
export function EffectImportSummary({ results }: { results: readonly EffectFileImportResult[] }) {
  if (!results.length) return null;
  const failed = results.filter((item) => item.status === 'failed');
  return (
    <div
      role="status"
      className="py-2 text-xs leading-relaxed"
      data-ui="effect-catalog.import-result"
    >
      {translate('videoEditor.effectsLibrary.importSummary')
        .replace('{success}', String(results.length - failed.length))
        .replace('{total}', String(results.length))}
      {failed.length ? (
        <details className="mt-1">
          <summary className="cursor-pointer">
            {translate('videoEditor.effectsLibrary.importFailures').replace(
              '{count}',
              String(failed.length)
            )}
          </summary>
          <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto">
            {failed.map((item, index) => (
              <li key={index} className="break-words">
                {item.filename}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
