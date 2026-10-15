import { useContext, type RefObject } from 'react';
import { CommandPressScope, useCommandPress } from '@sniptale/ui/control-language/press';
import { Search, X } from 'lucide-react';
import { InspectorFieldClear } from '../compact-inspector-controls/text-field';
import { translate } from '../../platform/i18n';
import type { CommandPaletteAction, LocalizedCommandPaletteGroup } from './types';
import { CommandPaletteEmptyState, CommandPaletteResults } from './results';

export function CommandPaletteHeader(props: {
  query: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onQueryChange: (value: string) => void;
}) {
  const compact = useContext(CommandPressScope);
  const close = useCommandPress({ enabled: compact, onClick: props.onClose });
  const queryInput = (
    <input
      ref={props.inputRef}
      value={props.query}
      onChange={(event) => props.onQueryChange(event.target.value)}
      placeholder={translate('shared.ui.commandPalettePlaceholder')}
      className={[
        'min-w-0 flex-1 bg-transparent text-sm',
        compact ? 'w-full' : '',
        'text-[var(--sniptale-color-text-primary)] outline-none',
        'placeholder:text-[var(--sniptale-color-text-dim)]',
      ].join(' ')}
    />
  );
  return (
    <div className="border-b border-[var(--sniptale-color-border-subtle)] px-4 py-3">
      <div className="flex items-center gap-3">
        <Search
          size={18}
          strokeWidth={1.8}
          className="shrink-0 text-[var(--sniptale-color-text-muted)]"
        />
        {compact ? (
          <div className="relative min-w-0 flex-1 pr-8">
            {queryInput}
            {props.query ? (
              <InspectorFieldClear
                label={translate('shared.ui.commandPalettePlaceholder')}
                target={props.inputRef}
              />
            ) : null}
          </div>
        ) : (
          queryInput
        )}
        <button
          type="button"
          {...close.props}
          data-command-press={compact ? '' : undefined}
          data-pressing={close.pressed ? 'true' : undefined}
          data-command-chrome={compact ? 'true' : undefined}
          aria-label={translate('shared.ui.commandPaletteCloseTitle')}
          title={translate('shared.ui.commandPaletteCloseTitle')}
          className={[
            'sniptale-dismiss-button',
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            'transition-colors',
            'hover:text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
        >
          {compact ? (
            <span className="sniptale-command-content">
              <X size={16} strokeWidth={1.8} />
            </span>
          ) : (
            <X size={16} strokeWidth={1.8} />
          )}
        </button>
      </div>
    </div>
  );
}

export function CommandPaletteBody(props: {
  title: string;
  groups: LocalizedCommandPaletteGroup[];
  flatActions: readonly CommandPaletteAction[];
  flatActionIds: readonly string[];
  selectedIndex: number;
  onHoverAction: (actionId: string) => void;
  onSelectAction: (action: CommandPaletteAction) => void;
}) {
  return (
    <div className="max-h-[360px] overflow-y-auto p-2" role="listbox" aria-label={props.title}>
      {props.flatActions.length === 0 ? (
        <CommandPaletteEmptyState />
      ) : (
        <CommandPaletteResults
          groups={props.groups}
          flatActionIds={props.flatActionIds}
          selectedIndex={props.selectedIndex}
          onHoverAction={props.onHoverAction}
          onSelectAction={props.onSelectAction}
        />
      )}
    </div>
  );
}

export function CommandPaletteTitle(props: { titleId: string; title: string }) {
  return (
    <h2 id={props.titleId} className="sr-only">
      {props.title}
    </h2>
  );
}
