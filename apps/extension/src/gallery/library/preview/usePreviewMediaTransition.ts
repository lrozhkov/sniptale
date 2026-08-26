import { useEffect, useRef, useState, type RefObject } from 'react';
import { isGalleryMediaItem, type GalleryItem } from '../items';

type PreviewTransitionDirection = -1 | 0 | 1;

interface PreviewTransitionFrame {
  direction: PreviewTransitionDirection;
  item: GalleryItem;
  naturalSize: { height: number; width: number } | null;
  previewUrl: string | null;
  revision: number;
}

const UNRESOLVED_PREVIEW_HOLD_MS = 320;

function canRenderPreview(item: GalleryItem, previewUrl: string | null): boolean {
  return !isGalleryMediaItem(item) || previewUrl !== null;
}

function isImagePreview(item: GalleryItem, previewUrl: string | null): boolean {
  return (
    previewUrl !== null &&
    isGalleryMediaItem(item) &&
    (item.kind === 'image' || item.kind === 'screenshot' || item.kind === 'web-archive')
  );
}

function getTransitionDirection(
  previousPosition: number | undefined,
  nextPosition: number | undefined
): PreviewTransitionDirection {
  if (previousPosition === undefined || nextPosition === undefined) return 0;
  if (nextPosition > previousPosition) return 1;
  if (nextPosition < previousPosition) return -1;
  return 0;
}

export function usePreviewMediaTransition(args: {
  item: GalleryItem;
  navigationPosition: number | undefined;
  previewUrl: string | null;
}): PreviewTransitionFrame {
  const [frame, setFrame] = useState<PreviewTransitionFrame>({
    direction: 0,
    item: args.item,
    naturalSize: null,
    previewUrl: args.previewUrl,
    revision: 0,
  });
  const requestRef = useRef({ id: args.item.id, position: args.navigationPosition });
  const pendingDirectionRef = useRef<PreviewTransitionDirection>(0);

  useEffect(() => {
    const previousRequest = requestRef.current;
    const itemChanged = previousRequest.id !== args.item.id;
    if (itemChanged) {
      pendingDirectionRef.current = getTransitionDirection(
        previousRequest.position,
        args.navigationPosition
      );
    }
    requestRef.current = { id: args.item.id, position: args.navigationPosition };

    if (canRenderPreview(args.item, args.previewUrl)) {
      let disposed = false;
      const commitFrame = (naturalSize: PreviewTransitionFrame['naturalSize']) => {
        if (disposed) return;
        setFrame((current) => {
          if (current.item.id === args.item.id && current.previewUrl === args.previewUrl) {
            return current;
          }
          const direction = current.item.id === args.item.id ? 0 : pendingDirectionRef.current;
          pendingDirectionRef.current = 0;
          return {
            direction,
            item: args.item,
            naturalSize,
            previewUrl: args.previewUrl,
            revision: current.revision + 1,
          };
        });
      };

      if (isImagePreview(args.item, args.previewUrl)) {
        const image = new Image();
        image.onload = () =>
          commitFrame({
            height: image.naturalHeight,
            width: image.naturalWidth,
          });
        image.onerror = () => commitFrame(null);
        image.src = args.previewUrl ?? '';
        return () => {
          disposed = true;
          image.onload = null;
          image.onerror = null;
        };
      }

      commitFrame(null);
      return () => {
        disposed = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      setFrame((current) => {
        if (current.item.id === args.item.id) return current;
        pendingDirectionRef.current = 0;
        return {
          direction: 0,
          item: args.item,
          naturalSize: null,
          previewUrl: null,
          revision: current.revision + 1,
        };
      });
    }, UNRESOLVED_PREVIEW_HOLD_MS);

    return () => window.clearTimeout(timeoutId);
  }, [args.item, args.navigationPosition, args.previewUrl]);

  return frame;
}

export function usePreviewMediaTransitionAnimation(
  elementRef: RefObject<HTMLDivElement | null>,
  frame: PreviewTransitionFrame
) {
  useEffect(() => {
    const element = elementRef.current;
    if (!element?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    const offset = frame.direction * 18;
    const animation = element.animate(
      [
        {
          opacity: frame.direction === 0 ? 0.88 : 0.82,
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
  }, [elementRef, frame.direction, frame.revision]);
}
