import {
  createMotionFocusAreaFromPointScale,
  getMotionFocusAreaCenter,
} from '../../../../../features/video/project/motion/index';
import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { VideoMotionFocusMode } from '../../../../../features/video/project/types';
import { getVisibleProjectActionEvents } from '../../../../project/operations/action-events';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { getProjectCenter } from './utils';

function getActionModeTarget(panel: WorkspaceSidebarSelectionPanelProps) {
  const actionEvents = getVisibleProjectActionEvents(panel.project);
  return panel.selectedMotionRegion?.targetActionEventId ?? actionEvents[0]?.id ?? null;
}

function getManualPoint(panel: WorkspaceSidebarSelectionPanelProps) {
  const focusArea = panel.selectedMotionRegion?.focusArea;
  return focusArea
    ? getMotionFocusAreaCenter(focusArea)
    : (panel.selectedMotionRegion?.focusPoint ?? getProjectCenter(panel));
}

function getManualArea(panel: WorkspaceSidebarSelectionPanelProps) {
  if (panel.selectedMotionRegion?.focusArea) {
    return panel.selectedMotionRegion.focusArea;
  }

  return createMotionFocusAreaFromPointScale(
    panel.project,
    getManualPoint(panel),
    panel.selectedMotionRegion?.scale ?? 1.35
  );
}

function updateFocusMode(
  panel: WorkspaceSidebarSelectionPanelProps,
  motionRegionId: string,
  focusMode: VideoMotionFocusMode
) {
  panel.onClearPlacementMode?.();

  switch (focusMode) {
    case VideoMotionFocusMode.MANUAL:
      panel.onUpdateMotionRegion?.(motionRegionId, {
        focusMode,
        focusPoint: getManualPoint(panel),
      });
      return;
    case VideoMotionFocusMode.MANUAL_AREA:
      panel.onUpdateMotionRegion?.(motionRegionId, {
        focusArea: getManualArea(panel),
        focusMode,
      });
      return;
    case VideoMotionFocusMode.CURSOR:
      panel.onUpdateMotionRegion?.(motionRegionId, {
        focusMode,
      });
      return;
    case VideoMotionFocusMode.ACTION:
      panel.onUpdateMotionRegion?.(motionRegionId, {
        focusMode,
        targetActionEventId: getActionModeTarget(panel),
      });
      return;
  }
}

function QuickActionButton(props: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <ProductActionButton
      compact
      tone="toggle"
      active={props.active}
      aria-pressed={props.active}
      disabled={props.disabled}
      className="w-full min-w-0"
      onClick={props.onClick}
    >
      {props.label}
    </ProductActionButton>
  );
}

export function MotionQuickActions(props: { panel: WorkspaceSidebarSelectionPanelProps }) {
  const motionRegion = props.panel.selectedMotionRegion;
  if (!motionRegion) {
    return null;
  }

  const motionRegionId = motionRegion.id;
  const hasActionTarget = getVisibleProjectActionEvents(props.panel.project).length > 0;

  return (
    <div className="grid grid-cols-2 gap-2">
      <QuickActionButton
        active={motionRegion.focusMode === VideoMotionFocusMode.MANUAL}
        label={translate('videoEditor.sidebar.motionFocusManual')}
        onClick={() => updateFocusMode(props.panel, motionRegionId, VideoMotionFocusMode.MANUAL)}
      />
      <QuickActionButton
        active={motionRegion.focusMode === VideoMotionFocusMode.MANUAL_AREA}
        label={translate('videoEditor.sidebar.motionFocusManualArea')}
        onClick={() =>
          updateFocusMode(props.panel, motionRegionId, VideoMotionFocusMode.MANUAL_AREA)
        }
      />
      <QuickActionButton
        active={motionRegion.focusMode === VideoMotionFocusMode.CURSOR}
        label={translate('videoEditor.sidebar.motionFocusCursor')}
        onClick={() => updateFocusMode(props.panel, motionRegionId, VideoMotionFocusMode.CURSOR)}
      />
      <QuickActionButton
        active={motionRegion.focusMode === VideoMotionFocusMode.ACTION}
        disabled={!hasActionTarget}
        label={translate('videoEditor.sidebar.motionFocusAction')}
        onClick={() => updateFocusMode(props.panel, motionRegionId, VideoMotionFocusMode.ACTION)}
      />
    </div>
  );
}
