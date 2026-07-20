import { translate } from '../../../../platform/i18n';
import { cx } from '../../../chrome/ui';
import { getShapeBrowserSourceFilterLabel, SHAPE_BROWSER_SOURCE_FILTERS } from './data';
import type { ShapeBrowserSourceFilter } from './types';

const ACTIVE_SOURCE_FILTER_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_28%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_78%,var(--sniptale-color-accent)_10%)]',
  'text-[color:var(--sniptale-color-text-primary)]',
].join(' ');

export function SourceFilters(props: {
  filters?: readonly ShapeBrowserSourceFilter[];
  value: ShapeBrowserSourceFilter;
  onChange: (filter: ShapeBrowserSourceFilter) => void;
}) {
  const filters = props.filters ?? SHAPE_BROWSER_SOURCE_FILTERS;
  return (
    <div
      className={cx(
        'flex flex-wrap gap-1 rounded-[10px] border p-1',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]'
      )}
      role="group"
      aria-label={translate('editor.shapeCatalog.browser.title')}
    >
      {filters.map((filter) => {
        const active = filter === props.value;
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={active}
            data-shape-source-filter={filter}
            onClick={() => props.onChange(filter)}
            className={cx(
              'min-h-8 max-w-full rounded-[7px] border px-2.5 text-[12px] font-semibold',
              active
                ? ACTIVE_SOURCE_FILTER_CLASS_NAME
                : [
                    'border-transparent bg-transparent',
                    'text-[color:var(--sniptale-color-text-secondary)]',
                    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
                  ].join(' ')
            )}
          >
            <span className="block truncate">{getShapeBrowserSourceFilterLabel(filter)}</span>
          </button>
        );
      })}
    </div>
  );
}
