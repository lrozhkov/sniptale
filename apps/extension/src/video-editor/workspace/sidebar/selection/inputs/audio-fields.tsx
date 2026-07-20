import { translate } from '../../../../../platform/i18n';
import { isAudioClip, isVideoClip } from '../../../../../features/video/project/timeline';
import { getClipGainRange } from '../../../../../features/video/project/timeline/basics';
import type { VideoProjectClip } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import { AudioEnvelopeFields, AudioMuteToggle, AudioVolumeField } from './audio-controls';

function renderSharedAudioFields(params: {
  clip: VideoProjectClip;
  disabled: boolean;
  label: string;
  onUpdateClipAudioEnvelope: WorkspaceSidebarProps['onUpdateClipAudioEnvelope'];
  onUpdateClipMuted: WorkspaceSidebarProps['onUpdateClipMuted'];
  onUpdateClipVolume: WorkspaceSidebarProps['onUpdateClipVolume'];
}) {
  const gainRange = getClipGainRange(params.clip);
  const sharedVolumeValue =
    Math.abs(gainRange.start - gainRange.end) < 0.0001
      ? gainRange.start
      : Number(((gainRange.start + gainRange.end) / 2).toFixed(2));

  return (
    <>
      <AudioMuteToggle
        checked={!params.clip.muted}
        disabled={params.disabled}
        label={params.label}
        onChange={(checked) => params.onUpdateClipMuted(params.clip.id, !checked)}
      />
      <AudioVolumeField
        disabled={params.disabled}
        value={sharedVolumeValue}
        onChange={(value) => params.onUpdateClipVolume(params.clip.id, value)}
      />
      <AudioEnvelopeFields
        disabled={params.disabled}
        endValue={gainRange.end}
        startValue={gainRange.start}
        onChange={(patch) => params.onUpdateClipAudioEnvelope(params.clip.id, patch)}
      />
    </>
  );
}

export function renderAudioFields(
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  linkedAudioClip: VideoProjectClip | null,
  linkedVideoClip: VideoProjectClip | null,
  selectedTrackLocked: boolean,
  onUpdateClipMuted: WorkspaceSidebarProps['onUpdateClipMuted'],
  onUpdateClipVolume: WorkspaceSidebarProps['onUpdateClipVolume'],
  onUpdateClipAudioEnvelope: WorkspaceSidebarProps['onUpdateClipAudioEnvelope']
) {
  if (!selectedClip) return null;

  if (isVideoClip(selectedClip) && !linkedAudioClip) {
    return renderSharedAudioFields({
      clip: selectedClip,
      disabled: selectedTrackLocked,
      label: translate('videoEditor.sidebar.videoSoundLabel'),
      onUpdateClipAudioEnvelope,
      onUpdateClipMuted,
      onUpdateClipVolume,
    });
  }

  if (!isAudioClip(selectedClip)) return null;
  return renderSharedAudioFields({
    clip: selectedClip,
    disabled: selectedTrackLocked,
    label: linkedVideoClip
      ? translate('videoEditor.sidebar.linkedAudioLabel')
      : translate('videoEditor.sidebar.audioClipLabel'),
    onUpdateClipAudioEnvelope,
    onUpdateClipMuted,
    onUpdateClipVolume,
  });
}
