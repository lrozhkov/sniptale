import { useMemo } from 'react';
import { buildColorOptions } from './helpers';

export function useColorSelectorOptions(
  palette: readonly string[] | undefined,
  recentColors: readonly string[] | undefined
) {
  return {
    normalizedPalette: useMemo(() => buildColorOptions(palette ?? []), [palette]),
    normalizedRecentColors: useMemo(() => buildColorOptions(recentColors ?? []), [recentColors]),
  };
}
