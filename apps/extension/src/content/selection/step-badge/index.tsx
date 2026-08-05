import React from 'react';
import { createPortal } from 'react-dom';
import { translate } from '../../../platform/i18n';
import type {
  StepBadgeManualPlacement,
  StepBadgeSettings,
} from '../../../features/highlighter/contracts';
import { StepBadgeControls } from './controls';
import { useStepBadgeInteraction } from './interaction';
import type { StepBadgeFrameRect } from './placement';
import { getStepBadgeStyle, StepBadgeValue } from './views';
import { resolveContentPortalTarget, Z_INDEX_STEP_BADGE } from '../interactive-frame/layout/portal';

interface StepBadgeProps {
  settings: StepBadgeSettings;
  borderColor: string;
  borderWidth: number;
  fillColor?: string;
  fillOpacity?: number;
  shadow?: number;
  frameRect?: StepBadgeFrameRect;
  isSettingsOpen?: boolean;
  onClick?: () => void;
  onPositionChange?: (placement: StepBadgeManualPlacement) => void;
  onSettingsClick?: () => void;
  settingsAnchorRef?: React.RefObject<HTMLButtonElement | null>;
  showSettingsHandle?: boolean;
}

export const StepBadge: React.FC<StepBadgeProps> = (props) => {
  const interaction = useStepBadgeInteraction({
    borderWidth: props.borderWidth,
    frameRect: props.frameRect,
    isSettingsOpen: props.isSettingsOpen,
    onPositionChange: props.onPositionChange,
    settings: props.settings,
  });
  if (!props.settings.enabled || !props.settings.value) return null;

  const badge = (
    <div
      ref={interaction.badgeRef}
      className="sniptale-step-badge"
      onClick={(event) => {
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        props.onClick?.();
      }}
      onMouseEnter={interaction.hasControls ? interaction.visibility.handleMouseEnter : undefined}
      onMouseLeave={interaction.hasControls ? interaction.visibility.handleMouseLeave : undefined}
      style={getStepBadgeStyle({
        settings: interaction.effectiveSettings,
        borderColor: props.borderColor,
        borderWidth: props.borderWidth,
        ...(props.fillColor ? { fillColor: props.fillColor } : {}),
        ...(props.fillOpacity === undefined ? {} : { fillOpacity: props.fillOpacity }),
        zIndex: props.frameRect ? 0 : Z_INDEX_STEP_BADGE,
        clickable: Boolean(props.onClick),
        isDragging: interaction.drag.isDragging,
        ...(props.shadow === undefined ? {} : { shadow: props.shadow }),
      })}
      title={`${translate('content.stepBadge.tooltipPrefix')} ${props.settings.value}`}
    >
      <StepBadgeValue value={props.settings.value} />
    </div>
  );
  const positionedBadge = props.frameRect
    ? createPortal(
        <div
          className="sniptale-step-badge-layer"
          style={{
            position: 'fixed',
            top: `${props.frameRect.y}px`,
            left: `${props.frameRect.x}px`,
            width: `${props.frameRect.width}px`,
            height: `${props.frameRect.height}px`,
            pointerEvents: 'none',
            zIndex: Z_INDEX_STEP_BADGE,
          }}
        >
          {badge}
        </div>,
        resolveContentPortalTarget()
      )
    : badge;

  return (
    <>
      {positionedBadge}
      {interaction.hasControls ? (
        <StepBadgeControls
          drag={interaction.drag}
          visibility={interaction.visibility}
          position={interaction.controlPosition}
          showSettingsHandle={Boolean(props.showSettingsHandle)}
          {...(props.onSettingsClick ? { onSettingsClick: props.onSettingsClick } : {})}
          {...(props.settingsAnchorRef ? { settingsAnchorRef: props.settingsAnchorRef } : {})}
        />
      ) : null}
    </>
  );
};
