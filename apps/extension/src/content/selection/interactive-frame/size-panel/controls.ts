import React from 'react';
import { createSizePanelUpdater } from './logic';
import type { SizePanelProps } from './types';
import { useInteractiveFrameSizePanelActions } from './actions';
import { useInteractiveFrameSizePanelBounds } from './bounds';

export function useInteractiveFrameSizePanelControls(props: SizePanelProps) {
  const { maxWidth, maxHeight } = useInteractiveFrameSizePanelBounds();
  const applyFrameUpdate = React.useMemo(
    () =>
      createSizePanelUpdater({
        setTempFrame: props.setTempFrame,
        effectMode: props.effectMode,
        frameId: props.frameId,
      }),
    [props.setTempFrame, props.effectMode, props.frameId]
  );
  return {
    maxWidth,
    maxHeight,
    ...useInteractiveFrameSizePanelActions({
      props,
      maxWidth,
      maxHeight,
      applyFrameUpdate,
    }),
  };
}
