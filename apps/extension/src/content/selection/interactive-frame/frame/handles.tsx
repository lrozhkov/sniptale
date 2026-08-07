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
  isResizeHovered: boolean;
  tempFrame: FrameData;
  borderColor?: string;
  borderWidth: number;
  onResizeStart: (event: React.PointerEvent, direction: ResizeDirection) => void;
}

export function InteractiveFrameResizeHandles({
  state,
  isResizeHovered,
  tempFrame,
  borderColor,
  borderWidth,
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

  if (!isResizeHovered && state !== 'editing' && state !== 'resizing') {
    return null;
  }

  const directions: ResizeDirection[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const handleSize = Math.min(16, Math.max(10, 8 + borderWidth));

  return createPortal(
    <InteractiveFrameResizeHandleLayer
      directions={directions}
      frameId={tempFrame.id}
      tempFrame={tempFrame}
      handleSize={handleSize}
      strokeWidth={borderWidth}
      onResizeStart={onResizeStart}
      {...(borderColor === undefined ? {} : { borderColor })}
    />,
    portalContainer
  );
}
