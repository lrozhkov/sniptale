import { createPortal } from 'react-dom';
import {
  getThemedPortalStyle,
  resolveContentPortalTarget,
  Z_INDEX_BLOCKING_OVERLAY,
  Z_INDEX_CALLOUT_EDITING,
} from '../layout/portal';
import { dispatchCalloutBlurRequest } from '../../../platform/page-context/frame-events';
import type { InteractiveFrameHoverOverlayProps } from '../controller/types';

function closeInteractiveFrameHoverState(params: InteractiveFrameHoverOverlayProps) {
  if (params.isCalloutEditing) {
    dispatchCalloutBlurRequest({ frameId: params.frameId });
    params.setIsCalloutEditing(false);
  }
  params.clearSelection();
}

export function InteractiveFrameHoverOverlaySurface(props: InteractiveFrameHoverOverlayProps) {
  return createPortal(
    <div
      className="sniptale-blocking-overlay"
      data-theme={props.portalTheme ?? undefined}
      style={getThemedPortalStyle(props.portalTheme, {
        position: 'fixed',
        inset: 0,
        backgroundColor: 'transparent',
        zIndex: props.isCalloutEditing ? Z_INDEX_CALLOUT_EDITING - 1 : Z_INDEX_BLOCKING_OVERLAY,
        cursor: 'default',
        pointerEvents: 'auto',
      })}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        closeInteractiveFrameHoverState(props);
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        closeInteractiveFrameHoverState(props);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    />,
    resolveContentPortalTarget()
  );
}
