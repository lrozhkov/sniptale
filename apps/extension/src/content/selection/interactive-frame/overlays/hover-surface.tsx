import type React from 'react';
import { createPortal } from 'react-dom';
import {
  getThemedPortalStyle,
  resolveContentPortalTarget,
  Z_INDEX_BLOCKING_OVERLAY,
} from '../layout/portal';
import { dispatchCalloutBlurRequest } from '../../../platform/page-context/frame-events';
import type { InteractiveFrameHoverOverlayProps } from '../controller/types';
import {
  getCombinedFrameFloatingUiRect,
  getDistanceToFrameFloatingUiRect,
} from '../../frame-runtime/ui-controller/floating-bounds';

const HOVER_OVERLAY_HIDE_DISTANCE = 200;

function closeInteractiveFrameHoverState(params: InteractiveFrameHoverOverlayProps) {
  if (params.isCalloutEditing) {
    dispatchCalloutBlurRequest({ frameId: params.frameId });
    params.setIsCalloutEditing(false);
  }
  if (params.isPopoverOpen) {
    params.closePopover();
  }
  if (params.isStepBadgePopoverOpen) {
    params.setIsStepBadgePopoverOpen(false);
  }
  if (params.isCalloutPopoverOpen) {
    params.setIsCalloutPopoverOpen(false);
  }
  params.hideTooltip(params.frameId);
}

function closeHoverStateWhenPointerLeavesUi(
  event: React.PointerEvent,
  props: InteractiveFrameHoverOverlayProps
) {
  if (props.isCalloutEditing) {
    return;
  }

  const combinedRect = getCombinedFrameFloatingUiRect();
  if (!combinedRect) {
    return;
  }

  if (
    getDistanceToFrameFloatingUiRect(event.clientX, event.clientY, combinedRect) >=
    HOVER_OVERLAY_HIDE_DISTANCE
  ) {
    closeInteractiveFrameHoverState(props);
  }
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
        zIndex: props.isCalloutEditing ? 2147483646 : Z_INDEX_BLOCKING_OVERLAY,
        cursor: 'default',
        pointerEvents: 'auto',
      })}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        closeInteractiveFrameHoverState(props);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        closeHoverStateWhenPointerLeavesUi(event, props);
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
