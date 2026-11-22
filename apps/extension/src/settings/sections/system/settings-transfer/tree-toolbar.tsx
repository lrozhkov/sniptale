import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { SearchField } from '../../../../ui/compact-inspector-controls/row-controls';
import { translate } from '../../../../platform/i18n';

const buttonClassName =
  'min-h-8 rounded-[4px] border border-[var(--sniptale-color-border-soft)] px-2.5 text-xs ' +
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
        'grid gap-2 border-b border-[var(--sniptale-color-border-soft)] ' +
        'bg-[var(--sniptale-color-surface-panel)] p-2.5'
      }
    >
      <div className="w-full min-w-0 max-w-lg">
        <SearchField
          label={translate('settings.settingsTransfer.searchLabel')}
          placeholder={translate('settings.settingsTransfer.searchPlaceholder')}
          value={props.query}
          onChange={props.onQueryChange}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ProductActionButton
          tone="secondary"
          type="button"
          className={buttonClassName}
          disabled={props.expandableCount === 0}
          onClick={props.onToggleExpansion}
        >
          {translate(
            props.expanded
              ? 'settings.settingsTransfer.collapseAll'
              : 'settings.settingsTransfer.expandAll'
          )}
        </ProductActionButton>
        <ProductActionButton
          tone="secondary"
          type="button"
          className={buttonClassName}
          disabled={props.scopeCount === 0}
          onClick={props.onToggleScope}
        >
          {translate(resolveScopeActionKey(hasQuery, props.scopeSelected))}
        </ProductActionButton>
        {hasQuery ? (
          <span role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('settings.settingsTransfer.foundCount').replace(
              '{count}',
              String(props.matchCount)
            )}
          </span>
        ) : null}
      </div>
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
