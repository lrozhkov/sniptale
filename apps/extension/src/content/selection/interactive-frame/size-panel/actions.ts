import { syncFrameHeight, syncFrameWidth } from './logic';
import {
  createInteractiveFrameSizeAdjuster,
  createInteractiveFrameSizeValueHandlers,
} from './updates';
import type { SizePanelProps } from './types';

export function useInteractiveFrameSizePanelActions(params: {
  props: SizePanelProps;
  maxWidth: number;
  maxHeight: number;
  applyFrameUpdate: (
    updater: (current: SizePanelProps['tempFrame']) => SizePanelProps['tempFrame']
  ) => void;
}) {
  const syncWidth = (current: SizePanelProps['tempFrame'], newWidth: number) =>
    syncFrameWidth({
      current,
      newWidth,
      maintainAspectRatio: params.props.maintainAspectRatio,
      aspectRatio: params.props.aspectRatio,
      maxHeight: params.maxHeight,
    });

  const syncHeight = (current: SizePanelProps['tempFrame'], newHeight: number) =>
    syncFrameHeight({
      current,
      newHeight,
      maintainAspectRatio: params.props.maintainAspectRatio,
      aspectRatio: params.props.aspectRatio,
      maxWidth: params.maxWidth,
    });

  return {
    adjustSize: createInteractiveFrameSizeAdjuster({
      maxWidth: params.maxWidth,
      maxHeight: params.maxHeight,
      applyFrameUpdate: params.applyFrameUpdate,
      syncWidth,
      syncHeight,
    }),
    ...createInteractiveFrameSizeValueHandlers({
      maxWidth: params.maxWidth,
      maxHeight: params.maxHeight,
      applyFrameUpdate: params.applyFrameUpdate,
      syncWidth,
      syncHeight,
    }),
  };
}
