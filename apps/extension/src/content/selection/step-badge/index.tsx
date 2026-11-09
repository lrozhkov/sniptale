import React from 'react';
import type { StepBadgeFrameRect } from '../../../features/highlighter/frame-annotation/step-badge/placement';
import { FrameStepBadgeInteractiveSurface } from '../../../features/highlighter/frame-annotation/step-badge/interactive-surface';
import { FrameStepBadgeSurface } from '../../../features/highlighter/frame-annotation/step-badge-surface';
import { FRAME_ANNOTATION_Z_INDEX } from '../../../features/highlighter/frame-annotation/interaction/z-index';
import {
  resolveContentPortalTarget,
  useContentPortalTheme,
} from '../interactive-frame/layout/portal';
import { useContentUiScale } from '../../platform/dom-host';

type StepBadgeProps = Pick<
  React.ComponentProps<typeof FrameStepBadgeInteractiveSurface>,
  | 'settings'
  | 'borderColor'
  | 'borderWidth'
  | 'fillColor'
  | 'shadow'
  | 'isSettingsOpen'
  | 'onClick'
  | 'onPositionChange'
  | 'onFramePositionChange'
  | 'onSettingsClick'
  | 'onValueChange'
  | 'onDelete'
  | 'settingsAnchorRef'
> & {
  frameRect?: StepBadgeFrameRect;
  showSettingsHandle?: boolean;
};
/** Content adapter for the shared badge surface and page-owned portal. */
export const StepBadge: React.FC<StepBadgeProps> = (props) => {
  const portalTheme = useContentPortalTheme();
  const chromeScale = useContentUiScale();
  if (!props.frameRect) {
    return (
      <FrameStepBadgeSurface
        borderColor={props.borderColor}
        borderWidth={props.borderWidth}
        settings={props.settings}
        zIndex={FRAME_ANNOTATION_Z_INDEX.stepBadge}
        {...(props.fillColor ? { fillColor: props.fillColor } : {})}
        {...(props.shadow === undefined ? {} : { shadow: props.shadow })}
        {...(props.onClick ? { onClick: props.onClick } : {})}
      />
    );
  }
  const portalTarget = resolveContentPortalTarget();
  return (
    <FrameStepBadgeInteractiveSurface
      borderColor={props.borderColor}
      borderWidth={props.borderWidth}
      chromeScale={chromeScale}
      controlsPortalTarget={portalTarget}
      frameRect={props.frameRect}
      {...(props.onPositionChange ? { onPositionChange: props.onPositionChange } : {})}
      {...(props.onFramePositionChange
        ? { onFramePositionChange: props.onFramePositionChange }
        : {})}
      portalTheme={portalTheme}
      settings={props.settings}
      {...(props.onDelete ? { onDelete: props.onDelete } : {})}
      {...(props.onValueChange ? { onValueChange: props.onValueChange } : {})}
      showSettingsHandle={Boolean(props.showSettingsHandle)}
      surfacePortalTarget={portalTarget}
      {...(props.fillColor ? { fillColor: props.fillColor } : {})}
      {...(props.shadow === undefined ? {} : { shadow: props.shadow })}
      {...(props.isSettingsOpen === undefined ? {} : { isSettingsOpen: props.isSettingsOpen })}
      {...(props.onClick ? { onClick: props.onClick } : {})}
      {...(props.onSettingsClick ? { onSettingsClick: props.onSettingsClick } : {})}
      {...(props.settingsAnchorRef ? { settingsAnchorRef: props.settingsAnchorRef } : {})}
    />
  );
};
