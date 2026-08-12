import { useLayoutEffect, useRef } from 'react';

import type { SettingsCollectionResolvedGroup } from './types';

type RowPosition = { left: number; top: number };

export function useSettingsCollectionLayoutAnimation(
  groups: readonly SettingsCollectionResolvedGroup[]
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const previousPositionsRef = useRef(new Map<string, RowPosition>());

  useLayoutEffect(() => {
    const rows = rootRef.current?.querySelectorAll<HTMLElement>('[data-settings-collection-item]');
    if (!rows) return;
    const nextPositions = new Map<string, RowPosition>();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const rootBounds = rootRef.current?.getBoundingClientRect();
    rows.forEach((row) => {
      const itemId = row.dataset['settingsCollectionItem'];
      if (!itemId) return;
      const bounds = row.getBoundingClientRect();
      const position = {
        left: bounds.left - (rootBounds?.left ?? 0),
        top: bounds.top - (rootBounds?.top ?? 0),
      };
      nextPositions.set(itemId, position);
      const previous = previousPositionsRef.current.get(itemId);
      if (!previous || reduceMotion) return;
      const deltaX = previous.left - position.left;
      const deltaY = previous.top - position.top;
      if (deltaX === 0 && deltaY === 0) return;
      row.animate?.(
        [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
      );
    });
    previousPositionsRef.current = nextPositions;
  }, [groups]);

  return rootRef;
}
