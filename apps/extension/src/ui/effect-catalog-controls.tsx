import { useRef, useState } from 'react';
import { Search, X, Sparkles, WandSparkles, ArrowRightLeft } from 'lucide-react';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { ProductGlassInput } from '@sniptale/ui/product-glass-controls';
import { CompactSelect } from './compact-inspector-controls/primitives';
import { translate } from '../platform/i18n';
import type { EffectCatalogFilter } from '../features/video/project/effect-bundle/catalog/query';
import type { EffectFileImportResult } from '../composition/persistence/effect-bundles/import-files';

export function EffectCatalogControls({
  filter,
  onChange,
  themes = [],
  disabled = false,
}: {
  filter: EffectCatalogFilter;
  onChange: (filter: EffectCatalogFilter) => void;
  themes?: readonly Exclude<EffectCatalogFilter['theme'], 'all'>[];
  disabled?: boolean;
}) {
  const searchButton = useRef<HTMLButtonElement>(null);
  const [searching, setSearching] = useState(false);
  const categories = [
    {
      value: 'standalone',
      Icon: Sparkles,
      label: translate('videoEditor.effectsLibrary.annotations'),
    },
    {
      value: 'targetEffect',
      Icon: WandSparkles,
      label: translate('videoEditor.effectsLibrary.videoEffects'),
    },
    {
      value: 'transition',
      Icon: ArrowRightLeft,
      label: translate('videoEditor.effectsLibrary.transitions'),
    },
  ] as const;
  return (
    <div className="flex w-full min-w-0 max-w-sm flex-col gap-2" data-ui="effect-catalog.filters">
      <div className="flex min-w-0 items-center gap-1">
        {searching ? (
          <ProductGlassInput
            autoFocus
            className="!h-8 min-w-0 flex-1"
            disabled={disabled}
            aria-label={translate('videoEditor.effectsLibrary.searchPlaceholder')}
            placeholder={translate('videoEditor.effectsLibrary.searchPlaceholder')}
            value={filter.query}
            onChange={(event) => onChange({ ...filter, query: event.currentTarget.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                onChange({ ...filter, query: '' });
                setSearching(false);
                searchButton.current?.focus();
              }
            }}
          />
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {categories.map(({ value, Icon, label }) => (
              <EditorIconButton
                key={value}
                title={label}
                aria-pressed={filter.kind === value}
                className={
                  filter.kind === value
                    ? 'text-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-surface-panel)]'
                    : ''
                }
                disabled={disabled}
                onClick={() => onChange({ ...filter, kind: filter.kind === value ? 'all' : value })}
              >
                <Icon size={17} aria-hidden="true" />
              </EditorIconButton>
            ))}
          </div>
        )}
        <EditorIconButton
          ref={searchButton}
          aria-expanded={searching}
          disabled={disabled}
          title={
            searching
              ? translate('common.actions.close')
              : translate('videoEditor.effectsLibrary.searchPlaceholder')
          }
          onClick={() => {
            if (searching) onChange({ ...filter, query: '' });
            setSearching(!searching);
          }}
        >
          {searching ? <X size={16} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
        </EditorIconButton>
      </div>
      {themes.length > 1 && (
        <CompactSelect
          aria-label={translate('videoEditor.effectsLibrary.theme')}
          value={themes.some((theme) => theme === filter.theme) ? filter.theme : 'all'}
          containerClassName="min-w-0"
          disabled={disabled}
          options={[
            { value: 'all', label: translate('videoEditor.effectsLibrary.allThemes') },
            ...themes.map((value) => ({
              value,
              label: translate(
                value === 'light'
                  ? 'videoEditor.effectsLibrary.lightTheme'
                  : value === 'dark'
                    ? 'videoEditor.effectsLibrary.darkTheme'
                    : 'videoEditor.effectsLibrary.noTheme'
              ),
            })),
          ]}
          onChange={(theme) => onChange({ ...filter, theme })}
        />
      )}
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
