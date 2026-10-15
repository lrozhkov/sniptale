import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useRef, useState } from 'react';
import { InspectorFieldClear } from '../../../ui/compact-inspector-controls/text-field';
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
    <div className="space-y-1 pl-7">
      {views.slice(0, visibleCount).map((view, index) => {
        const active = props.activeSavedView?.id === view.id;
        return (
          <div
            key={view.id}
            className={cx(
              'group relative h-8 rounded-[4px] border text-[13px] leading-[18px] transition-colors',
              active
                ? [
                    'border-transparent',
                    'bg-[var(--sniptale-color-surface-hover)]',
                    'text-[var(--sniptale-color-text-primary-strong)]',
                  ].join(' ')
                : [
                    'border-transparent hover:border-[var(--sniptale-color-border-soft)]',
                    'text-[var(--sniptale-color-text-secondary)]',
                    'hover:bg-[var(--sniptale-color-surface-hover)]',
                    'hover:text-[var(--sniptale-color-text-primary)]',
                  ].join(' ')
            )}
          >
            <button
              type="button"
              aria-pressed={active}
              onClick={() => props.onSavedViewSelect?.(view.id)}
              className="flex h-full w-full min-w-0 items-center truncate rounded-[4px] px-2
                pr-[100px] text-left font-medium outline-none
                focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sniptale-color-text-primary)]"
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
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          onClick={() => setVisibleCount((current) => current + 5)}
          className="w-full !justify-start"
        >
          {translate('gallery.app.savedViewShowMore')}
        </ProductActionButton>
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
    <ProductActionButton
      tone={props.danger ? 'danger' : 'secondary'}
      compact
      type="button"
      disabled={props.disabled}
      onClick={(event) => {
        event.currentTarget.blur();
        props.onClick();
      }}
      aria-label={`${props.label} ${props.viewName}`}
      title={props.label}
      className="h-8 w-8 shrink-0"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </ProductActionButton>
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
  const inputRef = useRef<HTMLInputElement>(null);
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
          className="order-last w-full basis-full space-y-1.5 rounded-[4px] border
          border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)] p-1.5"
        >
          <div className="flex h-8 items-center gap-1.5">
            <div className="relative h-8 min-w-0 flex-1">
              <input
                ref={inputRef}
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
                className="h-full w-full min-w-0 rounded-[4px] border
                border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
                pl-2 pr-8 text-[13px] leading-[18px] outline-none
                focus:border-[var(--sniptale-color-border-accent-strong)]"
              />
              {name.length > 0 ? (
                <InspectorFieldClear
                  label={translate('gallery.app.savedViewName')}
                  target={inputRef}
                />
              ) : null}
            </div>
            <ProductActionButton
              tone="secondary"
              compact
              type="button"
              disabled={!name.trim() || isSaving}
              onClick={() => void save()}
              aria-label={translate('gallery.app.savedViewConfirm')}
              title={translate('gallery.app.savedViewConfirm')}
              className="h-8 w-8 shrink-0"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
            </ProductActionButton>
            <ProductActionButton
              tone="secondary"
              compact
              data-command-chrome="true"
              type="button"
              onClick={() => {
                setIsCreating(false);
                setError(null);
              }}
              aria-label={translate('common.actions.cancel')}
              title={translate('common.actions.cancel')}
              className="sniptale-dismiss-button h-8 w-8 shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </ProductActionButton>
          </div>
          {error ? (
            <p className="px-1 text-sm leading-5 text-[var(--sniptale-color-danger)]">{error}</p>
          ) : null}
        </div>
      ) : null}
      {canCreate || canUpdate ? (
        <ProductActionButton
          tone="secondary"
          compact
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
          className="min-w-0 flex-1 gap-1.5"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          <span className="truncate">
            {canUpdate
              ? translate('gallery.app.savedViewUpdate')
              : translate('gallery.app.savedViewSave')}
          </span>
        </ProductActionButton>
      ) : null}
      {!isCreating && error ? (
        <p className="basis-full px-1 text-sm leading-5 text-[var(--sniptale-color-danger)]">
          {error}
        </p>
      ) : null}
    </>
  );
}
