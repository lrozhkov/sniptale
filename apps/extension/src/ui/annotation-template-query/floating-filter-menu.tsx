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
    queueMicrotask(() =>
      menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
    );
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const menu = menuRef.current;
      const path = event.composedPath();
      if (root && !path.includes(root) && (!menu || !path.includes(menu))) setOpen(false);
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
  }, [open, setOpen]);

  return { menuRef, ownerId, position, rootRef, style, triggerRef };
}

export function FloatingFilterMenu(props: {
  activeFilterTagIds: readonly AnnotationTemplateTagId[];
  menuRef: RefObject<HTMLDivElement | null>;
  onActiveFilterTagIdsChange: (tagIds: AnnotationTemplateTagId[]) => void;
  open: boolean;
  ownerId: string;
  style: CSSProperties | null;
  tags: readonly AnnotationTemplateTag[];
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const portalTarget =
    typeof document === 'undefined' ? null : resolveThemeSafePortalTarget(props.triggerRef.current);
  if (!props.open || !props.style || !portalTarget) return null;
  const toggle = (tagId: AnnotationTemplateTagId) => {
    const next = props.activeFilterTagIds.includes(tagId)
      ? props.activeFilterTagIds.filter((id) => id !== tagId)
      : [...props.activeFilterTagIds, tagId];
    props.onActiveFilterTagIdsChange(next);
  };

  return createPortal(
    <div
      className={[
        'fixed z-[2147483647] overflow-y-auto overscroll-contain rounded-xl border p-1.5',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] shadow-xl',
      ].join(' ')}
      data-ui="shared.annotation-template-query.filter-menu"
      data-floating-ui-owned-by={props.ownerId}
      role="menu"
      ref={props.menuRef}
      style={props.style}
      onMouseDown={(event) => event.stopPropagation()}
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
      {props.activeFilterTagIds.length > 0 ? (
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
    </div>,
    portalTarget
  );
}
