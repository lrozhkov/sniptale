import React from 'react';
import { createPortal } from 'react-dom';
import type { AppTheme } from '@sniptale/ui/theme/types';
import type {
  StepBadgeManualPlacement,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { FrameStepBadgeSurface } from '../step-badge-surface';
import type { FrameAnnotationCoordinateSpace } from '../coordinate-space';
import { useStepBadgeInteraction } from './interaction';
import type { StepBadgeFrameRect } from './placement';
import { FrameStepBadgeControls } from './controls';
import { FRAME_ANNOTATION_Z_INDEX } from '../interaction/z-index';

export function FrameStepBadgeInteractiveSurface(props: {
  borderColor: string;
  borderWidth: number;
  chromeScale?: number;
  controlsPortalTarget: Element | DocumentFragment;
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  fillColor?: string;
  frameRect: StepBadgeFrameRect;
  isSettingsOpen?: boolean;
  onClick?: () => void;
  onPositionChange?: (placement: StepBadgeManualPlacement) => void;
  onSettingsClick?: () => void;
  portalTheme: AppTheme | null;
  settings: StepBadgeSettings;
  settingsAnchorRef?: React.RefObject<HTMLButtonElement | null>;
  shadow?: number;
  showSettingsHandle: boolean;
  surfacePortalTarget: Element | DocumentFragment;
  chrome?: 'export' | 'interactive';
}) {
  const interaction = useStepBadgeInteraction({
    borderWidth: props.borderWidth,
    ...(props.chromeScale === undefined ? {} : { chromeScale: props.chromeScale }),
    ...(props.coordinateSpace ? { coordinateSpace: props.coordinateSpace } : {}),
    frameRect: props.frameRect,
    isSettingsOpen: props.isSettingsOpen,
    onPositionChange: props.onPositionChange,
    settings: props.settings,
  });
  if (!props.settings.enabled) return null;
  const badge = (
    <FrameStepBadgeSurface
      borderColor={props.borderColor}
      borderWidth={props.borderWidth}
      elementRef={interaction.badgeRef}
      isDragging={interaction.drag.isDragging}
      {...(props.onClick ? { onClick: props.onClick } : {})}
      onMouseEnter={interaction.visibility.handleMouseEnter}
      onMouseLeave={interaction.visibility.handleMouseLeave}
      settings={interaction.effectiveSettings}
      zIndex={0}
      {...(props.chrome === 'export' || props.chromeScale === undefined
        ? {}
        : { visualScale: props.chromeScale })}
      {...(props.fillColor ? { fillColor: props.fillColor } : {})}
      {...(props.shadow === undefined ? {} : { shadow: props.shadow })}
    />
  );
  return (
    <>
      {createPortal(
        <div
          className="sniptale-step-badge-layer"
          style={{
            position: 'fixed',
            top: props.frameRect.y,
            left: props.frameRect.x,
            width: props.frameRect.width,
            height: props.frameRect.height,
            pointerEvents: 'none',
            zIndex: FRAME_ANNOTATION_Z_INDEX.stepBadge,
          }}
        >
          {badge}
        </div>,
        props.surfacePortalTarget
      )}
      {props.chrome !== 'export' ? (
        <FrameStepBadgeControls
          drag={interaction.drag}
          visibility={interaction.visibility}
          portalTarget={props.controlsPortalTarget}
          portalTheme={props.portalTheme}
          position={interaction.controlPosition}
          showSettingsHandle={props.showSettingsHandle}
          {...(props.onSettingsClick ? { onSettingsClick: props.onSettingsClick } : {})}
          {...(props.settingsAnchorRef ? { settingsAnchorRef: props.settingsAnchorRef } : {})}
        />
      ) : null}
    </>
  );
}
