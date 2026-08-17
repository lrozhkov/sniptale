import { Check } from 'lucide-react';
import type { CSSProperties, Dispatch, RefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  AnnotationTemplateTag,
  AnnotationTemplateTagId,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { resolveThemeSafePortalTarget } from '@sniptale/ui/theme/safe-portal';
import { translate } from '../../platform/i18n';
import { getAnnotationTemplateTagDisplayName } from './tag-display-name';

const MENU_WIDTH = 208;
const MENU_MAX_HEIGHT = 224;
const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;

function resolveMenuStyle(trigger: DOMRect): CSSProperties {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const width = Math.min(MENU_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(trigger.right - width, viewportWidth - width - VIEWPORT_MARGIN)
  );
  const roomBelow = viewportHeight - trigger.bottom - MENU_GAP - VIEWPORT_MARGIN;
  const roomAbove = trigger.top - MENU_GAP - VIEWPORT_MARGIN;
  const openAbove = roomBelow < Math.min(MENU_MAX_HEIGHT, roomAbove);
  const availableHeight = Math.max(72, openAbove ? roomAbove : roomBelow);
  const maxHeight = Math.min(MENU_MAX_HEIGHT, availableHeight);

  return {
    left,
    maxHeight,
    top: openAbove
      ? Math.max(VIEWPORT_MARGIN, trigger.top - MENU_GAP - maxHeight)
      : trigger.bottom + MENU_GAP,
    width,
  };
}

export function useFloatingFilterMenu(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const ownerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusFirstItemOnOpenRef = useRef(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const position = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger) setStyle(resolveMenuStyle(trigger.getBoundingClientRect()));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    if (focusFirstItemOnOpenRef.current) {
      queueMicrotask(() =>
        menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
      );
    }
    focusFirstItemOnOpenRef.current = false;
    const portalRoot = menuRef.current?.getRootNode();
    const localEventTarget =
      portalRoot instanceof ShadowRoot || portalRoot instanceof Document ? portalRoot : document;
    const onPointerDown = (event: Event) => {
      const root = rootRef.current;
      const menu = menuRef.current;
      const path = event.composedPath();
      if (root && !path.includes(root) && (!menu || !path.includes(menu))) setOpen(false);
    };
    const onKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent) || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      queueMicrotask(() => triggerRef.current?.focus());
    };
    localEventTarget.addEventListener('pointerdown', onPointerDown, true);
    localEventTarget.addEventListener('keydown', onKeyDown, true);
    return () => {
      localEventTarget.removeEventListener('pointerdown', onPointerDown, true);
      localEventTarget.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, setOpen]);

  return { focusFirstItemOnOpenRef, menuRef, ownerId, position, rootRef, style, triggerRef };
}

type FloatingFilterMenuProps = {
  activeFilterTagIds: readonly AnnotationTemplateTagId[];
  clearLabel?: string;
  maximumSelected?: number;
  menuRef: RefObject<HTMLDivElement | null>;
  onActiveFilterTagIdsChange: (tagIds: AnnotationTemplateTagId[]) => void;
  open: boolean;
  ownerId: string;
  style: CSSProperties | null;
  tags: readonly AnnotationTemplateTag[];
  triggerRef: RefObject<HTMLButtonElement | null>;
};

function FilterMenuOption(props: {
  active: boolean;
  disabled: boolean;
  onToggle(): void;
  tag: AnnotationTemplateTag;
}) {
  return (
    <button
      aria-checked={props.active}
      className={[
        'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
        props.active
          ? 'bg-[var(--sniptale-color-accent-soft)] text-[var(--sniptale-color-accent-emphasis)]'
          : 'hover:bg-[var(--sniptale-color-surface-hover)]',
      ].join(' ')}
      data-active={props.active ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={props.onToggle}
      role="menuitemcheckbox"
      type="button"
    >
      <span aria-hidden="true" className="w-4">
        {props.active ? <Check size={13} /> : null}
      </span>
      <span className="truncate">{getAnnotationTemplateTagDisplayName(props.tag)}</span>
    </button>
  );
}

function FilterMenuContent(
  props: Pick<
    FloatingFilterMenuProps,
    'activeFilterTagIds' | 'clearLabel' | 'maximumSelected' | 'onActiveFilterTagIdsChange' | 'tags'
  >
) {
  const activeFilterTagIdsRef = useRef<readonly AnnotationTemplateTagId[]>(
    props.activeFilterTagIds
  );
  activeFilterTagIdsRef.current = props.activeFilterTagIds;
  const toggle = (tagId: AnnotationTemplateTagId) => {
    const activeFilterTagIds = activeFilterTagIdsRef.current;
    if (
      !activeFilterTagIds.includes(tagId) &&
      props.maximumSelected !== undefined &&
      activeFilterTagIds.length >= props.maximumSelected
    ) {
      return;
    }
    const next = activeFilterTagIds.includes(tagId)
      ? activeFilterTagIds.filter((id) => id !== tagId)
      : [...activeFilterTagIds, tagId];
    activeFilterTagIdsRef.current = next;
    props.onActiveFilterTagIdsChange(next);
  };
  const clear = () => {
    activeFilterTagIdsRef.current = [];
    props.onActiveFilterTagIdsChange([]);
  };

  return (
    <>
      {props.tags.map((tag) => (
        <FilterMenuOption
          active={props.activeFilterTagIds.includes(tag.id)}
          disabled={
            !props.activeFilterTagIds.includes(tag.id) &&
            props.maximumSelected !== undefined &&
            props.activeFilterTagIds.length >= props.maximumSelected
          }
          key={tag.id}
          onToggle={() => toggle(tag.id)}
          tag={tag}
        />
      ))}
      {props.activeFilterTagIds.length > 0 ? (
        <button
          className={[
            'mt-1 w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
            'text-[var(--sniptale-color-accent)]',
            'hover:bg-[var(--sniptale-color-surface-hover)] hover:text-[var(--sniptale-color-accent-emphasis)]',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
          ].join(' ')}
          onClick={clear}
          type="button"
        >
          {props.clearLabel ?? translate('highlighter.templateTags.clearFilter')}
        </button>
      ) : null}
    </>
  );
}

export function FloatingFilterMenu(props: FloatingFilterMenuProps) {
  const portalTarget =
    typeof document === 'undefined' ? null : resolveThemeSafePortalTarget(props.triggerRef.current);
  if (!props.open || !props.style || !portalTarget) return null;

  return createPortal(
    <div
      className={[
        'pointer-events-auto fixed z-[2147483647] overflow-y-auto overscroll-contain',
        'cursor-default rounded-xl border p-1.5',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] shadow-xl',
      ].join(' ')}
      data-ui="shared.annotation-template-query.filter-menu"
      data-floating-ui-owned-by={props.ownerId}
      data-floating-ui-root="true"
      role="menu"
      ref={props.menuRef}
      style={props.style}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <FilterMenuContent
        activeFilterTagIds={props.activeFilterTagIds}
        {...(props.clearLabel === undefined ? {} : { clearLabel: props.clearLabel })}
        {...(props.maximumSelected === undefined ? {} : { maximumSelected: props.maximumSelected })}
        onActiveFilterTagIdsChange={props.onActiveFilterTagIdsChange}
        tags={props.tags}
      />
    </div>,
    portalTarget
  );
}
