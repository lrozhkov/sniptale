import { Check, Funnel, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AnnotationTemplateTag,
  AnnotationTemplateTagId,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { translate } from '../../platform/i18n';

export function AnnotationTemplateQueryControls(props: {
  activeFilterTagIds: readonly AnnotationTemplateTagId[];
  compact?: boolean;
  disabled?: boolean;
  onActiveFilterTagIdsChange: (tagIds: AnnotationTemplateTagId[]) => void;
  onQueryChange: (query: string) => void;
  query: string;
  tags: readonly AnnotationTemplateTag[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeCount = props.activeFilterTagIds.length;
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() =>
      menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
    );
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !event.composedPath().includes(root)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      queueMicrotask(() => triggerRef.current?.focus());
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);
  const toggle = (tagId: AnnotationTemplateTagId) => {
    const next = props.activeFilterTagIds.includes(tagId)
      ? props.activeFilterTagIds.filter((id) => id !== tagId)
      : [...props.activeFilterTagIds, tagId];
    props.onActiveFilterTagIdsChange(next);
  };
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
          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          placeholder={translate('highlighter.templateTags.searchPlaceholder')}
          type="search"
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
      <div className="relative" ref={rootRef}>
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={translate('highlighter.templateTags.filterLabel')}
          className={[
            'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2',
            'border-[var(--sniptale-color-border-soft)] text-xs',
          ].join(' ')}
          disabled={props.disabled || props.tags.length === 0}
          onClick={() => setOpen((value) => !value)}
          ref={triggerRef}
          type="button"
        >
          <Funnel aria-hidden="true" size={14} />
          {activeCount > 0 ? <span>{activeCount}</span> : null}
        </button>
        {open ? (
          <div
            className={[
              'absolute right-0 top-10 z-30 max-h-56 w-52 overflow-auto rounded-xl border p-1.5',
              'border-[var(--sniptale-color-border-soft)]',
              'bg-[var(--sniptale-color-surface-panel)] shadow-xl',
            ].join(' ')}
            role="menu"
            ref={menuRef}
          >
            {props.tags.map((tag) => (
              <button
                aria-checked={props.activeFilterTagIds.includes(tag.id)}
                className={[
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs',
                  'hover:bg-[var(--sniptale-color-surface-input)]',
                ].join(' ')}
                key={tag.id}
                onClick={() => toggle(tag.id)}
                role="menuitemcheckbox"
                type="button"
              >
                <span aria-hidden="true" className="w-4">
                  {props.activeFilterTagIds.includes(tag.id) ? <Check size={13} /> : null}
                </span>
                <span className="truncate">{tag.label}</span>
              </button>
            ))}
            {activeCount > 0 ? (
              <button
                className={[
                  'mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs',
                  'text-[var(--sniptale-color-accent)]',
                  'hover:bg-[var(--sniptale-color-surface-input)]',
                ].join(' ')}
                onClick={() => props.onActiveFilterTagIdsChange([])}
                type="button"
              >
                {translate('highlighter.templateTags.clearFilter')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
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
