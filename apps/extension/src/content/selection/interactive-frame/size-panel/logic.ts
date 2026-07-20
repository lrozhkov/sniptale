import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';
import { MIN_FRAME_SIZE, updateEffectOverlay } from '../layout/portal';

export function createSizePanelUpdater(params: {
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  effectMode: EffectMode;
  frameId: string;
}) {
  return (updater: (current: FrameData) => FrameData) => {
    params.setTempFrame((prev) => {
      const next = updater(prev);
      updateEffectOverlay(
        params.effectMode,
        params.frameId,
        next.x,
        next.y,
        next.width,
        next.height
      );
      return next;
    });
  };
}

export function syncFrameWidth(params: {
  current: FrameData;
  newWidth: number;
  maintainAspectRatio: boolean;
  aspectRatio: number | null;
  maxHeight: number;
}) {
  const oldWidth = params.current.width;
  const updated = {
    ...params.current,
    width: params.newWidth,
    x: params.current.x - (params.newWidth - oldWidth) / 2,
  };

  if (params.maintainAspectRatio && params.aspectRatio) {
    const nextHeight = Math.round(params.newWidth / params.aspectRatio);
    const oldHeight = params.current.height;
    updated.height = Math.min(Math.max(nextHeight, MIN_FRAME_SIZE), params.maxHeight);
    updated.y = params.current.y - (updated.height - oldHeight) / 2;
  }

  return updated;
}

export function syncFrameHeight(params: {
  current: FrameData;
  newHeight: number;
  maintainAspectRatio: boolean;
  aspectRatio: number | null;
  maxWidth: number;
}) {
  const oldHeight = params.current.height;
  const updated = {
    ...params.current,
    height: params.newHeight,
    y: params.current.y - (params.newHeight - oldHeight) / 2,
  };

  if (params.maintainAspectRatio && params.aspectRatio) {
    const nextWidth = Math.round(params.newHeight * params.aspectRatio);
    const oldWidth = params.current.width;
    updated.width = Math.min(Math.max(nextWidth, MIN_FRAME_SIZE), params.maxWidth);
    updated.x = params.current.x - (updated.width - oldWidth) / 2;
  }

  return updated;
}
