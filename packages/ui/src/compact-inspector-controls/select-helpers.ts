import type { CSSProperties } from 'react';
import type { CompactSelectOption } from './select-types';

export function getNextEnabledIndex<T extends string>(
  options: readonly CompactSelectOption<T>[],
  startIndex: number,
  direction: 1 | -1
) {
  if (options.length === 0) {
    return -1;
  }

  for (let offset = 0; offset < options.length; offset += 1) {
    const index = (startIndex + options.length + offset * direction) % options.length;
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
}

export function getSelectedIndex<T extends string>(
  options: readonly CompactSelectOption<T>[],
  value: T | ''
) {
  return options.findIndex((option) => option.value === value);
}

export function resolveCompactSelectMenuStyle(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const gap = 5;
  const viewportPadding = 8;
  const viewportWidth = window.innerWidth || rect.right + viewportPadding;
  const belowRoom = window.innerHeight - rect.bottom - viewportPadding;
  const aboveRoom = rect.top - viewportPadding;
  const placeAbove = belowRoom < 104 && aboveRoom > belowRoom;
  const maxHeight = Math.max(96, Math.min(208, placeAbove ? aboveRoom - gap : belowRoom - gap));
  const width = Math.min(
    Math.max(rect.width, 144),
    Math.max(96, viewportWidth - viewportPadding * 2)
  );
  const left = Math.min(
    Math.max(rect.left, viewportPadding),
    Math.max(viewportPadding, viewportWidth - viewportPadding - width)
  );

  return {
    left,
    top: placeAbove ? rect.top - gap : rect.bottom + gap,
    transform: placeAbove ? 'translateY(-100%)' : undefined,
    width,
    maxHeight,
  };
}
