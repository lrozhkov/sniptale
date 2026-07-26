import React from 'react';
import { ListOrdered, MessageSquare, Pencil } from 'lucide-react';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { translate } from '../../../../platform/i18n';
import { enableFrameStepBadge, startFrameCalloutEditing } from './actions';
import { FRAME_TRIGGER_CONTROL_SIZE } from './trigger-position';

type FrameQuickAction = {
  id: 'callout' | 'step-badge' | 'edit';
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

export const frameTriggerControlStyle: React.CSSProperties = {
  width: FRAME_TRIGGER_CONTROL_SIZE,
  height: FRAME_TRIGGER_CONTROL_SIZE,
  flex: `0 0 ${FRAME_TRIGGER_CONTROL_SIZE}px`,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  border: '1px solid var(--sniptale-color-border-soft)',
  borderRadius: 999,
  background: 'var(--sniptale-color-surface-panel)',
  color: 'var(--sniptale-color-text-primary)',
  boxShadow: '0 4px 12px color-mix(in srgb, var(--sniptale-color-shadow-strong) 22%, transparent)',
  cursor: 'pointer',
};

export function createFrameQuickActions(props: {
  closePopover: () => void;
  frame: FrameData;
  handleStartEditing: () => void;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
}): FrameQuickAction[] {
  return [
    ...(props.frame.callout?.enabled
      ? []
      : [
          {
            id: 'callout' as const,
            icon: <MessageSquare size={15} aria-hidden="true" />,
            label: translate('content.interactiveFrame.calloutAdd'),
            onClick: () =>
              startFrameCalloutEditing({
                closePopover: props.closePopover,
                frameId: props.frame.id,
                setIsCalloutEditing: props.setIsCalloutEditing,
                setState: props.setState,
              }),
          },
        ]),
    ...(props.frame.stepBadge?.enabled
      ? []
      : [
          {
            id: 'step-badge' as const,
            icon: <ListOrdered size={15} aria-hidden="true" />,
            label: translate('content.interactiveFrame.stepBadgeEnable'),
            onClick: () =>
              enableFrameStepBadge({ closePopover: props.closePopover, frameId: props.frame.id }),
          },
        ]),
    {
      id: 'edit',
      icon: <Pencil size={15} aria-hidden="true" />,
      label: translate('content.interactiveFrame.editButton'),
      onClick: props.handleStartEditing,
    },
  ];
}

function stopQuickActionEvent(event: React.MouseEvent | React.PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

export function FrameQuickActionButtons(props: {
  actions: FrameQuickAction[];
  frameId: string;
  onBlur: () => void;
  onFocus: () => void;
}) {
  return props.actions.map((action) => (
    <button
      key={action.id}
      type="button"
      className="sniptale-frame-quick-action"
      data-frame-id={props.frameId}
      data-frame-control="trigger"
      data-quick-action={action.id}
      title={action.label}
      aria-label={action.label}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onPointerDown={stopQuickActionEvent}
      onClick={(event) => {
        stopQuickActionEvent(event);
        action.onClick();
      }}
      style={frameTriggerControlStyle}
    >
      {action.icon}
    </button>
  ));
}
