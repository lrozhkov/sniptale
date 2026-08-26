import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Save, Trash2, X } from 'lucide-react';
import {
  GallerySavedViewError,
  MAX_GALLERY_SAVED_VIEW_NAME_LENGTH,
} from '../../../composition/persistence/gallery-saved-views';
import { translate } from '../../../platform/i18n';
import type { FolderFilter } from '../types';
import type { GallerySidebarProps } from './types';

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function GallerySavedViewRows(
  props: Pick<
    GallerySidebarProps,
    'activeSavedView' | 'onDeleteSavedView' | 'onMoveSavedView' | 'onSavedViewSelect' | 'savedViews'
  > & { folder: FolderFilter }
) {
  const [visibleCount, setVisibleCount] = useState(5);
  const views = (props.savedViews ?? []).filter((view) => view.folderFilter === props.folder);
  if (views.length === 0) return null;
  return (
    <div className="space-y-0.5 pl-7">
      {views.slice(0, visibleCount).map((view, index) => {
        const active = props.activeSavedView?.id === view.id;
        return (
          <div
            key={view.id}
            className={cx(
              'group relative h-8 rounded-[7px] text-xs transition-colors',
              active
                ? 'bg-[var(--sniptale-color-accent-soft)] text-[var(--sniptale-color-text-primary)]'
                : 'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-canvas)]'
            )}
          >
            <button
              type="button"
              onClick={() => props.onSavedViewSelect?.(view.id)}
              className="flex h-full w-full min-w-0 items-center truncate rounded-[7px] px-2
                pr-[78px] text-left font-medium outline-none
                focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-border-accent-strong)]"
              title={view.name}
            >
              <span className="truncate">{view.name}</span>
            </button>
            <div
              className="pointer-events-none absolute inset-y-0 right-1 flex items-center opacity-0
                transition-opacity group-hover:pointer-events-auto group-hover:opacity-100
                group-focus-within:pointer-events-auto group-focus-within:opacity-100"
            >
              <SavedViewRowAction
                disabled={index === 0}
                icon={ArrowUp}
                label={translate('gallery.app.savedViewMoveUp')}
                onClick={() => props.onMoveSavedView?.(view.id, 'up')}
                viewName={view.name}
              />
              <SavedViewRowAction
                disabled={index === views.length - 1}
                icon={ArrowDown}
                label={translate('gallery.app.savedViewMoveDown')}
                onClick={() => props.onMoveSavedView?.(view.id, 'down')}
                viewName={view.name}
              />
              <SavedViewRowAction
                danger
                icon={Trash2}
                label={translate('gallery.app.savedViewDelete')}
                onClick={() => props.onDeleteSavedView?.(view)}
                viewName={view.name}
              />
            </div>
          </div>
        );
      })}
      {visibleCount < views.length ? (
        <button
          type="button"
          onClick={() => setVisibleCount((current) => current + 5)}
          className="flex h-8 w-full items-center rounded-[7px] px-2 text-left text-xs font-medium
            text-[var(--sniptale-color-accent-emphasis)] transition-colors
            hover:bg-[var(--sniptale-color-accent-soft)] focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-border-accent-strong)]"
        >
          {translate('gallery.app.savedViewShowMore')}
        </button>
      ) : null}
    </div>
  );
}

function SavedViewRowAction(props: {
  danger?: boolean;
  disabled?: boolean;
  icon: typeof ArrowUp;
  label: string;
  onClick: () => void;
  viewName: string;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={(event) => {
        event.currentTarget.blur();
        props.onClick();
      }}
      aria-label={`${props.label} ${props.viewName}`}
      title={props.label}
      className={cx(
        'inline-flex h-6 w-6 items-center justify-center rounded-[6px]',
        'text-[var(--sniptale-color-text-muted)] transition-colors',
        'hover:bg-[var(--sniptale-color-surface-panel)] hover:text-[var(--sniptale-color-text-primary)]',
        'focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[var(--sniptale-color-border-accent-strong)] disabled:opacity-35',
        props.danger &&
          'hover:bg-[var(--sniptale-color-danger-soft)] hover:text-[var(--sniptale-color-danger)]'
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof GallerySavedViewError) {
    if (error.code === 'conflict') return translate('gallery.app.savedViewNameConflict');
    if (error.code === 'limit') return translate('gallery.app.savedViewLimit');
    if (error.code === 'not-found') return translate('gallery.app.savedViewNotFound');
  }
  return translate('gallery.app.savedViewSaveFailed');
}

export function GallerySavedViewActions(
  props: GallerySidebarProps & { hasFacetedFilters: boolean }
) {
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canCreate = props.activeSavedView === null && props.hasFacetedFilters;
  const canUpdate = props.activeSavedView !== null && props.isSavedViewDirty;

  const save = async () => {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await props.onCreateSavedView?.(name);
      setName('');
      setIsCreating(false);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {isCreating && canCreate ? (
        <div
          className="order-last w-full basis-full space-y-1.5 rounded-[8px] border
          border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)] p-1.5"
        >
          <div className="flex h-8 items-center gap-1.5">
            <input
              autoFocus
              value={name}
              maxLength={MAX_GALLERY_SAVED_VIEW_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save();
                if (event.key === 'Escape') {
                  setIsCreating(false);
                  setError(null);
                }
              }}
              aria-label={translate('gallery.app.savedViewName')}
              placeholder={translate('gallery.app.savedViewName')}
              className="h-full min-w-0 flex-1 rounded-[7px] border
                border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
                px-2 text-xs outline-none focus:border-[var(--sniptale-color-border-accent-strong)]"
            />
            <button
              type="button"
              disabled={!name.trim() || isSaving}
              onClick={() => void save()}
              aria-label={translate('gallery.app.savedViewConfirm')}
              title={translate('gallery.app.savedViewConfirm')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[7px]
                bg-[var(--sniptale-color-accent)] text-white transition-colors
                hover:bg-[var(--sniptale-color-accent-emphasis)] disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setError(null);
              }}
              aria-label={translate('common.actions.cancel')}
              title={translate('common.actions.cancel')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[7px]
                text-[var(--sniptale-color-text-muted)] hover:bg-[var(--sniptale-color-surface-canvas)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {error ? (
            <p className="px-1 text-[11px] text-[var(--sniptale-color-danger)]">{error}</p>
          ) : null}
        </div>
      ) : null}
      {canCreate || canUpdate ? (
        <button
          type="button"
          onClick={() => {
            if (canUpdate) {
              setError(null);
              void props.onUpdateSavedView?.().catch((updateError: unknown) => {
                setError(errorMessage(updateError));
              });
            } else {
              setIsCreating((current) => !current);
              setError(null);
            }
          }}
          className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[8px]
            border border-[var(--sniptale-color-border-soft)] px-2 text-xs font-medium
            text-[var(--sniptale-color-text-secondary)] transition-colors
            hover:border-[var(--sniptale-color-border-strong)]
            hover:bg-[var(--sniptale-color-surface-canvas)]"
        >
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="truncate">
            {canUpdate
              ? translate('gallery.app.savedViewUpdate')
              : translate('gallery.app.savedViewSave')}
          </span>
        </button>
      ) : null}
      {!isCreating && error ? (
        <p className="basis-full px-1 text-[11px] text-[var(--sniptale-color-danger)]">{error}</p>
      ) : null}
    </>
  );
}
