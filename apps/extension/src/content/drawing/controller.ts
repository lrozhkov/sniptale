import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_DRAWING_COLORS,
  type DrawingSession,
  type DrawingSessionSnapshot,
} from '../../features/drawing/public';
import { resolvePageScrollRoot, type PageScrollRoot } from '../platform/page-scroll';
import { createPagePreparationDrawingSession } from './history';
import { synchronizeContentDrawingPreferences } from './preferences';

export { synchronizeContentDrawingPreferences } from './preferences';

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
  const controller = useMemo(() => createContentDrawingController(), []);

  useEffect(() => {
    const unsubscribe = synchronizeContentDrawingPreferences(controller);
    return () => {
      unsubscribe();
      controller.session.dispose();
    };
  }, [controller]);

  return controller;
}

export function createContentDrawingController(
  session: DrawingSession = createPagePreparationDrawingSession()
): ContentDrawingController {
  let root: PageScrollRoot = { kind: 'viewport', element: null };
  let palette: readonly string[] = [...DEFAULT_DRAWING_COLORS];
  let finalizer: (() => void) | null = null;
  return {
    session,
    getPalette: () => palette,
    applyPalette(colors) {
      palette = [...colors];
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
}
