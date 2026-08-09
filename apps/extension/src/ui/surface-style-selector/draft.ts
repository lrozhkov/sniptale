import { useEffect, useState } from 'react';
import type { SurfaceStyle } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { cloneSurfaceStyle } from '../../features/highlighter/surface-style/style';

export function useSurfaceStyleDraft(value: SurfaceStyle, open: boolean, disabled: boolean) {
  const [draft, setDraft] = useState(() => cloneSurfaceStyle(value));
  useEffect(() => setDraft(cloneSurfaceStyle(value)), [value]);
  useEffect(() => {
    if (!open || disabled) setDraft(cloneSurfaceStyle(value));
  }, [disabled, open, value]);
  return { draft, setDraft };
}
