import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { FrameData, FrameState } from '../../../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';
import { invalidateFrameCache } from '../../../highlighter';
import { applyFrameOffsetToElement, calculateFrameViewportCoords } from '../../manager/coords';
import { shouldDropLinkedElement } from './linked-elements';

const logger = createLogger({ namespace: 'ContentFrameScrollSync' });

type FrameScrollSyncArgs = {
  framesRef: MutableRefObject<FrameData[]>;
  frameStatesRef: MutableRefObject<Map<string, FrameState>>;
  linkedElementsRef: MutableRefObject<Map<string, HTMLElement>>;
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
};

export function createFrameScrollHandler({
  framesRef,
  frameStatesRef,
  linkedElementsRef,
  setFrames,
}: FrameScrollSyncArgs) {
  return () => {
    const currentFrames = framesRef.current;
    logger.debug('Handling scroll sync', { frameCount: currentFrames.length });
    if (currentFrames.length === 0) {
      return;
    }

    currentFrames.forEach((frame) => {
      syncFramePositionOnScroll({
        frame,
        frameState: frameStatesRef.current.get(frame.id),
        linkedElement: linkedElementsRef.current.get(frame.id),
        linkedElementsRef,
        setFrames,
      });
    });
  };
}

export function syncFramePositionOnScroll({
  frame,
  frameState,
  linkedElement,
  linkedElementsRef,
  setFrames,
}: {
  frame: FrameData;
  frameState: FrameState | undefined;
  linkedElement: HTMLElement | undefined;
  linkedElementsRef: MutableRefObject<Map<string, HTMLElement>>;
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
}) {
  if (frameState === 'editing' || !linkedElement) {
    return;
  }

  if (shouldDropLinkedElement(linkedElement)) {
    setFrames((prev) => prev.filter((currentFrame) => currentFrame.id !== frame.id));
    linkedElementsRef.current.delete(frame.id);
    invalidateFrameCache();
    return;
  }

  const nextCoords = frame.offset
    ? applyFrameOffsetToElement(linkedElement, frame.offset)
    : calculateFrameViewportCoords(linkedElement, frame.borderSettings);
  const nextFrameCoords = {
    x: nextCoords.x,
    y: nextCoords.y,
    width: frame.width,
    height: frame.height,
  };
  if (!haveFrameCoordsChanged(frame, nextFrameCoords)) {
    return;
  }

  logger.debug('Updating frame coords after scroll', { frameId: frame.id });
  setFrames((prev) =>
    prev.map((currentFrame) =>
      currentFrame.id === frame.id
        ? {
            ...currentFrame,
            ...nextFrameCoords,
          }
        : currentFrame
    )
  );
}

export function haveFrameCoordsChanged(
  frame: FrameData,
  nextCoords: Pick<FrameData, 'x' | 'y' | 'width' | 'height'>
) {
  return (
    frame.x !== nextCoords.x ||
    frame.y !== nextCoords.y ||
    frame.width !== nextCoords.width ||
    frame.height !== nextCoords.height
  );
}
