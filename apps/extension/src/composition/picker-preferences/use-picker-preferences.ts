import { usePaletteNames } from './use-palette-names';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadPickerCatalog,
  savePickerCatalog,
  subscribePickerCatalog,
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
  const catalog = useCatalogPreference();
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
    ...catalog,
    compact: density === undefined ? rememberedCompact : density === 'compact',
    setCompact,
    recentColors,
    rememberColor,
  };
}

/** Failed advisory writes retain the current choice until the runtime ends. */
function useCatalogPreference() {
  const [catalogMode, setCatalogMode] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const revision = generation.current;
    void loadPickerCatalog()
      .then((value) => {
        if (active && generation.current === revision) setCatalogMode(value);
      })
      .catch(() => undefined);
    const stop = subscribePickerCatalog((value) => {
      if (!active) return;
      generation.current += 1;
      setCatalogMode(value);
    });
    return () => {
      active = false;
      stop();
    };
  }, []);
  const setCatalog = useCallback((value: boolean) => {
    generation.current += 1;
    setCatalogMode(value);
    void savePickerCatalog(value).catch(() => undefined);
  }, []);
  return { catalogMode, setCatalogMode: setCatalog };
}
