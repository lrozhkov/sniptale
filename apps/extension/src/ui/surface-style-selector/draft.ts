import { useEffect, useRef, useState } from 'react';
import type { SurfaceStyle } from '@sniptale/runtime-contracts/highlighter/surface-style';
import {
  areSurfaceStylesEqual,
  cloneSurfaceStyle,
} from '../../features/highlighter/surface-style/style';

export function useSurfaceStyleDraft(value: SurfaceStyle, open: boolean, disabled: boolean) {
  const [draft, setDraft] = useState(() => cloneSurfaceStyle(value));
  const previous = useRef(value);
  useEffect(() => {
    // Equivalent host projections must not overwrite an unapplied selection.
    const changed = !areSurfaceStylesEqual(previous.current, value);
    previous.current = value;
    if (changed || !open || disabled) setDraft(cloneSurfaceStyle(value));
  }, [disabled, open, value]);
  return { draft, setDraft };
}
