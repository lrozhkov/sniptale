import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { useEditorController } from '../../application/controller-context';
import { useEditorVectorLibrarySession } from '../../application/vector-elements/context';
import type { EditorVectorCatalogEntry } from '../../application/vector-elements/session';
import { beginEditorVectorPlacement, type EditorVectorPlacementGhost } from './placement';
import { getEditorVectorPresentation, type EditorIconAppearance } from './presentation';

export function useElementsPlacement(appearance: boolean | EditorIconAppearance = false) {
  const session = useEditorVectorLibrarySession(),
    controller = useEditorController();
  const [inserting, setInserting] = useState(false),
    [error, setError] = useState(false);
  const [ghost, setGhost] = useState<EditorVectorPlacementGhost | null>(null);
  const cancelPlacement = useRef<(() => void) | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelPlacement.current?.();
    };
  }, [session]);
  async function add(entry: EditorVectorCatalogEntry) {
    const definition = entry.definition;
    if (!definition || inserting) return;
    const canvas = controller.canvas,
      source = controller.source;
    setInserting(true);
    setError(false);
    try {
      const accepted = await controller.insertVectorElement(
        definition,
        undefined,
        getEditorVectorPresentation(definition, appearance).colors,
        getEditorVectorPresentation(definition, appearance)
      );
      if (accepted) await session.used(definition);
      else if (mounted.current && controller.canvas === canvas && controller.source === source)
        setError(true);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setInserting(false);
    }
  }
  function beginPlacement(event: PointerEvent<HTMLButtonElement>, entry: EditorVectorCatalogEntry) {
    session.select(entry.key);
    const definition = entry.definition;
    if (!definition) return;
    const boundary = document.querySelector<HTMLElement>(
      '[data-ui="editor.canvas.document-boundary"]'
    );
    if (!boundary) return;
    cancelPlacement.current?.();
    cancelPlacement.current = beginEditorVectorPlacement({
      event: event.nativeEvent,
      definition,
      presentation: getEditorVectorPresentation(definition, appearance),
      controller,
      boundary,
      onGhost: setGhost,
      onInserted: () => {
        void session.used(definition);
      },
      onFailure: () => setError(true),
    });
  }
  return { add, beginPlacement, ghost, inserting, error, clearError: () => setError(false) };
}

export function EditorElementsPlacementGhost({
  ghost,
  anchor,
}: {
  ghost: EditorVectorPlacementGhost | null;
  anchor: HTMLElement | null;
}) {
  const theme = useResolvedPortalTheme(anchor);
  return ghost
    ? createPortal(
        <img
          src={ghost.presentation.previewUrl}
          alt=""
          data-ui="editor.elements.placement-ghost"
          data-theme={theme ?? undefined}
          className={[
            'pointer-events-none fixed z-[100] h-12 w-12',
            '-translate-x-1/2 -translate-y-1/2 object-contain opacity-70',
          ].join(' ')}
          style={{ left: ghost.x, top: ghost.y }}
        />,
        resolveThemeSafePortalTarget(anchor)
      )
    : null;
}
