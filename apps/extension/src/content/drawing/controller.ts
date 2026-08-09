import { useEffect, useMemo, useState } from 'react';
import {
  createDefaultDrawingToolDefaults,
  DEFAULT_DRAWING_COLORS,
  type DrawingSession,
  type DrawingSessionSnapshot,
} from '../../features/drawing/public';
import {
  loadDrawingPaletteState,
  subscribeToDrawingPaletteState,
} from '../../composition/persistence/drawing-palette';
import { resolvePageScrollRoot, type PageScrollRoot } from '../platform/page-scroll';
import { createPagePreparationDrawingSession } from './history';

export interface ContentDrawingController {
  readonly session: DrawingSession;
  getPalette(): readonly string[];
  applyPalette(colors: readonly string[]): void;
  getScrollRoot(): PageScrollRoot;
  prepareActivation(): boolean;
  registerInteractionFinalizer(finalizer: (() => void) | null): void;
  finalizeInteraction(): void;
}

export function useDrawingSessionSnapshot(session: DrawingSession): DrawingSessionSnapshot {
  const [snapshot, setSnapshot] = useState(() => session.getSnapshot());
  useEffect(() => session.subscribe(() => setSnapshot(session.getSnapshot())), [session]);
  return snapshot;
}

export function useContentDrawingController(): ContentDrawingController {
  const controller = useMemo<ContentDrawingController>(() => {
    const session = createPagePreparationDrawingSession();
    let root: PageScrollRoot = { kind: 'viewport', element: null };
    let palette: readonly string[] = [...DEFAULT_DRAWING_COLORS];
    let finalizer: (() => void) | null = null;
    return {
      session,
      getPalette: () => palette,
      applyPalette(colors) {
        palette = [...colors];
        session.setDefaults(createDefaultDrawingToolDefaults(palette));
      },
      getScrollRoot: () => root,
      prepareActivation() {
        try {
          root = resolvePageScrollRoot();
          return true;
        } catch {
          return false;
        }
      },
      registerInteractionFinalizer(next) {
        finalizer = next;
      },
      finalizeInteraction() {
        finalizer?.();
        session.select(null);
      },
    };
  }, []);

  useEffect(() => {
    let active = true;
    let observedChange = false;
    const applyPalette = (colors: readonly string[]) => {
      if (active) {
        controller.applyPalette(colors);
      }
    };
    void loadDrawingPaletteState()
      .then((state) => {
        if (!observedChange) applyPalette(state.colors);
      })
      .catch(() => undefined);
    const unsubscribe = subscribeToDrawingPaletteState((state) => {
      observedChange = true;
      applyPalette(state.colors);
    });
    return () => {
      active = false;
      unsubscribe();
      controller.session.dispose();
    };
  }, [controller]);

  return controller;
}
