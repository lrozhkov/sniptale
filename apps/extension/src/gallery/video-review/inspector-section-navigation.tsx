import { useEffect, useLayoutEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ReviewButton } from './controls';
import { translate } from '../../platform/i18n';

/** One gallery-owned row for lane and item sections; the active surface never translates. */
export function ReviewInspectorSectionNavigation({
  id,
  value,
  items,
  onChange,
  label = translate('gallery.videoReview.trackSections'),
}: {
  id: string;
  value: string;
  items: readonly { id: string; label: string; icon: LucideIcon }[];
  onChange(value: string): void;
  label?: string;
}) {
  const navigation = useRef<HTMLDivElement>(null);
  const motion = useRef<{ before: Map<HTMLElement, number> | null; animations: Animation[] }>({
    before: null,
    animations: [],
  });
  useLayoutEffect(() => {
    const before = motion.current.before;
    motion.current.before = null;
    if (
      !before ||
      items.length > 8 ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return;
    for (const node of navigation.current?.querySelectorAll<HTMLElement>(
      '[data-inspector-tab-motion]'
    ) ?? []) {
      if (node.dataset['active'] === 'true') continue;
      const previous = before.get(node);
      if (previous === undefined || typeof node.animate !== 'function') continue;
      const delta = previous - node.getBoundingClientRect().left;
      if (Math.abs(delta) < 0.25) continue;
      motion.current.animations.push(
        node.animate([{ transform: `translateX(${delta}px)` }, { transform: 'translateX(0)' }], {
          duration: 100,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        })
      );
    }
  }, [value, items.length]);
  useEffect(
    () => () => {
      for (const animation of motion.current.animations) animation.cancel();
      motion.current.before = null;
    },
    []
  );
  const choose = (next: string) => {
    if (next === value) return;
    // Capture the visible positions before cancelling an interrupted move.
    motion.current.before = new Map(
      [
        ...(navigation.current?.querySelectorAll<HTMLElement>('[data-inspector-tab-motion]') ?? []),
      ].map((node) => [node, node.getBoundingClientRect().left])
    );
    for (const animation of motion.current.animations) animation.cancel();
    motion.current.animations = [];
    onChange(next);
  };
  if (items.length <= 1) return null;
  return (
    <div
      className={`mb-2 min-w-0 max-w-full shrink-0 overflow-x-clip
        border-b border-[var(--sniptale-color-border-soft)] pb-2`}
      data-ui="gallery.videoReview.inspectorSectionNavigation"
    >
      <div
        ref={navigation}
        role="tablist"
        aria-label={label}
        className="review-inspector-tabs"
        data-multirow={items.length > 8 ? 'true' : undefined}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          const index = items.findIndex((item) => item.id === value);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
          choose(items[next]!.id);
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}
      >
        {items.map(({ id: sectionId, label, icon: Glyph }) => (
          <span
            key={sectionId}
            role="presentation"
            className="review-inspector-tab-motion"
            data-active={value === sectionId ? 'true' : undefined}
            data-inspector-tab-motion={sectionId}
          >
            <ReviewButton
              id={`${id}-${sectionId}-tab`}
              role="tab"
              aria-selected={value === sectionId}
              aria-controls={`${id}-${sectionId}`}
              tabIndex={value === sectionId ? 0 : -1}
              label={label}
              onClick={() => choose(sectionId)}
              className="review-inspector-tab"
            >
              <Glyph size={15} aria-hidden="true" />
              <span aria-hidden="true" className="review-inspector-tab-label">
                {label}
              </span>
            </ReviewButton>
          </span>
        ))}
      </div>
    </div>
  );
}
