import { MIN_FRAME_SIZE } from '../layout/portal';
import type { SizePanelProps } from './types';

type TempFrame = SizePanelProps['tempFrame'];
type ApplyFrameUpdate = (updater: (current: TempFrame) => TempFrame) => void;
type SyncFrameDimension = (current: TempFrame, newValue: number) => TempFrame;

interface InteractiveFrameSizeSyncParams {
  applyFrameUpdate: ApplyFrameUpdate;
  maxHeight: number;
  maxWidth: number;
  syncHeight: SyncFrameDimension;
  syncWidth: SyncFrameDimension;
}

function clampFrameDimension(value: number, maxValue: number, keepMin = true) {
  return keepMin ? Math.min(Math.max(value, MIN_FRAME_SIZE), maxValue) : Math.min(value, maxValue);
}

function createFrameDimensionValueHandler(params: {
  applyFrameUpdate: ApplyFrameUpdate;
  maxValue: number;
  syncDimension: SyncFrameDimension;
  keepMin?: boolean;
}) {
  return (value: number) => {
    params.applyFrameUpdate((current) =>
      params.syncDimension(current, clampFrameDimension(value, params.maxValue, params.keepMin))
    );
  };
}

function createFrameSyncHandlers(params: {
  applyFrameUpdate: ApplyFrameUpdate;
  maxValue: number;
  syncDimension: SyncFrameDimension;
}) {
  return {
    raw: createFrameDimensionValueHandler({
      applyFrameUpdate: params.applyFrameUpdate,
      maxValue: params.maxValue,
      syncDimension: params.syncDimension,
      keepMin: false,
    }),
    safe: createFrameDimensionValueHandler({
      applyFrameUpdate: params.applyFrameUpdate,
      maxValue: params.maxValue,
      syncDimension: params.syncDimension,
    }),
  };
}

export function createInteractiveFrameSizeAdjuster(params: InteractiveFrameSizeSyncParams) {
  return (dimension: 'width' | 'height', delta: number) => {
    params.applyFrameUpdate((current) =>
      dimension === 'width'
        ? params.syncWidth(current, clampFrameDimension(current.width + delta, params.maxWidth))
        : params.syncHeight(current, clampFrameDimension(current.height + delta, params.maxHeight))
    );
  };
}

export function createInteractiveFrameSizeValueHandlers(params: InteractiveFrameSizeSyncParams) {
  const widthHandlers = createFrameSyncHandlers({
    applyFrameUpdate: params.applyFrameUpdate,
    maxValue: params.maxWidth,
    syncDimension: params.syncWidth,
  });
  const heightHandlers = createFrameSyncHandlers({
    applyFrameUpdate: params.applyFrameUpdate,
    maxValue: params.maxHeight,
    syncDimension: params.syncHeight,
  });

  return {
    handleWidthChangeRaw: widthHandlers.raw,
    handleHeightChangeRaw: heightHandlers.raw,
    handleWidthChange: widthHandlers.safe,
    handleHeightChange: heightHandlers.safe,
  };
}
