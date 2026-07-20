import React from 'react';
import { createPortal } from 'react-dom';
import type {
  FrameData,
  FrameState,
  ResizeDirection,
} from '../../../../features/highlighter/contracts';
import { useFixedPortalContainer, Z_INDEX_RESIZE_HANDLES } from '../layout/portal';
import { InteractiveFrameResizeHandleLayer } from './handle-layer';

interface ResizeHandlesProps {
  state: FrameState;
  tempFrame: FrameData;
  borderColor?: string;
  onResizeStart: (event: React.MouseEvent, direction: ResizeDirection) => void;
}

export function InteractiveFrameResizeHandles({
  state,
  tempFrame,
  borderColor,
  onResizeStart,
}: ResizeHandlesProps): React.ReactElement | null {
  const portalContainer = useFixedPortalContainer(
    'sniptale-resize-handles-portal',
    `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: ${Z_INDEX_RESIZE_HANDLES};
    `,
    null
  );

  if (state !== 'editing') {
    return null;
  }

  const directions: ResizeDirection[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const handleSize = 10;
  const offset = -6;

  return createPortal(
    <InteractiveFrameResizeHandleLayer
      directions={directions}
      tempFrame={tempFrame}
      handleSize={handleSize}
      offset={offset}
      onResizeStart={onResizeStart}
      {...(borderColor === undefined ? {} : { borderColor })}
    />,
    portalContainer
  );
}
