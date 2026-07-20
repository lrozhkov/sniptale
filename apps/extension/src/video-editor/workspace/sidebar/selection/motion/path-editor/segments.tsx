import { translate } from '../../../../../../platform/i18n';
import { VideoMotionPathTrajectoryPreset } from '../../../../../../features/video/project/types';
import type { VideoProjectMotionPathSegment } from '../../../../../../features/video/project/types';
import { updateMotionPathSegment } from '../../../../../project/motion-path/core';
import { getTemporalEasingOptions } from '../../effect-controls/options';
import {
  createSegmentLabel,
  type MotionPathEditorProps,
  PATH_CARD_CLASS_NAME,
  patchMotionPath,
} from './shared';
import { SelectInput } from '../../shared/controls';
import { PANEL_DIVIDER_CLASS_NAME, PANEL_META_CLASS_NAME } from '../../shared/panel';
import { SliderField } from '../../shared/sliders';

export function MotionPathSegmentSection(
  props: MotionPathEditorProps & { fromIndex: number; segment: VideoProjectMotionPathSegment }
) {
  return (
    <section className={`${PATH_CARD_CLASS_NAME} ${PANEL_DIVIDER_CLASS_NAME}`}>
      <p className={PANEL_META_CLASS_NAME}>{createSegmentLabel(props.fromIndex)}</p>
      <SelectInput
        label={translate('videoEditor.sidebar.motionPathTrajectoryLabel')}
        value={props.segment.trajectoryPreset}
        onChange={(value) => updateSegment(props, { trajectoryPreset: value })}
        options={[
          {
            value: VideoMotionPathTrajectoryPreset.LINEAR,
            label: translate('videoEditor.sidebar.motionPathTrajectoryLinear'),
          },
          {
            value: VideoMotionPathTrajectoryPreset.SOFT_ARC,
            label: translate('videoEditor.sidebar.motionPathTrajectorySoftArc'),
          },
        ]}
      />
      <SelectInput
        label={translate('videoEditor.sidebar.motionEasingLabel')}
        value={props.segment.easing}
        onChange={(value) => updateSegment(props, { easing: value })}
        options={getTemporalEasingOptions()}
      />
      <SliderField
        label={translate('videoEditor.sidebar.motionPathSpeedLabel')}
        value={resolveSegmentSpeed(props.segment)}
        min={0.25}
        max={4}
        step={0.25}
        onChange={(value) => updateSegment(props, { durationWeight: 1 / value })}
        formatValue={(value) => `${value.toFixed(2)}x`}
      />
    </section>
  );
}

function updateSegment(
  props: MotionPathEditorProps & { fromIndex: number; segment: VideoProjectMotionPathSegment },
  patch: Partial<VideoProjectMotionPathSegment>
) {
  const nextPath = updateMotionPathSegment(props.path, props.fromIndex, (segment) => ({
    ...segment,
    ...patch,
  }));

  patchMotionPath(props.panel, props.motionRegion.id, nextPath);
}

function resolveSegmentSpeed(segment: VideoProjectMotionPathSegment) {
  return Math.max(0.25, Math.min(4, 1 / Math.max(0.05, segment.durationWeight)));
}
