import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isGalleryMediaItem, type GalleryItem } from '../items';
import type { GalleryPreviewPresentation } from '../types';

type PreviewTransitionDirection = -1 | 0 | 1;
interface PreviewTransitionFrame {
  direction: PreviewTransitionDirection;
  item: GalleryItem;
  naturalSize: { height: number; width: number } | null;
  previewUrl: string | null;
  revision: number;
  requestKey: string;
}

/** Keeps the last decoded frame while the selected request prepares its replacement. */
export function usePreviewMediaTransition(args: {
  item: GalleryItem;
  navigationPosition: number | undefined;
  previewUrl: string | null;
  loadStatus?: 'loading' | 'ready' | 'missing' | 'error' | undefined;
  requestRevision?: number | undefined;
  onPresented?: ((presentation: GalleryPreviewPresentation) => void) | undefined;
}) {
  const requestKey = `${args.requestRevision ?? 0}:${args.item.id}:${args.previewUrl ?? ''}`;
  const request = useRef(requestKey);
  request.current = requestKey;
  const callback = useRef(args.onPresented);
  callback.current = args.onPresented;
  const [frame, setFrame] = useState<PreviewTransitionFrame | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const previousPosition = useRef(args.navigationPosition);
  const direction = useRef<PreviewTransitionDirection>(0);
  const media = isGalleryMediaItem(args.item);
  const terminal = media && (args.loadStatus === 'missing' || args.loadStatus === 'error');
  const invalid = failure === requestKey;
  const pending = !terminal && !invalid && frame?.requestKey !== requestKey;
  const video =
    media &&
    (args.item.kind === 'video' || args.item.kind === 'recording') &&
    args.previewUrl !== null;
  const { item, previewUrl, navigationPosition, loadStatus, requestRevision } = args;
  const commit = useCallback(
    (naturalSize: PreviewTransitionFrame['naturalSize']) => {
      if (request.current !== requestKey) return;
      setFrame((current) =>
        current?.requestKey === requestKey
          ? current
          : {
              item,
              previewUrl,
              naturalSize,
              direction: current?.item.id === item.id ? 0 : direction.current,
              revision: (current?.revision ?? 0) + 1,
              requestKey,
            }
      );
    },
    [item, previewUrl, requestKey]
  );
  const fail = useCallback(() => {
    if (request.current === requestKey) setFailure(requestKey);
  }, [requestKey]);

  useEffect(() => {
    const position = navigationPosition;
    const previous = previousPosition.current;
    if (position !== undefined && previous !== undefined && position !== previous) {
      direction.current = position > previous ? 1 : -1;
    }
    previousPosition.current = position;
    if (terminal || invalid) {
      setFrame(null);
      return;
    }
    if (media && (!previewUrl || loadStatus === 'loading')) return;
    if (video) return;
    let disposed = false;
    if (
      media &&
      previewUrl &&
      (item.kind === 'image' || item.kind === 'screenshot' || item.kind === 'web-archive')
    ) {
      const image = new Image();
      image.onload = () => {
        if (!disposed) commit({ height: image.naturalHeight, width: image.naturalWidth });
      };
      image.onerror = () => {
        if (!disposed) fail();
      };
      image.src = previewUrl;
      return () => {
        disposed = true;
        image.onload = null;
        image.onerror = null;
        image.src = '';
      };
    }
    commit(null);
    return () => {
      disposed = true;
    };
  }, [
    terminal,
    invalid,
    loadStatus,
    media,
    video,
    navigationPosition,
    previewUrl,
    item.kind,
    commit,
    fail,
  ]);

  const outcome = terminal || invalid ? 'terminal' : pending ? null : 'presented';
  useEffect(() => {
    if (outcome)
      callback.current?.({
        requestRevision: requestRevision ?? 0,
        url: outcome === 'presented' ? previewUrl : null,
        outcome,
      });
  }, [requestKey, outcome, requestRevision, previewUrl]);
  return {
    frame: terminal || invalid ? null : frame,
    pending,
    invalid,
    commitVideo: () => commit(null),
    fail,
    prepareVideo: video && pending && args.loadStatus !== 'loading',
  };
}

export function usePreviewMediaTransitionAnimation(
  elementRef: RefObject<HTMLDivElement | null>,
  frame: PreviewTransitionFrame | null
) {
  const direction = frame?.direction ?? 0;
  const revision = frame?.revision ?? 0;
  const hasFrame = frame !== null;
  useEffect(() => {
    const element = elementRef.current;
    if (!hasFrame) return;
    if (!element?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    const offset = direction * 18;
    const animation = element.animate(
      [
        {
          opacity: direction === 0 ? 0.88 : 0.82,
          transform: `translate3d(${offset}px, 0, 0)`,
        },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ],
      {
        duration: 260,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'both',
      }
    );

    return () => animation.cancel();
  }, [elementRef, direction, revision, hasFrame]);
}
