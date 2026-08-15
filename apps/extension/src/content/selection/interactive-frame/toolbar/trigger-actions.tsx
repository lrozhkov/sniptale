import React from 'react';
import { Eye, EyeOff, ListOrdered, Pencil } from 'lucide-react';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { FrameCommentIcon } from '../../../../features/highlighter/frame-annotation/icons';
import { translate } from '../../../../platform/i18n';
import {
  addAdditionalFrameCallout,
  enableFrameStepBadge,
  startFrameCalloutEditing,
} from './actions';
import { canAppendFrameCallout } from '../../../../features/highlighter/frame-annotation/callout/collection';
import { FRAME_TRIGGER_CONTROL_SIZE } from './trigger-position';
import { FrameAnnotationEffectIcon as FrameEffectIcon } from '../../../../features/highlighter/frame-annotation/effect-icon';
import type { FrameUIState } from '../../frame-runtime/state/frame-ui.store';
import {
  isFrameHiddenDuringCapture,
  setFrameHiddenDuringCapture,
} from '../../../../features/highlighter/frame-annotation/capture-visibility';

type FrameQuickAction = {
  id: 'settings' | 'callout' | 'add-callout' | 'step-badge' | 'edit' | 'capture-visibility';
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: (button: HTMLButtonElement) => void;
  activateOnPointerDown?: boolean;
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
  pointerEvents: 'auto',
};

export const frameTriggerIconStyle = { display: 'block' } as const;

export type FrameQuickActionContext = {
  closePopover: () => void;
  frame: FrameData;
  handleStartEditing: () => void;
  popoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveCalloutIndex?: React.Dispatch<React.SetStateAction<number>>;
  setTempFrame?: React.Dispatch<React.SetStateAction<FrameData>>;
  stageCalloutFrame?: (update: FrameData | ((frame: FrameData) => FrameData)) => FrameData;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  clearSelection?: () => void;
  onUpdate: (frame: FrameData) => void;
  canAddCallout?: boolean;
};

export function createFrameQuickActions(
  props: FrameQuickActionContext & {
    captureVisibility?: { hiddenDuringCapture: boolean; toggle: () => void };
    toggleQuickPopover: FrameUIState['toggleQuickPopover'];
  }
): FrameQuickAction[] {
  const hiddenDuringCapture =
    props.captureVisibility?.hiddenDuringCapture ?? isFrameHiddenDuringCapture(props.frame);
  const canAddCallout = props.canAddCallout ?? canAppendFrameCallout(props.frame);
  return [
    {
      id: 'settings',
      icon: <FrameEffectIcon mode={props.frame.effectMode ?? 'border'} size={14} />,
      label: translate('content.interactiveFrame.frameSettings'),
      onClick: (button) => {
        props.popoverAnchorRef.current = button;
        props.toggleQuickPopover(props.frame.id, 'frame-settings');
      },
    },
    ...(props.frame.callout?.enabled && canAddCallout
      ? [
          {
            id: 'add-callout' as const,
            icon: <FrameCommentIcon size={15} aria-hidden="true" style={frameTriggerIconStyle} />,
            label: translate('content.interactiveFrame.calloutAddAnother'),
            onClick: () => addAdditionalFrameCallout(props),
            activateOnPointerDown: true,
          },
        ]
      : props.frame.callout?.enabled
        ? []
        : [
            {
              id: 'callout' as const,
              icon: <FrameCommentIcon size={15} aria-hidden="true" style={frameTriggerIconStyle} />,
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
            icon: <ListOrdered size={15} aria-hidden="true" style={frameTriggerIconStyle} />,
            label: translate('content.interactiveFrame.stepBadgeEnable'),
            onClick: () =>
              enableFrameStepBadge({ closePopover: props.closePopover, frameId: props.frame.id }),
          },
        ]),
    {
      id: 'edit',
      icon: <Pencil size={15} aria-hidden="true" style={frameTriggerIconStyle} />,
      label: translate('content.interactiveFrame.editButton'),
      onClick: props.handleStartEditing,
    },
    {
      id: 'capture-visibility',
      active: hiddenDuringCapture,
      icon: hiddenDuringCapture ? (
        <EyeOff size={15} aria-hidden="true" style={frameTriggerIconStyle} />
      ) : (
        <Eye size={15} aria-hidden="true" style={frameTriggerIconStyle} />
      ),
      label: translate(
        hiddenDuringCapture
          ? 'content.interactiveFrame.showDuringCapture'
          : 'content.interactiveFrame.hideDuringCapture'
      ),
      onClick: () => {
        if (props.captureVisibility) {
          props.captureVisibility.toggle();
          return;
        }
        props.onUpdate(setFrameHiddenDuringCapture(props.frame, !hiddenDuringCapture) as FrameData);
      },
    },
  ];
}

function stopQuickActionEvent(event: React.SyntheticEvent) {
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
      data-active={action.active ? 'true' : undefined}
      aria-pressed={action.active ?? undefined}
      title={action.label}
      aria-label={action.label}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onPointerDown={(event) => {
        stopQuickActionEvent(event);
        if (action.activateOnPointerDown && event.button === 0) {
          action.onClick(event.currentTarget);
        }
      }}
      onKeyDown={(event) => {
        if (
          action.activateOnPointerDown &&
          !event.repeat &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          stopQuickActionEvent(event);
          action.onClick(event.currentTarget);
        }
      }}
      onClick={(event) => {
        stopQuickActionEvent(event);
        if (action.activateOnPointerDown) return;
        action.onClick(event.currentTarget);
      }}
      style={frameTriggerControlStyle}
    >
      {action.icon}
    </button>
  ));
}
