import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_DRAWING_COLORS,
  type DrawingSession,
  type DrawingObject,
  type DrawingSessionSnapshot,
} from '../../features/drawing/public';
import { resolvePageScrollRoot, type PageScrollRoot } from '../platform/page-scroll';
import { createPagePreparationDrawingSession } from './history';
import { synchronizeContentDrawingPreferences } from './preferences';
import { createDrawingLayout } from './layout';

export { synchronizeContentDrawingPreferences } from './preferences';

export interface ContentDrawingController {
  readonly session: DrawingSession;
  getPalette(): readonly string[];
  applyPalette(colors: readonly string[]): void;
  getScrollRoot(): PageScrollRoot;
  getObjectAnchor?(object: DrawingObject): Element | null;
  subscribeLayoutChanges?(listener: () => void): () => void;
  prepareActivation(): boolean;
  registerInteractionFinalizer(finalizer: (() => void) | null): void;
  finalizeInteraction(): void;
  hasPendingTextChange?(): boolean;
  setPendingTextChange?(pending: boolean): void;
  subscribePendingTextChange?(listener: () => void): () => void;
}

export function useDrawingSessionSnapshot(session: DrawingSession): DrawingSessionSnapshot {
  const [, setSnapshot] = useState(() => session.getSnapshot());
  useEffect(() => session.subscribe(() => setSnapshot(session.getSnapshot())), [session]);
  return session.getSnapshot();
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
  suppliedSession?: DrawingSession
): ContentDrawingController {
  let root: PageScrollRoot = { kind: 'viewport', element: null };
  const layout = suppliedSession ? null : createDrawingLayout(() => root);
  const session =
    suppliedSession ?? createPagePreparationDrawingSession(undefined, layout ?? undefined);
  let palette: readonly string[] = [...DEFAULT_DRAWING_COLORS];
  let finalizer: (() => void) | null = null;
  let pendingTextChange = false;
  const pendingTextListeners = new Set<() => void>();
  return {
    session,
    ...(layout
      ? { getObjectAnchor: layout.getAnchor, subscribeLayoutChanges: layout.subscribe }
      : {}),
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
    hasPendingTextChange: () => pendingTextChange,
    setPendingTextChange(pending) {
      if (pendingTextChange === pending) return;
      pendingTextChange = pending;
      pendingTextListeners.forEach((listener) => listener());
    },
    subscribePendingTextChange(listener) {
      pendingTextListeners.add(listener);
      return () => pendingTextListeners.delete(listener);
    },
  };
}
