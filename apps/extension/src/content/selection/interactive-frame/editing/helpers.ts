import type React from 'react';
import type {
  EffectMode,
  FrameData,
  ResizeDirection,
} from '../../../../features/highlighter/contracts';
import { MIN_FRAME_SIZE, updateEffectOverlay } from '../layout/portal';

export function syncInteractiveFrameContainer(
  container: HTMLDivElement | null,
  frame: Pick<FrameData, 'x' | 'y' | 'width' | 'height'>
) {
  if (!container) {
    return;
  }

  container.style.left = `${frame.x}px`;
  container.style.top = `${frame.y}px`;
  container.style.width = `${frame.width}px`;
  container.style.height = `${frame.height}px`;

  const visibleFrame = container.firstElementChild;
  if (
    visibleFrame instanceof HTMLElement &&
    visibleFrame.classList.contains('sniptale-interactive-frame')
  ) {
    visibleFrame.style.width = `${frame.width}px`;
    visibleFrame.style.height = `${frame.height}px`;
  }
}

function applyDragUpdate(params: {
  event: Pick<MouseEvent, 'clientX' | 'clientY'>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  startX: number;
  startY: number;
  startFrame: FrameData;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  frameId: string;
  effectMode: EffectMode;
  tempFrameRef?: React.MutableRefObject<FrameData>;
}) {
  const newX = params.startFrame.x + (params.event.clientX - params.startX);
  const newY = params.startFrame.y + (params.event.clientY - params.startY);
  syncInteractiveFrameContainer(params.containerRef.current, {
    x: newX,
    y: newY,
    width: params.startFrame.width,
    height: params.startFrame.height,
  });
  const nextFrame = { ...params.startFrame, x: newX, y: newY };
  if (params.tempFrameRef) params.tempFrameRef.current = nextFrame;
  params.setTempFrame(nextFrame);
  updateEffectOverlay(params.effectMode, params.frameId, {
    x: newX,
    y: newY,
    width: params.startFrame.width,
    height: params.startFrame.height,
  });
}

function getResizedFrame(
  direction: ResizeDirection,
  deltaX: number,
  deltaY: number,
  startFrame: FrameData
) {
  let newX = startFrame.x;
  let newY = startFrame.y;
  let newWidth = startFrame.width;
  let newHeight = startFrame.height;

  if (direction.includes('e')) {
    newWidth = Math.max(MIN_FRAME_SIZE, startFrame.width + deltaX);
  }
  if (direction.includes('w')) {
    const validDelta = Math.min(deltaX, startFrame.width - MIN_FRAME_SIZE);
    newX = startFrame.x + validDelta;
    newWidth = startFrame.width - validDelta;
  }
  if (direction.includes('s')) {
    newHeight = Math.max(MIN_FRAME_SIZE, startFrame.height + deltaY);
  }
  if (direction.includes('n')) {
    const validDelta = Math.min(deltaY, startFrame.height - MIN_FRAME_SIZE);
    newY = startFrame.y + validDelta;
    newHeight = startFrame.height - validDelta;
  }

  return { x: newX, y: newY, width: newWidth, height: newHeight };
}

function applyResizeUpdate(params: {
  event: Pick<MouseEvent, 'clientX' | 'clientY'>;
  direction: ResizeDirection;
  containerRef: React.RefObject<HTMLDivElement | null>;
  startX: number;
  startY: number;
  startFrame: FrameData;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  frameId: string;
  effectMode: EffectMode;
  tempFrameRef?: React.MutableRefObject<FrameData>;
}) {
  const resizedFrame = getResizedFrame(
    params.direction,
    params.event.clientX - params.startX,
    params.event.clientY - params.startY,
    params.startFrame
  );
  syncInteractiveFrameContainer(params.containerRef.current, resizedFrame);
  const nextFrame = { ...params.startFrame, ...resizedFrame };
  if (params.tempFrameRef) params.tempFrameRef.current = nextFrame;
  params.setTempFrame(nextFrame);
  updateEffectOverlay(params.effectMode, params.frameId, resizedFrame);
}

type InteractiveFrameListenerUpdateParams = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  effectModeRef: React.MutableRefObject<EffectMode>;
  frameId: string;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  startFrameRef: React.MutableRefObject<FrameData>;
  startXRef: React.MutableRefObject<number>;
  startYRef: React.MutableRefObject<number>;
  tempFrameRef: React.MutableRefObject<FrameData>;
};

export function applyInteractiveFramePointerUpdate(
  params: InteractiveFrameListenerUpdateParams,
  event: Pick<MouseEvent, 'clientX' | 'clientY'>,
  direction: ResizeDirection | null
) {
  const update = {
    containerRef: params.containerRef,
    effectMode: params.effectModeRef.current,
    event,
    frameId: params.frameId,
    setTempFrame: params.setTempFrame,
    startFrame: params.startFrameRef.current,
    startX: params.startXRef.current,
    startY: params.startYRef.current,
    tempFrameRef: params.tempFrameRef,
  };
  if (direction) {
    applyResizeUpdate({ ...update, direction });
    return;
  }
  applyDragUpdate(update);
}
