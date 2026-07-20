import { createDefaultMotionPath } from '../../../../../features/video/project/motion/path';
import { translate } from '../../../../../platform/i18n';
import {
  VideoMotionCameraMode,
  VideoMotionFocusMode,
} from '../../../../../features/video/project/types';
import type { VideoProjectMotionRegion } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { ManualAreaFields } from './area';
import {
  MotionBlurField,
  MotionEasingField,
  MotionFocusModeField,
  MotionOverlayZoomField,
  MotionTargetActionField,
} from './fields';
import { ManualFocusFields } from './focus';
import { MotionPathEditor } from './path-editor/index';
import { OptionButtonsField } from '../shared/option-buttons';
import { DetailItem, DetailList, PANEL_HEADING_CLASS_NAME } from '../shared/panel';
import { SliderField } from '../shared/sliders';

export function MotionCameraFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  const isMovingZoom = props.motionRegion.cameraMode === VideoMotionCameraMode.PATH;

  return (
    <div className="grid grid-cols-1 gap-3">
      <MotionCameraModeField motionRegion={props.motionRegion} panel={props.panel} />
      {!isMovingZoom ? (
        <MotionScaleFields motionRegion={props.motionRegion} panel={props.panel} />
      ) : null}
      <MotionOverlayZoomField
        motionRegionId={props.motionRegion.id}
        panel={props.panel}
        value={props.motionRegion.overlayZoomMode}
      />
      <MotionDurationField
        duration={props.motionRegion.duration}
        motionRegionId={props.motionRegion.id}
        panel={props.panel}
      />
      <MotionZoomFields motionRegion={props.motionRegion} panel={props.panel} />
      <MotionEasingField
        motionRegionId={props.motionRegion.id}
        panel={props.panel}
        value={props.motionRegion.easing}
      />
      <MotionBlurField
        motionRegionId={props.motionRegion.id}
        panel={props.panel}
        value={props.motionRegion.motionBlurAmount ?? 0}
      />
    </div>
  );
}

export function MotionTargetFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  if (props.motionRegion.cameraMode === VideoMotionCameraMode.PATH) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <MotionFocusModeField motionRegion={props.motionRegion} panel={props.panel} />
      <MotionPlacementFields motionRegion={props.motionRegion} panel={props.panel} />
    </div>
  );
}

export function MotionPathFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  if (props.motionRegion.cameraMode !== VideoMotionCameraMode.PATH) {
    return null;
  }

  return <MotionPathEditor motionRegion={props.motionRegion} panel={props.panel} />;
}

function MotionCameraModeField(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <OptionButtonsField
      label={translate('videoEditor.sidebar.motionCameraModeLabel')}
      layout="stacked"
      value={props.motionRegion.cameraMode ?? VideoMotionCameraMode.STATIC}
      onChange={(value) => handleCameraModeChange(props.panel, props.motionRegion, value)}
      options={[
        {
          label: translate('videoEditor.sidebar.motionCameraModeStatic'),
          value: VideoMotionCameraMode.STATIC,
        },
        {
          label: translate('videoEditor.sidebar.motionCameraModePath'),
          value: VideoMotionCameraMode.PATH,
        },
      ]}
    />
  );
}

function handleCameraModeChange(
  panel: WorkspaceSidebarSelectionPanelProps,
  motionRegion: VideoProjectMotionRegion,
  cameraMode: VideoMotionCameraMode
) {
  panel.onClearPlacementMode();
  panel.onUpdateMotionRegion(
    motionRegion.id,
    cameraMode === VideoMotionCameraMode.PATH
      ? {
          cameraMode,
          path: motionRegion.path ?? createDefaultMotionPath(panel.project, motionRegion),
        }
      : { cameraMode }
  );
}

function MotionScaleFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  if (props.motionRegion.focusMode === VideoMotionFocusMode.MANUAL_AREA) {
    return null;
  }

  return (
    <SliderField
      label={translate('videoEditor.sidebar.motionScaleLabel')}
      value={props.motionRegion.scale}
      min={1}
      max={4}
      step={0.05}
      onChange={(value) =>
        props.panel.onUpdateMotionRegion(props.motionRegion.id, { scale: value })
      }
      formatValue={(value) => `${Math.round(value * 100)}%`}
    />
  );
}

