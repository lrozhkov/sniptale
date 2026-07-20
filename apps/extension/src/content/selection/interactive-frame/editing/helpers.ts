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
}

export function applyDragUpdate(params: {
  event: MouseEvent;
  containerRef: React.RefObject<HTMLDivElement | null>;
  startX: number;
  startY: number;
  startFrame: FrameData;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  frameId: string;
  effectMode: EffectMode;
}) {
  const newX = params.startFrame.x + (params.event.clientX - params.startX);
  const newY = params.startFrame.y + (params.event.clientY - params.startY);
  syncInteractiveFrameContainer(params.containerRef.current, {
    x: newX,
    y: newY,
    width: params.startFrame.width,
    height: params.startFrame.height,
  });
  params.setTempFrame((prev) => ({ ...prev, x: newX, y: newY }));
  updateEffectOverlay(
    params.effectMode,
    params.frameId,
    newX,
    newY,
    params.startFrame.width,
    params.startFrame.height
  );
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

export function applyResizeUpdate(params: {
  event: MouseEvent;
  direction: ResizeDirection;
  containerRef: React.RefObject<HTMLDivElement | null>;
  startX: number;
  startY: number;
  startFrame: FrameData;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  frameId: string;
  effectMode: EffectMode;
}) {
  const resizedFrame = getResizedFrame(
    params.direction,
    params.event.clientX - params.startX,
    params.event.clientY - params.startY,
    params.startFrame
  );
  syncInteractiveFrameContainer(params.containerRef.current, resizedFrame);
  params.setTempFrame((prev) => ({ ...prev, ...resizedFrame }));
  updateEffectOverlay(
    params.effectMode,
    params.frameId,
    resizedFrame.x,
    resizedFrame.y,
    resizedFrame.width,
    resizedFrame.height
  );
}
