import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ReviewButton } from './controls';
import { translate } from '../../platform/i18n';

type TabMove = { animation: Animation; delta: number };
type TabMotion = {
  base: Map<HTMLElement, number>;
  before: Map<HTMLElement, number> | null;
  animations: Map<HTMLElement, TabMove>;
};

function tabMoveOffset(move: TabMove | undefined): number {
  const progress = move?.animation.effect?.getComputedTiming().progress;
  return move && progress !== null && progress !== undefined ? move.delta * (1 - progress) : 0;
}

/** Base positions exclude the transforms owned by this navigation and its viewport origin. */
function tabBasePositions(element: HTMLElement, moves: TabMotion['animations']) {
  const origin = element.getBoundingClientRect().left;
  return new Map(
    [...element.querySelectorAll<HTMLElement>('[data-inspector-tab-motion]')].map((node) => [
      node,
      node.getBoundingClientRect().left - origin - tabMoveOffset(moves.get(node)),
    ])
  );
}

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
  const [expandedLabels, setExpandedLabels] = useState(false);
  const [focusRevision, setFocusRevision] = useState(0);
  const pendingFocus = useRef<string | null>(null);
  const motion = useRef<TabMotion>({ base: new Map(), before: null, animations: new Map() });
  const itemsKey = JSON.stringify(items.map((item) => item.id));
  const labelsKey = JSON.stringify(items.map((item) => item.label));
  useLayoutEffect(() => {
    const element = navigation.current;
    if (!element) return;
    const fit = () => {
      const canvas = document.createElement('canvas').getContext('2d');
      if (!canvas) return;
      const availableWidth = element.clientWidth;
      if (!availableWidth) return;
      const label = element.querySelector('.review-inspector-tab-label');
      if (!label) return;
      canvas.font = getComputedStyle(label).font;
      const labels: unknown = JSON.parse(labelsKey);
      if (
        !Array.isArray(labels) ||
        !labels.every((value): value is string => typeof value === 'string')
      )
        return;
      const widths = labels.map((text) =>
        Math.max(88, Math.ceil(canvas.measureText(text).width) + 36)
      );
      const slots = element.querySelectorAll<HTMLElement>('[data-inspector-tab-motion]');
      slots.forEach((slot, index) =>
        slot.style.setProperty('--review-tab-caption-width', `${widths[index]}px`)
      );
      setExpandedLabels(
        widths.reduce((sum, width) => sum + width, 0) + (widths.length - 1) * 2 <= availableWidth
      );
    };
    fit();
    const refresh = () => {
      fit();
      motion.current.base = tabBasePositions(element, motion.current.animations);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
    observer?.observe(element);
    let disposed = false;
    void document.fonts?.ready.then(() => {
      if (!disposed) refresh();
    });
    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, [labelsKey, itemsKey]);
  useLayoutEffect(() => {
    const before = motion.current.before;
    motion.current.before = null;
    const element = navigation.current;
    const base = element
      ? tabBasePositions(element, motion.current.animations)
      : new Map<HTMLElement, number>();
    motion.current.base = base;
    if (
      !before ||
      items.length > 8 ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const moves: { node: HTMLElement; delta: number }[] = [];
    for (const [node, left] of base) {
      if (node.dataset['active'] === 'true') continue;
      const previous = before.get(node);
      if (previous === undefined || typeof node.animate !== 'function') continue;
      const delta = previous - left;
      if (Math.abs(delta) < 0.25) continue;
      moves.push({ node, delta });
    }
    for (const { node, delta } of moves) {
      const animation = node.animate(
        [{ transform: `translateX(${delta}px)` }, { transform: 'translateX(0)' }],
        { duration: 100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
      motion.current.animations.set(node, { animation, delta });
    }
  }, [value, items.length, itemsKey, labelsKey, expandedLabels]);
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === null || target !== value) return;
    const button = [
      ...(navigation.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []),
    ].find((button) => button.id === `${id}-${target}-tab`);
    if (button && button.ownerDocument.activeElement !== button)
      button.focus({ preventScroll: true });
  }, [value, itemsKey, id, focusRevision]);
  useEffect(
    () => () => {
      for (const { animation } of motion.current.animations.values()) animation.cancel();
      motion.current.animations.clear();
      motion.current.base.clear();
      motion.current.before = null;
      pendingFocus.current = null;
    },
    []
  );
  const choose = (next: string) => {
    if (next === value) return;
    // Native progress includes the owned easing; command capture needs no layout read.
    motion.current.before = new Map(
      [...motion.current.base].map(([node, left]) => [
        node,
        left + tabMoveOffset(motion.current.animations.get(node)),
      ])
    );
    for (const { animation } of motion.current.animations.values()) animation.cancel();
    motion.current.animations.clear();
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
        data-expanded-labels={expandedLabels ? 'true' : undefined}
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
          const target = items[next]!.id;
          const button =
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
          if (target === value && button === button?.ownerDocument.activeElement) return;
          pendingFocus.current = target;
          setFocusRevision((revision) => revision + 1);
          choose(target);
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
