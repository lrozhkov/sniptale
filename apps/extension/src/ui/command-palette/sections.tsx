import { useContext, type RefObject } from 'react';
import { CommandPressScope, useCommandPress } from '@sniptale/ui/control-language/press';
import { X } from 'lucide-react';
import { SearchField } from '../compact-inspector-controls/row-controls';
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
  const searchLabel = translate('shared.ui.commandPalettePlaceholder');
  return (
    <div className="border-b border-[var(--sniptale-color-border-subtle)] px-4 py-3">
      <div className="flex items-center gap-2">
        <SearchField
          className="flex-1"
          inputRef={props.inputRef}
          showClear={compact}
          label={searchLabel}
          placeholder={searchLabel}
          value={props.query}
          onChange={props.onQueryChange}
        />
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
