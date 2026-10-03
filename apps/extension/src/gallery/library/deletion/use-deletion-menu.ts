import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { bindDeletionMenuPosition } from './position';
import { bindDeletionMenuInteractions } from './interaction-session';
import type { GalleryDeletionRequest, GalleryPreparedDeletion } from './types';

export function useDeletionMenu(
  request: GalleryDeletionRequest,
  contextKey: string,
  onClose: () => void
) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(true);
  const pendingRef = useRef(false);
  const generationRef = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [prepared, setPrepared] = useState<GalleryPreparedDeletion | null>(null);
  const [operation, setOperation] = useState<'prepare' | 'commit' | null>(null);
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', width: 300 });

  const dismiss = useCallback(() => {
    liveRef.current = false;
    const focusInside = surfaceRef.current?.contains(document.activeElement);
    closeRef.current();
    if (focusInside && request.anchor?.isConnected) request.anchor.focus();
  }, [request]);

  const prepare = useCallback(async () => {
    if (pendingRef.current || !liveRef.current) return;
    const generation = generationRef.current;
    pendingRef.current = true;
    setOperation('prepare');
    try {
      const result = await request.preparePermanent();
      if (liveRef.current && generation === generationRef.current) {
        setPrepared(result);
        if (!result && !request.moveToTrash) dismiss();
      }
    } finally {
      if (generation === generationRef.current) {
        pendingRef.current = false;
        if (liveRef.current) setOperation(null);
      }
    }
  }, [request, dismiss]);

  useEffect(() => {
    if (request.contextKey !== contextKey) dismiss();
  }, [contextKey, request, dismiss]);

  useEffect(() => {
    if (request.contextKey !== contextKey) return;
    liveRef.current = true;
    generationRef.current += 1;
    pendingRef.current = false;
    setPrepared(null);
    setOperation(null);
    let unbind = () => {};
    if (!request.moveToTrash) {
      void prepare();
    } else if (surfaceRef.current) {
      const surface = surfaceRef.current;
      const unbindPosition = bindDeletionMenuPosition(surface, request.anchor, setStyle);
      const unbindInteraction = bindDeletionMenuInteractions(
        surface,
        request.anchor,
        request.keyboard,
        dismiss
      );
      unbind = () => {
        unbindPosition();
        unbindInteraction();
      };
    }
    return () => {
      liveRef.current = false;
      generationRef.current += 1;
      unbind();
    };
  }, [request, contextKey, dismiss, prepare]);

  const run = async (action: () => Promise<boolean>) => {
    if (pendingRef.current || !liveRef.current) return;
    const generation = generationRef.current;
    pendingRef.current = true;
    setOperation('commit');
    try {
      if (await action()) {
        if (liveRef.current && generation === generationRef.current) dismiss();
      }
    } finally {
      if (generation === generationRef.current) {
        pendingRef.current = false;
        if (liveRef.current) setOperation(null);
      }
    }
  };
  const activatePermanent = async () => {
    if (prepared) return run(prepared.confirm);
    return prepare();
  };
  return {
    surfaceRef,
    style,
    prepared,
    pending: operation !== null,
    committing: operation === 'commit',
    dismiss,
    run,
    activatePermanent,
  };
}
