import type { DragEvent, KeyboardEvent, RefObject } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  CornerUpLeft,
  Download,
  Film,
  Folder,
  GripVertical,
  Image,
  Library,
  Link2,
  Monitor,
  Pencil,
  Settings2,
  Trash2,
  Video,
} from 'lucide-react';
import type { AppLocale } from '../../../../../platform/i18n';
import { translate } from '../../../../../platform/i18n';
import type { ContextMenuTreeNode } from '../../../../../contracts/settings/context-menu-layout';
import { SettingsSwitch } from '../../../../section-surface/panel-controls';

type TreeRow = {
  key: string;
  node: ContextMenuTreeNode;
  level: number;
  parentId: string | null;
};

type DropEdge = 'before' | 'after' | 'inside';

type RowActions = {
  select(key: string): void;
  toggleExpanded(id: string): void;
  keyDown(event: KeyboardEvent<HTMLDivElement>, key: string, node: ContextMenuTreeNode): void;
  dragStart(event: DragEvent<HTMLSpanElement>, key: string): void;
  dragEnd(): void;
  dragOver(event: DragEvent<HTMLDivElement>, key: string, node: ContextMenuTreeNode): void;
  drop(event: DragEvent<HTMLDivElement>): void;
  edit(key: string, value: string): void;
  editValue(value: string): void;
  commitRename(): void;
  cancelRename(key: string): void;
  toggleEnabled(key: string, enabled: boolean): void;
  moveRelative(key: string, offset: number): void;
  moveInside(key: string): void;
  moveOutside(key: string): void;
  remove(key: string): void;
};

export const treeIconButton = [
  'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg',
  'text-[var(--sniptale-color-text-muted)]',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
  'disabled:cursor-not-allowed disabled:opacity-40',
].join(' ');

function CommandIcon({ command }: { command: string }) {
  const props = { size: 16, 'aria-hidden': true as const };
  if (command.includes('quick-action.') || command.includes('screenshots.'))
    return <Camera {...props} />;
  if (command.includes('video-editor')) return <Film {...props} />;
  if (command.includes('.video.')) return <Video {...props} />;
  if (command.includes('.export.')) return <Download {...props} />;
  if (command.includes('.page-link.')) return <Link2 {...props} />;
  if (command.includes('.image-editor')) return <Image {...props} />;
  if (command.includes('.gallery')) return <Library {...props} />;
  if (command.includes('.window-resize.')) return <Monitor {...props} />;
  return <Settings2 {...props} />;
}

function rowClass(selected: boolean, level: number, dropEdge?: DropEdge): string {
  return [
    'relative min-w-0 rounded-lg border py-1.5 pr-1 transition-colors',
    'focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
    selected
      ? 'border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-surface-hover)]'
      : 'border-transparent hover:bg-[var(--sniptale-color-surface-hover)]',
    level === 2 ? 'ml-5 pl-1' : 'pl-1',
    dropEdge === 'inside' ? 'ring-2 ring-[var(--sniptale-color-accent)]' : '',
    dropEdge === 'before' ? 'border-t-[var(--sniptale-color-accent)]' : '',
    dropEdge === 'after' ? 'border-b-[var(--sniptale-color-accent)]' : '',
  ].join(' ');
}

