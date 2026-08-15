import React from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { translate, useAppLocale } from '../../../../platform/i18n';
import { isHighlighterEnabled } from '../../highlighter';
import {
  getThemedPortalStyle,
  resolveContentPortalTarget,
  useContentPortalTheme,
  Z_INDEX_FLOATING_UI,
} from '../layout/portal';
import {
  createFrameQuickActions,
  FrameQuickActionButtons,
  frameTriggerControlStyle,
  frameTriggerIconStyle,
  type FrameQuickActionContext,
} from './trigger-actions';
import {
  canFitFrameQuickActions,
  FRAME_TRIGGER_BRIDGE_PADDING,
  FRAME_TRIGGER_CONTROL_GAP,
} from './trigger-position';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import { resolveContentShadowRoot } from '../../../platform/dom-host';
import { readContentUiScaleCompensation } from '@sniptale/ui/floating-interactions/scale';
import type { FrameCaptureVisibilityState } from './capture-visibility-state';
import { canAppendFrameCallout } from '../../../../features/highlighter/frame-annotation/callout/collection';
import {
  resolveStableFrameTriggerPosition,
  suspendFrameTriggerPlacement,
  type FrameTriggerPlacementSession,
} from './trigger-placement-session';

type InteractiveFrameToolbarTriggerProps = FrameQuickActionContext & {
  captureVisibility: FrameCaptureVisibilityState;
  isVisible: boolean;
  hoverFrame: (frameId: string) => void;
  scheduleHoverFrameHide: (frameId: string) => void;
  selectFrame: (frameId: string, anchorOffset?: { x: number; y: number }) => void;
};

function useTriggerPositionRefresh(isVisible: boolean) {
  const [, refreshPosition] = React.useReducer((value) => value + 1, 0);
  React.useEffect(() => {
    if (!isVisible) return;
    const refresh = () => refreshPosition();
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [isVisible]);
}

function FrameToolbarTriggerButton(props: {
  frame: FrameData;
  label: string;
  onBlur: () => void;
  onFocus: () => void;
  selectFrame: InteractiveFrameToolbarTriggerProps['selectFrame'];
}) {
  return (
    <button
      type="button"
      className="sniptale-frame-toolbar-trigger"
      data-frame-id={props.frame.id}
      data-frame-control="trigger"
      title={props.label}
      aria-label={props.label}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const hasPointerCoordinates =
          event.detail > 0 || event.clientX !== 0 || event.clientY !== 0;
        if (hasPointerCoordinates) {
          props.selectFrame(props.frame.id, {
            x: event.clientX - props.frame.x,
            y: event.clientY - props.frame.y,
          });
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        props.selectFrame(
          props.frame.id,
          rect.width > 0 && rect.height > 0
            ? {
                x: rect.left + rect.width / 2 - props.frame.x,
                y: rect.top + rect.height / 2 - props.frame.y,
              }
            : undefined
        );
      }}
      style={frameTriggerControlStyle}
    >
      <MoreHorizontal size={17} aria-hidden="true" style={frameTriggerIconStyle} />
    </button>
  );
}

export function InteractiveFrameToolbarTrigger(props: InteractiveFrameToolbarTriggerProps) {
  useAppLocale();
  useTriggerPositionRefresh(props.isVisible);
  const placementSessionRef = React.useRef<FrameTriggerPlacementSession | null>(null);
  const portalTheme = useContentPortalTheme();
  const uiScale = readContentUiScaleCompensation(resolveContentShadowRoot()?.host ?? null);
  const toggleQuickPopover = useFrameUIStore((state) => state.toggleQuickPopover);
  if (!props.isVisible || !isHighlighterEnabled()) {
    placementSessionRef.current = suspendFrameTriggerPlacement(placementSessionRef.current);
    return null;
  }

  const quickActions = createFrameQuickActions({
    ...props,
    canAddCallout: props.canAddCallout ?? canAppendFrameCallout(props.frame),
    captureVisibility: props.captureVisibility,
    toggleQuickPopover,
  });
  const visibleQuickActions = canFitFrameQuickActions(props.frame, quickActions.length + 1, uiScale)
    ? quickActions
    : quickActions.filter((action) => action.id === 'capture-visibility');
  const placement = resolveStableFrameTriggerPosition({
    controlCount: visibleQuickActions.length + 1,
    frame: props.frame,
    session: placementSessionRef.current,
    uiScale,
  });
  const position = placement.position;
  placementSessionRef.current = placement.session;
  const onFocus = () => props.hoverFrame(props.frame.id);
  const onBlur = () => props.scheduleHoverFrameHide(props.frame.id);

  return createPortal(
    <div
      className="sniptale-frame-toolbar-bridge-positioner sniptale-content-ui-positioner"
      data-frame-id={props.frame.id}
      data-frame-control="trigger"
      data-placement-side={position.side}
      data-theme={portalTheme ?? undefined}
      style={getThemedPortalStyle(portalTheme, {
        position: 'fixed',
        left: position.x - FRAME_TRIGGER_BRIDGE_PADDING * uiScale,
        top: position.y - FRAME_TRIGGER_BRIDGE_PADDING * uiScale,
        pointerEvents: 'none',
        zIndex: Z_INDEX_FLOATING_UI,
      })}
    >
      <div
        className="sniptale-frame-toolbar-bridge sniptale-content-ui-zoom-surface"
        data-frame-id={props.frame.id}
        data-frame-control="trigger"
        style={{
          padding: FRAME_TRIGGER_BRIDGE_PADDING,
          display: 'flex',
          flexDirection: position.direction,
          gap: FRAME_TRIGGER_CONTROL_GAP,
        }}
        onPointerEnter={onFocus}
        onPointerLeave={onBlur}
      >
        <FrameQuickActionButtons
          actions={visibleQuickActions}
          frameId={props.frame.id}
          onBlur={onBlur}
          onFocus={onFocus}
        />
        <FrameToolbarTriggerButton
          frame={props.frame}
          label={translate('content.interactiveFrame.openToolbar')}
          onBlur={onBlur}
          onFocus={onFocus}
          selectFrame={props.selectFrame}
        />
      </div>
    </div>,
    resolveContentPortalTarget()
  );
}
