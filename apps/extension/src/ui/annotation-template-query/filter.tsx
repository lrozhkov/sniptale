import { Funnel } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type {
  AnnotationTemplateTag,
  AnnotationTemplateTagId,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { translate } from '../../platform/i18n';
import { SearchField } from '../compact-inspector-controls/row-controls';
import { FloatingFilterMenu, useFloatingFilterMenu } from './floating-filter-menu';

const FILTER_TRIGGER_BASE_CLASS_NAME = [
  'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-[4px]',
  'border px-2 text-xs transition-colors',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
].join(' ');
const FILTER_TRIGGER_ACTIVE_CLASS_NAME = [
  'border-[var(--sniptale-color-border-strong)]',
  'bg-[var(--sniptale-color-surface-hover)]',
  'text-[var(--sniptale-color-text-primary)]',
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
      <SearchField
        className="flex-1"
        label={translate('highlighter.templateTags.searchLabel')}
        placeholder={translate('highlighter.templateTags.searchPlaceholder')}
        clearLabel={translate('highlighter.templateTags.clearSearch')}
        value={props.query}
        onChange={props.onQueryChange}
      />
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

export function AnnotationTemplateQuerySurface(props: {
  activeFilterTagIds: readonly AnnotationTemplateTagId[];
  children: ReactNode;
  disabled?: boolean;
  hasResults: boolean;
  loading: boolean;
  onActiveFilterTagIdsChange: (tagIds: AnnotationTemplateTagId[]) => void;
  onFloatingInteractionChange?: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  query: string;
  tags: readonly AnnotationTemplateTag[];
}) {
  return (
    <>
      <AnnotationTemplateQueryControls
        activeFilterTagIds={props.activeFilterTagIds}
        compact
        {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
        onActiveFilterTagIdsChange={props.onActiveFilterTagIdsChange}
        {...(props.onFloatingInteractionChange
          ? { onFloatingInteractionChange: props.onFloatingInteractionChange }
          : {})}
        onQueryChange={props.onQueryChange}
        query={props.query}
        tags={props.tags}
      />
      <AnnotationTemplateQueryResults loading={props.loading}>
        {props.hasResults ? (
          props.children
        ) : (
          <AnnotationTemplateQueryEmpty
            hasFilter={props.activeFilterTagIds.length > 0}
            onClearFilter={() => props.onActiveFilterTagIdsChange([])}
            onClearQuery={() => props.onQueryChange('')}
            query={props.query}
          />
        )}
      </AnnotationTemplateQueryResults>
    </>
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
