import { translate } from '../../../../../platform/i18n';
import { isAudioClip, isVideoClip } from '../../../../../features/video/project/timeline';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import {
  formatPlaybackRateLabel,
  getPlaybackRateSliderProps,
  mapSliderValueToPlaybackRate,
} from '../../../../runtime/playback/rate-slider';
import {
  VIDEO_EDITOR_PLAYBACK_RATE_MAX,
  VIDEO_EDITOR_PLAYBACK_RATE_MIN,
} from '../../../../project/state/clip-property/playback-rate';
import { SliderField } from '../shared/sliders';

function renderClipFadeFields(
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  selectedTrackLocked: boolean,
  onUpdateClipFades: WorkspaceSidebarProps['onUpdateClipFades']
) {
  if (!selectedClip) return null;
  return (
    <div className="space-y-3">
      <SliderField
        label={translate('videoEditor.sidebar.fadeInLabel')}
        disabled={selectedTrackLocked}
        value={selectedClip.fadeInMs / 1000}
        min={0}
        max={5}
        step={0.05}
        onChange={(value) =>
          onUpdateClipFades(selectedClip.id, { fadeInMs: Math.max(0, Math.round(value * 1000)) })
        }
        formatValue={(value) => `${value.toFixed(2)} s`}
      />
      <SliderField
        label={translate('videoEditor.sidebar.fadeOutLabel')}
        disabled={selectedTrackLocked}
        value={selectedClip.fadeOutMs / 1000}
        min={0}
        max={5}
        step={0.05}
        onChange={(value) =>
          onUpdateClipFades(selectedClip.id, { fadeOutMs: Math.max(0, Math.round(value * 1000)) })
        }
        formatValue={(value) => `${value.toFixed(2)} s`}
      />
    </div>
  );
}

function renderClipPlaybackRateField(
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  selectedTrackLocked: boolean,
  onUpdateClipPlaybackRate: WorkspaceSidebarProps['onUpdateClipPlaybackRate']
) {
  if (!selectedClip || (!isVideoClip(selectedClip) && !isAudioClip(selectedClip))) return null;
  const playbackRate = selectedClip.playbackRate ?? 1;
  const sliderProps = getPlaybackRateSliderProps(playbackRate);

  return (
    <SliderField
      label={translate('videoEditor.sidebar.playbackRateLabel')}
      disabled={selectedTrackLocked}
      value={playbackRate}
      min={VIDEO_EDITOR_PLAYBACK_RATE_MIN}
      max={VIDEO_EDITOR_PLAYBACK_RATE_MAX}
      step={0.01}
      scrubMin={sliderProps.min}
      scrubMax={sliderProps.max}
      scrubStep={sliderProps.step}
      scrubValue={sliderProps.value}
      scrubValueToDisplayValue={mapSliderValueToPlaybackRate}
      onChange={(value) => onUpdateClipPlaybackRate?.(selectedClip.id, value)}
      formatValue={formatPlaybackRateLabel}
    />
  );
}

export function renderClipTimingFields(
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  selectedTrackLocked: boolean,
  onUpdateClipFades: WorkspaceSidebarProps['onUpdateClipFades'],
  onUpdateClipPlaybackRate: WorkspaceSidebarProps['onUpdateClipPlaybackRate']
) {
  if (!selectedClip) return null;
  return (
    <>
      {renderClipPlaybackRateField(selectedClip, selectedTrackLocked, onUpdateClipPlaybackRate)}
      {renderClipFadeFields(selectedClip, selectedTrackLocked, onUpdateClipFades)}
    </>
  );
}