export function ContextMenuTreeRow(props: {
  row: TreeRow;
  label: string;
  selected: boolean;
  first: boolean;
  expanded: boolean;
  dropEdge: DropEdge | undefined;
  unavailable: boolean;
  editingValue: string | undefined;
  inputRef: RefObject<HTMLInputElement | null>;
  siblingIndex: number;
  siblingCount: number;
  hasSections: boolean;
  locale: AppLocale;
  actions: RowActions;
}) {
  const { row, label, actions } = props;
  const { key, node, level } = row;
  const t = (id: Parameters<typeof translate>[0]) => translate(id, props.locale);
  return (
    <div
      data-tree-key={key}
      role="treeitem"
      aria-level={level}
      aria-selected={props.selected}
      aria-expanded={node.type === 'section' ? props.expanded : undefined}
      tabIndex={props.selected || props.first ? 0 : -1}
      onFocus={() => actions.select(key)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button,input,[draggable]')) return;
        actions.select(key);
      }}
      onKeyDown={(event) => actions.keyDown(event, key, node)}
      onDragOver={(event) => actions.dragOver(event, key, node)}
      onDrop={actions.drop}
      className={rowClass(props.selected, level, props.dropEdge)}
    >
      <div className="flex min-w-0 items-center gap-1">
        {node.type === 'section' ? (
          <button
            type="button"
            className={treeIconButton}
            aria-label={`${t(
              props.expanded
                ? 'settings.appearance.contextMenuCollapse'
                : 'settings.appearance.contextMenuExpand'
            )}: ${label}`}
            onClick={() => actions.toggleExpanded(node.id)}
          >
            {props.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span aria-hidden="true" className="inline-block size-8" />
        )}
        <span
          draggable
          onDragStart={(event) => actions.dragStart(event, key)}
          onDragEnd={actions.dragEnd}
          className={[
            'flex size-7 shrink-0 cursor-grab items-center justify-center',
            'text-[var(--sniptale-color-text-muted)] active:cursor-grabbing',
          ].join(' ')}
          aria-label={t('settings.appearance.contextMenuDrag')}
        >
          <GripVertical size={16} />
        </span>
        <span className="shrink-0 text-[var(--sniptale-color-text-muted)]">
          {node.type === 'section' ? (
            <Folder size={16} aria-hidden="true" />
          ) : (
            <CommandIcon command={node.command} />
          )}
        </span>
        {props.editingValue !== undefined ? (
          <input
            ref={props.inputRef}
            aria-label={t('settings.appearance.contextMenuSectionName')}
            className={[
              'min-w-0 flex-1 rounded-md border border-[var(--sniptale-color-border-soft)]',
              'bg-[var(--sniptale-color-surface-canvas)] px-2 py-1 text-sm',
            ].join(' ')}
            maxLength={40}
            value={props.editingValue}
            onChange={(event) => actions.editValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                actions.commitRename();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                actions.cancelRename(key);
              }
            }}
            onBlur={actions.commitRename}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm" title={label}>
            {label}
          </span>
        )}
        <SettingsSwitch
          size="sm"
          checked={node.enabled}
          aria-label={`${t('settings.appearance.contextMenuEnabledLabel')}: ${label}`}
          onClick={() => actions.toggleEnabled(key, !node.enabled)}
        />
      </div>
      {props.unavailable ? (
        <p className="pl-12 text-xs text-[var(--sniptale-color-text-muted)]">
          {t('settings.appearance.contextMenuUnavailable')}
        </p>
      ) : null}
      <RowControls {...props} />
    </div>
  );
}

function RowControls(props: {
  row: TreeRow;
  label: string;
  siblingIndex: number;
  siblingCount: number;
  hasSections: boolean;
  locale: AppLocale;
  actions: RowActions;
}) {
  const {
    row: { key, node, parentId },
    label,
    actions,
  } = props;
  const t = (id: Parameters<typeof translate>[0]) => translate(id, props.locale);
  return (
    <div className="flex min-w-0 items-center justify-end gap-1 pl-10">
      <button
        type="button"
        className={treeIconButton}
        aria-label={`${t('settings.appearance.contextMenuRename')}: ${label}`}
        onClick={() => actions.edit(key, node.title ?? label)}
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        className={treeIconButton}
        aria-label={`${t('settings.appearance.contextMenuUp')}: ${label}`}
        disabled={props.siblingIndex === 0}
        onClick={() => actions.moveRelative(key, -1)}
      >
        <ArrowUp size={15} />
      </button>
      <button
        type="button"
        className={treeIconButton}
        aria-label={`${t('settings.appearance.contextMenuDown')}: ${label}`}
        disabled={props.siblingIndex === props.siblingCount - 1}
        onClick={() => actions.moveRelative(key, 1)}
      >
        <ArrowDown size={15} />
      </button>
      {node.type === 'command' && !parentId ? (
        <button
          type="button"
          className={treeIconButton}
          aria-label={`${t('settings.appearance.contextMenuInside')}: ${label}`}
          disabled={!props.hasSections}
          onClick={() => actions.moveInside(key)}
        >
          <CornerDownLeft size={15} />
        </button>
      ) : null}
      {parentId ? (
        <button
          type="button"
          className={treeIconButton}
          aria-label={`${t('settings.appearance.contextMenuOutside')}: ${label}`}
          onClick={() => actions.moveOutside(key)}
        >
          <CornerUpLeft size={15} />
        </button>
      ) : null}
      <button
        type="button"
        className={treeIconButton}
        aria-label={`${t(
          node.type === 'section'
            ? 'settings.appearance.contextMenuRemoveSection'
            : 'settings.appearance.contextMenuRemoveCommand'
        )}: ${label}`}
        onClick={() => actions.remove(key)}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
