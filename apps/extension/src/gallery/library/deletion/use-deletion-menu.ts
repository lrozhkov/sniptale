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
  const [pending, setPending] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', width: 300 });

  const dismiss = useCallback(() => {
    liveRef.current = false;
    const focusInside = surfaceRef.current?.contains(document.activeElement);
    closeRef.current();
    if (focusInside && request.anchor?.isConnected) request.anchor.focus();
  }, [request]);

  useEffect(() => {
    if (request.contextKey !== contextKey) dismiss();
  }, [contextKey, request, dismiss]);

  useEffect(() => {
    liveRef.current = true;
    generationRef.current += 1;
    pendingRef.current = false;
    setPrepared(null);
    setPending(false);
    const surface = surfaceRef.current;
    if (!surface) return;
    const unbindPosition = bindDeletionMenuPosition(surface, request.anchor, setStyle);
    const unbindInteraction = bindDeletionMenuInteractions(
      surface,
      request.anchor,
      request.keyboard,
      dismiss
    );
    return () => {
      liveRef.current = false;
      generationRef.current += 1;
      unbindPosition();
      unbindInteraction();
    };
  }, [request, dismiss]);

  const run = async (action: () => Promise<boolean>) => {
    if (pendingRef.current || !liveRef.current) return;
    const generation = generationRef.current;
    pendingRef.current = true;
    setPending(true);
    try {
      if (await action()) {
        if (liveRef.current && generation === generationRef.current) dismiss();
      }
    } finally {
      if (generation === generationRef.current) {
        pendingRef.current = false;
        if (liveRef.current) setPending(false);
      }
    }
  };
  const activatePermanent = async () => {
    if (prepared) return run(prepared.confirm);
    if (pendingRef.current || !liveRef.current) return;
    const generation = generationRef.current;
    pendingRef.current = true;
    setPending(true);
    try {
      const result = await request.preparePermanent();
      if (liveRef.current && generation === generationRef.current) setPrepared(result);
    } finally {
      if (generation === generationRef.current) {
        pendingRef.current = false;
        if (liveRef.current) setPending(false);
      }
    }
  };
  return { surfaceRef, style, prepared, pending, run, activatePermanent };
}
