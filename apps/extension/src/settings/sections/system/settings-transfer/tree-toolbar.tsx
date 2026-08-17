import { Search, X } from 'lucide-react';
import { translate } from '../../../../platform/i18n';

const buttonClassName =
  'min-h-8 rounded-lg border border-[var(--sniptale-color-border-soft)] px-2.5 text-xs ' +
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)] ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export function SettingsTransferTreeToolbar(props: {
  query: string;
  matchCount: number;
  expandableCount: number;
  scopeCount: number;
  scopeSelected: boolean;
  expanded: boolean;
  onQueryChange: (query: string) => void;
  onToggleExpansion: () => void;
  onToggleScope: () => void;
}) {
  const hasQuery = props.query.trim().length > 0;
  return (
    <div
      className={
        'flex items-center gap-2 border-b border-[var(--sniptale-color-border-soft)] ' +
        'bg-[var(--sniptale-color-surface-panel)] p-2.5'
      }
    >
      <label
        className={
          'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border ' +
          'border-[var(--sniptale-color-border-soft)] px-2.5'
        }
      >
        <Search aria-hidden="true" size={15} />
        <input
          className={
            'min-w-0 flex-1 bg-transparent text-sm outline-none ' +
            'focus:placeholder:text-transparent focus:placeholder:opacity-0'
          }
          aria-label={translate('settings.settingsTransfer.searchLabel')}
          placeholder={translate('settings.settingsTransfer.searchPlaceholder')}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.currentTarget.value)}
        />
        {hasQuery ? (
          <span className="shrink-0 text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('settings.settingsTransfer.foundCount').replace(
              '{count}',
              String(props.matchCount)
            )}
          </span>
        ) : null}
        {props.query ? (
          <button
            type="button"
            aria-label={translate('settings.settingsTransfer.clearSearch')}
            onClick={() => props.onQueryChange('')}
          >
            <X aria-hidden="true" size={15} />
          </button>
        ) : null}
      </label>
      <button
        type="button"
        className={`${buttonClassName} shrink-0`}
        disabled={props.expandableCount === 0}
        onClick={props.onToggleExpansion}
      >
        {translate(
          props.expanded
            ? 'settings.settingsTransfer.collapseAll'
            : 'settings.settingsTransfer.expandAll'
        )}
      </button>
      <button
        type="button"
        className={`${buttonClassName} shrink-0`}
        disabled={props.scopeCount === 0}
        onClick={props.onToggleScope}
      >
        {translate(resolveScopeActionKey(hasQuery, props.scopeSelected))}
      </button>
    </div>
  );
}

function resolveScopeActionKey(hasQuery: boolean, selected: boolean) {
  if (hasQuery) {
    return selected
      ? ('settings.settingsTransfer.clearFound' as const)
      : ('settings.settingsTransfer.selectFound' as const);
  }
  return selected
    ? ('settings.settingsTransfer.clearAll' as const)
    : ('settings.settingsTransfer.selectAll' as const);
}
