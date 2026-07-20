import { EyeOff, Trash2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { cx } from '../../../chrome/ui';
import { getShapeBrowserEntryLabel } from './data';
import { ShapeThumbnail } from './thumbnail';
import type { ShapeBrowserEntry } from './types';

const SHAPE_TILE_ACTION_CLASS_NAME =
  'rounded-[6px] p-1 disabled:cursor-not-allowed disabled:opacity-50';

type ShapeTileProps = {
  entry: ShapeBrowserEntry;
  primary?: boolean;
  selected?: boolean;
  onDelete?: (entry: ShapeBrowserEntry) => void;
  onDisable?: (entry: ShapeBrowserEntry) => void;
  onSelect: (entry: ShapeBrowserEntry) => void;
};

function ShapeTileButton(props: {
  entry: ShapeBrowserEntry;
  label: string;
  selected?: boolean;
  onSelect: (entry: ShapeBrowserEntry) => void;
}) {
  const disabledReason = props.entry.disabledReason ?? null;
  return (
    <button
      type="button"
      aria-label={disabledReason ? `${props.label}. ${disabledReason}` : props.label}
      aria-pressed={props.selected}
      disabled={Boolean(disabledReason)}
      title={disabledReason ? `${props.label}. ${disabledReason}` : props.label}
      data-shape-browser-tile="true"
      data-shape-id={props.entry.id}
      data-shape-kind={props.entry.insertKind}
      onClick={() => props.onSelect(props.entry)}
      className={cx(
        'flex h-[58px] w-full min-w-0 flex-col items-center justify-between gap-1',
        'rounded-[8px] border p-1.5 text-[color:var(--sniptale-color-text-secondary)] transition',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_86%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_78%,transparent)]',
        'hover:border-[color:var(--sniptale-color-border-strong)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-[color:var(--sniptale-color-accent)]',
        props.selected &&
          'border-[color:var(--sniptale-color-accent)] bg-[color:var(--sniptale-color-surface-hover)]',
        disabledReason && 'cursor-not-allowed opacity-60'
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-full shrink-0 items-center text-[color:var(--sniptale-color-text-primary)]"
      >
        <ShapeThumbnail geometry={props.entry.thumbnail} />
      </span>
    </button>
  );
}

function ShapeTileActions(props: {
  entry: ShapeBrowserEntry;
  onDelete?: (entry: ShapeBrowserEntry) => void;
  onDisable?: (entry: ShapeBrowserEntry) => void;
}) {
  return (
    <div className="mt-1 flex justify-end gap-1">
      <button
        type="button"
        aria-label={translate('editor.shapeCatalog.browser.disableCustomShape')}
        disabled={!props.onDisable}
        onClick={() => props.onDisable?.(props.entry)}
        className={`${SHAPE_TILE_ACTION_CLASS_NAME} text-[color:var(--sniptale-color-text-muted-strong)]`}
      >
        <EyeOff size={12} strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-label={translate('editor.shapeCatalog.browser.deleteCustomShape')}
        disabled={!props.onDelete}
        onClick={() => props.onDelete?.(props.entry)}
        className={`${SHAPE_TILE_ACTION_CLASS_NAME} text-[color:var(--sniptale-color-danger)]`}
      >
        <Trash2 size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

export function ShapeTile(props: ShapeTileProps) {
  const label = getShapeBrowserEntryLabel(props.entry);
  const customActionsVisible = props.entry.source !== 'built-in' && !props.primary;

  return (
    <div className="min-w-0">
      <ShapeTileButton
        entry={props.entry}
        label={label}
        {...(props.selected === undefined ? {} : { selected: props.selected })}
        onSelect={props.onSelect}
      />
      {customActionsVisible ? (
        <ShapeTileActions
          entry={props.entry}
          {...(props.onDelete ? { onDelete: props.onDelete } : {})}
          {...(props.onDisable ? { onDisable: props.onDisable } : {})}
        />
      ) : null}
    </div>
  );
}

export function ShapeTileGrid(props: {
  entries: readonly ShapeBrowserEntry[];
  selectedEntryId?: string | null;
  onDelete?: (entry: ShapeBrowserEntry) => void;
  onDisable?: (entry: ShapeBrowserEntry) => void;
  onSelect: (entry: ShapeBrowserEntry) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {props.entries.map((entry) => (
        <ShapeTile
          key={entry.id}
          entry={entry}
          selected={props.selectedEntryId === entry.id}
          onSelect={props.onSelect}
          {...(props.onDelete ? { onDelete: props.onDelete } : {})}
          {...(props.onDisable ? { onDisable: props.onDisable } : {})}
        />
      ))}
    </div>
  );
}