function MotionDurationField(props: {
  duration: number;
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <SliderField
      label={translate('videoEditor.sidebar.motionDurationLabel')}
      value={props.duration}
      min={0.1}
      max={5}
      step={0.05}
      onChange={(value) =>
        props.panel.onUpdateMotionRegion(props.motionRegionId, { duration: value })
      }
      formatValue={(value) => `${value.toFixed(2)} s`}
    />
  );
}

function MotionZoomFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <div className="space-y-3">
      <SliderField
        label={translate('videoEditor.sidebar.motionZoomInLabel')}
        value={props.motionRegion.zoomInDuration}
        min={0}
        max={5}
        step={0.05}
        onChange={(value) =>
          props.panel.onUpdateMotionRegion(props.motionRegion.id, { zoomInDuration: value })
        }
        formatValue={(value) => `${value.toFixed(2)} s`}
      />
      <SliderField
        label={translate('videoEditor.sidebar.motionZoomOutLabel')}
        value={props.motionRegion.zoomOutDuration}
        min={0}
        max={5}
        step={0.05}
        onChange={(value) =>
          props.panel.onUpdateMotionRegion(props.motionRegion.id, { zoomOutDuration: value })
        }
        formatValue={(value) => `${value.toFixed(2)} s`}
      />
    </div>
  );
}

function MotionPlacementFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  switch (props.motionRegion.focusMode) {
    case VideoMotionFocusMode.MANUAL:
      return <ManualFocusFields motionRegionId={props.motionRegion.id} panel={props.panel} />;
    case VideoMotionFocusMode.MANUAL_AREA:
      return <ManualAreaFields motionRegionId={props.motionRegion.id} panel={props.panel} />;
    case VideoMotionFocusMode.ACTION:
      return (
        <MotionTargetActionField
          motionRegionId={props.motionRegion.id}
          panel={props.panel}
          value={props.motionRegion.targetActionEventId}
        />
      );
    case VideoMotionFocusMode.CURSOR:
      return null;
  }
}

export function MotionOverview(props: { motionRegion: VideoProjectMotionRegion }) {
  const isMovingZoom = props.motionRegion.cameraMode === VideoMotionCameraMode.PATH;

  return (
    <div className="space-y-3">
      <p className={PANEL_HEADING_CLASS_NAME}>{translate('videoEditor.timeline.motionLane')}</p>
      <DetailList>
        <DetailItem
          label={translate('videoEditor.sidebar.motionCameraModeLabel')}
          value={
            isMovingZoom
              ? translate('videoEditor.sidebar.motionCameraModePath')
              : translate('videoEditor.sidebar.motionCameraModeStatic')
          }
        />
        <DetailItem
          label={translate('videoEditor.sidebar.motionFocusLabel')}
          value={
            isMovingZoom
              ? translate('videoEditor.sidebar.motionPathSummary')
              : getMotionFocusModeLabel(props.motionRegion.focusMode)
          }
        />
        <DetailItem
          label={translate('videoEditor.sidebar.actionTimePrefix')}
          value={`${props.motionRegion.startTime.toFixed(2)} s`}
        />
      </DetailList>
    </div>
  );
}

function getMotionFocusModeLabel(value: VideoMotionFocusMode): string {
  switch (value) {
    case VideoMotionFocusMode.MANUAL:
      return translate('videoEditor.sidebar.motionFocusManual');
    case VideoMotionFocusMode.MANUAL_AREA:
      return translate('videoEditor.sidebar.motionFocusManualArea');
    case VideoMotionFocusMode.CURSOR:
      return translate('videoEditor.sidebar.motionFocusCursor');
    case VideoMotionFocusMode.ACTION:
      return translate('videoEditor.sidebar.motionFocusAction');
  }
}
