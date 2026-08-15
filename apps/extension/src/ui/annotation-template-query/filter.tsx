import { Funnel, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type {
  AnnotationTemplateTag,
  AnnotationTemplateTagId,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { translate } from '../../platform/i18n';
import { FloatingFilterMenu, useFloatingFilterMenu } from './floating-filter-menu';

const FILTER_TRIGGER_BASE_CLASS_NAME = [
  'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg',
  'border px-2 text-xs transition-colors',
].join(' ');
const FILTER_TRIGGER_ACTIVE_CLASS_NAME = [
  'border-[var(--sniptale-color-border-accent-strong)]',
  'bg-[var(--sniptale-color-accent-soft)]',
  'text-[var(--sniptale-color-accent-emphasis)]',
].join(' ');
const FILTER_TRIGGER_IDLE_CLASS_NAME = [
  'border-[var(--sniptale-color-border-soft)]',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');

export function AnnotationTemplateQueryControls(props: {
  activeFilterTagIds: readonly AnnotationTemplateTagId[];
  compact?: boolean;
  disabled?: boolean;
  onActiveFilterTagIdsChange: (tagIds: AnnotationTemplateTagId[]) => void;
  onFloatingInteractionChange?: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  query: string;
  tags: readonly AnnotationTemplateTag[];
}) {
  const [open, setOpen] = useState(false);
  const floating = useFloatingFilterMenu(open, setOpen);
  const activeCount = props.activeFilterTagIds.length;
  const onFloatingInteractionChange = props.onFloatingInteractionChange;

  useEffect(() => {
    if (!open) return;
    onFloatingInteractionChange?.(true);
    return () => onFloatingInteractionChange?.(false);
  }, [onFloatingInteractionChange, open]);

  return (
    <div className="flex items-center gap-2" data-ui="shared.annotation-template-query.controls">
      <label
        className={[
          'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5',
          'border-[var(--sniptale-color-border-soft)]',
          'bg-[var(--sniptale-color-surface-input)]',
        ].join(' ')}
      >
        <Search aria-hidden="true" size={14} className="text-[var(--sniptale-color-text-muted)]" />
        <span className="sr-only">{translate('highlighter.templateTags.searchLabel')}</span>
        <input
          aria-label={translate('highlighter.templateTags.searchLabel')}
          className="min-w-0 flex-1 cursor-text bg-transparent text-xs outline-none focus:placeholder-transparent"
          onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          placeholder={translate('highlighter.templateTags.searchPlaceholder')}
          type="text"
          value={props.query}
        />
        {props.query ? (
          <button
            aria-label={translate('highlighter.templateTags.clearSearch')}
            onClick={() => props.onQueryChange('')}
            type="button"
          >
            <X aria-hidden="true" size={13} />
          </button>
        ) : null}
      </label>
      <div className="relative" data-floating-ui-owner-id={floating.ownerId} ref={floating.rootRef}>
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={translate('highlighter.templateTags.filterLabel')}
          aria-pressed={activeCount > 0}
          className={[
            FILTER_TRIGGER_BASE_CLASS_NAME,
            activeCount > 0 ? FILTER_TRIGGER_ACTIVE_CLASS_NAME : FILTER_TRIGGER_IDLE_CLASS_NAME,
          ].join(' ')}
          data-active={activeCount > 0 ? 'true' : 'false'}
          disabled={props.disabled || props.tags.length === 0}
          onClick={(event) => {
            if (!open) {
              floating.focusFirstItemOnOpenRef.current = event.detail === 0;
              floating.position();
            }
            setOpen((value) => !value);
          }}
          ref={floating.triggerRef}
          type="button"
        >
          <Funnel aria-hidden="true" size={14} />
          {activeCount > 0 ? <span>{activeCount}</span> : null}
        </button>
        <FloatingFilterMenu
          activeFilterTagIds={props.activeFilterTagIds}
          menuRef={floating.menuRef}
          onActiveFilterTagIdsChange={props.onActiveFilterTagIdsChange}
          open={open}
          ownerId={floating.ownerId}
          style={floating.style}
          tags={props.tags}
          triggerRef={floating.triggerRef}
        />
      </div>
    </div>
  );
}

export function AnnotationTemplateQueryResults(props: { children: ReactNode; loading: boolean }) {
  return (
    <div
      aria-busy={props.loading}
      className="min-h-[var(--sniptale-preset-list-max-height,96px)]"
      data-ui="shared.annotation-template-query.results"
    >
      <div className={props.loading ? 'invisible' : undefined}>{props.children}</div>
    </div>
  );
}

export function AnnotationTemplateQueryEmpty(props: {
  hasFilter: boolean;
  onClearFilter: () => void;
  onClearQuery: () => void;
  query: string;
}) {
  return (
    <div className="grid justify-items-center gap-2 py-4 text-center text-xs text-[var(--sniptale-color-text-muted)]">
      <span>{translate('highlighter.templateTags.noMatches')}</span>
      <span className="flex gap-2">
        {props.query ? (
          <button
            className="text-[var(--sniptale-color-accent)]"
            onClick={props.onClearQuery}
            type="button"
          >
            {translate('highlighter.templateTags.clearSearch')}
          </button>
        ) : null}
        {props.hasFilter ? (
          <button
            className="text-[var(--sniptale-color-accent)]"
            onClick={props.onClearFilter}
            type="button"
          >
            {translate('highlighter.templateTags.clearFilter')}
          </button>
        ) : null}
      </span>
    </div>
  );
}
