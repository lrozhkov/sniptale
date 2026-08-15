import { useLayoutEffect, useReducer } from 'react';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';

export function useFloatingPositionRefresh(anchorEl: HTMLElement | null): void {
  const [, refresh] = useReducer((value) => value + 1, 0);
  useLayoutEffect(() => bindFloatingInteractionPositionListeners(anchorEl, refresh), [anchorEl]);
}
