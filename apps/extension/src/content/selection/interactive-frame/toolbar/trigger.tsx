import React from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
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
} from './trigger-actions';
import {
  canFitFrameQuickActions,
  FRAME_TRIGGER_BRIDGE_PADDING,
  FRAME_TRIGGER_CONTROL_GAP,
  getFrameTriggerPosition,
} from './trigger-position';

type InteractiveFrameToolbarTriggerProps = {
  frame: FrameData;
  isVisible: boolean;
  closePopover: () => void;
  handleStartEditing: () => void;
  hoverFrame: (frameId: string) => void;
  scheduleHoverFrameHide: (frameId: string) => void;
  selectFrame: (frameId: string, anchorOffset?: { x: number; y: number }) => void;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
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
      <MoreHorizontal size={17} aria-hidden="true" />
    </button>
  );
}

export function InteractiveFrameToolbarTrigger(props: InteractiveFrameToolbarTriggerProps) {
  useAppLocale();
  useTriggerPositionRefresh(props.isVisible);
  const portalTheme = useContentPortalTheme();
  if (!props.isVisible || !isHighlighterEnabled()) return null;

  const quickActions = createFrameQuickActions(props);
  const visibleQuickActions = canFitFrameQuickActions(props.frame, quickActions.length + 1)
    ? quickActions
    : [];
  const position = getFrameTriggerPosition(props.frame, visibleQuickActions.length + 1);
  const onFocus = () => props.hoverFrame(props.frame.id);
  const onBlur = () => props.scheduleHoverFrameHide(props.frame.id);

  return createPortal(
    <div
      className="sniptale-frame-toolbar-bridge"
      data-frame-id={props.frame.id}
      data-frame-control="trigger"
      data-placement-side={position.side}
      data-theme={portalTheme ?? undefined}
      style={getThemedPortalStyle(portalTheme, {
        position: 'fixed',
        left: position.x - FRAME_TRIGGER_BRIDGE_PADDING,
        top: position.y - FRAME_TRIGGER_BRIDGE_PADDING,
        padding: FRAME_TRIGGER_BRIDGE_PADDING,
        display: 'flex',
        flexDirection: position.direction,
        gap: FRAME_TRIGGER_CONTROL_GAP,
        pointerEvents: 'auto',
        zIndex: Z_INDEX_FLOATING_UI,
      })}
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
    </div>,
    resolveContentPortalTarget()
  );
}
