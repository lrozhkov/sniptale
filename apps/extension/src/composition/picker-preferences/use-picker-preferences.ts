import { usePaletteNames } from './use-palette-names';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadPickerCompact,
  savePickerCompact,
  subscribePickerCompact,
} from '../persistence/picker-preferences';
import {
  loadRecentColors,
  pushRecentColor,
  subscribeRecentColors,
} from '../persistence/recent-colors';

/** Density is advisory: a refused preference write never prevents editing. */
export function usePickerPreferences(density?: 'full' | 'compact') {
  const paletteNames = usePaletteNames();
  const [rememberedCompact, setRememberedCompact] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const generation = useRef(0);
  const recentGeneration = useRef(0);
  useEffect(() => {
    let active = true;
    const revision = generation.current;
    void loadPickerCompact()
      .then((value) => {
        if (active && generation.current === revision) setRememberedCompact(value);
      })
      .catch(() => undefined);
    const stop = subscribePickerCompact((value) => {
      generation.current += 1;
      setRememberedCompact(value);
    });
    return () => {
      active = false;
      stop();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const revision = recentGeneration.current;
    void loadRecentColors()
      .then((colors) => {
        if (active && recentGeneration.current === revision) setRecentColors(colors);
      })
      .catch(() => undefined);
    const stop = subscribeRecentColors((colors) => {
      if (!active) return;
      recentGeneration.current += 1;
      setRecentColors(colors);
    });
    return () => {
      active = false;
      recentGeneration.current += 1;
      stop();
    };
  }, []);
  const setCompact = useCallback((value: boolean) => {
    generation.current += 1;
    setRememberedCompact(value);
    void savePickerCompact(value).catch(() => undefined);
  }, []);
  const rememberColor = useCallback((color: string) => {
    const revision = ++recentGeneration.current;
    void pushRecentColor(color)
      .then((colors) => {
        if (recentGeneration.current === revision) setRecentColors(colors);
      })
      .catch(() => undefined);
  }, []);
  return {
    paletteNames,
    compact: density === undefined ? rememberedCompact : density === 'compact',
    setCompact,
    recentColors,
    rememberColor,
  };
}
