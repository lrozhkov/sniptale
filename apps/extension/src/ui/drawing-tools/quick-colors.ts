import { useEffect, useRef, useState } from 'react';
import {
  loadRecentColors,
  pushRecentColor,
  subscribeRecentColors,
} from '../../composition/persistence/recent-colors';

function initialQuickColors(recentColors: readonly string[], palette: readonly string[]) {
  return [...new Set([...recentColors, ...palette])].slice(0, 5);
}

function placeQuickColor(
  visibleColors: readonly string[],
  color: string | undefined,
  recentColors: readonly string[]
): readonly string[] {
  if (!color || visibleColors.some((visible) => visible.toLowerCase() === color.toLowerCase())) {
    return visibleColors;
  }
  if (visibleColors.length < 5) return [...visibleColors, color];

  let oldestIndex = visibleColors.length - 1;
  let oldestAge = -1;
  visibleColors.forEach((visible, index) => {
    const recentIndex = recentColors.findIndex(
      (recent) => recent.toLowerCase() === visible.toLowerCase()
    );
    const age = recentIndex < 0 ? Number.POSITIVE_INFINITY : recentIndex;
    if (age >= oldestAge) {
      oldestAge = age;
      oldestIndex = index;
    }
  });
  return visibleColors.map((visible, index) => (index === oldestIndex ? color : visible));
}

export function useQuickDrawingColors(
  palette: readonly string[],
  onSelect: (color: string) => void
) {
  const [quickColors, setQuickColors] = useState<readonly string[]>(() =>
    initialQuickColors([], palette)
  );
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const recentColorsRef = useRef<readonly string[]>([]);
  const recentRevisionRef = useRef(0);
  const pendingLocalColorRef = useRef<string | null>(null);
  const paletteSignature = palette.join('|');

  useEffect(() => {
    let active = true;
    const loadRevision = recentRevisionRef.current;
    void loadRecentColors().then((colors) => {
      if (active && recentRevisionRef.current === loadRevision) {
        recentColorsRef.current = colors;
        setQuickColors(initialQuickColors(colors, paletteRef.current));
      }
    });
    const unsubscribe = subscribeRecentColors((colors) => {
      if (
        pendingLocalColorRef.current !== null &&
        colors[0]?.toLowerCase() !== pendingLocalColorRef.current.toLowerCase()
      ) {
        return;
      }
      pendingLocalColorRef.current = null;
      recentRevisionRef.current += 1;
      recentColorsRef.current = colors;
      setQuickColors((current) =>
        colors.length
          ? placeQuickColor(current, colors[0], colors)
          : initialQuickColors([], paletteRef.current)
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setQuickColors(initialQuickColors(recentColorsRef.current, paletteRef.current));
  }, [paletteSignature]);

  const selectColor = (color: string) => {
    onSelect(color);
    pendingLocalColorRef.current = color;
    recentRevisionRef.current += 1;
    const recentColors = [
      color,
      ...recentColorsRef.current.filter((item) => item.toLowerCase() !== color.toLowerCase()),
    ].slice(0, 10);
    recentColorsRef.current = recentColors;
    setQuickColors((current) => placeQuickColor(current, color, recentColors));
    void pushRecentColor(color).catch(() => {
      if (pendingLocalColorRef.current?.toLowerCase() === color.toLowerCase()) {
        pendingLocalColorRef.current = null;
      }
    });
  };

  return { quickColors, selectColor };
}
