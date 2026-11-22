import { EffectSourceTimingRestore } from '../effect-instance/groups';
import { getAudioFadeLimitSeconds } from '../../../../../features/video/audio/fades';
import { DetailItem, DetailList } from '../shared/panel';
import { InspectorDetails } from '../shared/details';
import { ClipSourceRangeControls } from './source-range';
import { ClipOrderControls } from './clip-order';
import { translate } from '../../../../../platform/i18n';
import { isAudioClip, isVideoClip } from '../../../../../features/video/project/timeline';
import {
  formatPlaybackRateLabel,
  getPlaybackRateSliderProps,
  mapSliderValueToPlaybackRate,
} from '../../../../runtime/playback/rate-slider';
import {
  VIDEO_EDITOR_PLAYBACK_RATE_MAX,
  VIDEO_EDITOR_PLAYBACK_RATE_MIN,
} from '../../../../project/state/clip-property/playback-rate';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { NumberInput } from './number';
import { SliderField } from '../shared/sliders';

type ClipTimingControlsProps = WorkspaceSidebarSelectionPanelProps & {
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>;
  locked: boolean;
};

export function ClipTimingControls(props: ClipTimingControlsProps) {
  return (
    <>
      {isVideoClip(props.clip) || isAudioClip(props.clip) ? (
        <div className="mt-3">
          <ClipPlaybackRateField
            clipId={props.clip.id}
            disabled={props.locked}
            playbackRate={props.clip.playbackRate}
            onUpdateClipPlaybackRate={props.onUpdateClipPlaybackRate}
          />
        </div>
      ) : null}
      {(isVideoClip(props.clip) || isAudioClip(props.clip)) &&
      props.onTrimClipStart &&
      props.onTrimClipEnd ? (
        <InspectorDetails
          preferenceId="clip-timing:videoEditor.sidebar.inspectorSourceBounds"
          label={translate('videoEditor.sidebar.inspectorSourceBounds')}
        >
          <ClipSourceRangeControls
            key={props.clip.id}
            project={props.project}
            clip={props.clip}
            locked={props.locked}
            onTrimClipStart={props.onTrimClipStart}
            onTrimClipEnd={props.onTrimClipEnd}
          />
        </InspectorDetails>
      ) : null}
      {props.onSwapClip ? (
        <ClipOrderControls
          project={props.project}
          clipId={props.clip.id}
          onSwapClip={props.onSwapClip}
        />
      ) : null}
      {!isVideoClip(props.clip) && !isAudioClip(props.clip) ? (
        <DetailList>
          <DetailItem
            label={translate('videoEditor.sidebar.motionDurationLabel')}
            value={`${props.clip.duration.toFixed(2)} ${translate('videoEditor.sidebar.typingSeconds')}`}
          />
        </DetailList>
      ) : null}
      {props.clip.type === 'EFFECT' && props.clip.sourceRange ? (
        <EffectSourceTimingRestore
          project={props.project}
          host={props.clip}
          separated
          disabled={props.locked}
        />
      ) : null}
    </>
  );
}

export function ClipFadeFields(props: {
  audio?: boolean;
  duration: number;
  clipId: string;
  fadeInMs: number;
  fadeOutMs: number;
  locked: boolean;
  onUpdateClipFades: WorkspaceSidebarSelectionPanelProps['onUpdateClipFades'];
}) {
  const fields = [
    {
      key: 'fadeInMs',
      label: props.audio
        ? 'videoEditor.sidebar.inspectorAudioFadeIn'
        : 'videoEditor.sidebar.fadeInLabel',
    },
    {
      key: 'fadeOutMs',
      label: props.audio
        ? 'videoEditor.sidebar.inspectorAudioFadeOut'
        : 'videoEditor.sidebar.fadeOutLabel',
    },
  ] as const;
  const max = props.audio ? getAudioFadeLimitSeconds(props.duration) : Math.min(5, props.duration);
  return (
    <div className="sniptale-parameter-stack space-y-3">
      {fields.map(({ key, label }) => (
        <NumberInput
          key={key}
          label={translate(label)}
          value={props[key] / 1000}
          min={0}
          max={max}
          step={0.05}
          disabled={props.locked}
          unit="s"
          onChange={(value) =>
            props.onUpdateClipFades(props.clipId, { [key]: Math.round(value * 1000) })
          }
        />
      ))}
    </div>
  );
}

function ClipPlaybackRateField(props: {
  clipId: string;
  disabled: boolean;
  playbackRate: number | undefined;
  onUpdateClipPlaybackRate: WorkspaceSidebarSelectionPanelProps['onUpdateClipPlaybackRate'];
}) {
  const playbackRate = props.playbackRate ?? 1;
  const sliderProps = getPlaybackRateSliderProps(playbackRate);

  return (
    <SliderField
      label={translate('videoEditor.sidebar.playbackRateLabel')}
      value={playbackRate}
      precision={4}
      min={VIDEO_EDITOR_PLAYBACK_RATE_MIN}
      max={VIDEO_EDITOR_PLAYBACK_RATE_MAX}
      step={0.01}
      scrubMin={sliderProps.min}
      scrubMax={sliderProps.max}
      scrubStep={sliderProps.step}
      scrubValue={sliderProps.value}
      scrubValueToDisplayValue={mapSliderValueToPlaybackRate}
      disabled={props.disabled}
      formatValue={formatPlaybackRateLabel}
      onChange={(value) => props.onUpdateClipPlaybackRate?.(props.clipId, value)}
    />
  );
}
