import {
  getDefaultVideoOutputCodec,
  getVideoRecordingMimeTypeCandidates,
  getVideoRecordingProfiles,
  isVideoOutputCodecCompatible,
  isVideoRecordingProfileConfigurationMatch,
  isVideoResolutionFrameRateSupported,
  VideoOutputCodec,
  VideoResolutionPreset,
  type VideoOutputContainer,
  type VideoOutputProfile,
} from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingSurfaceOutputSettings } from '@sniptale/runtime-contracts/video/types/messages.surface';
import { translate } from '../../../../platform/i18n';

export function getToolbarResolutionLabel(resolution: VideoResolutionPreset): string {
  return resolution === VideoResolutionPreset.SOURCE
    ? translate('popup.video.outputResolutionSource')
    : resolution.toLowerCase();
}

export function getToolbarCodecLabel(codec: VideoOutputCodec): string {
  return codec === VideoOutputCodec.AVC ? 'H.264 (AVC)' : codec;
}

export function getToolbarOutputSummary(profile: VideoOutputProfile): string {
  return [
    profile.container === 'WEBM' ? 'WebM' : 'MP4',
    getToolbarCodecLabel(profile.codec),
    getToolbarResolutionLabel(profile.resolution),
    `${profile.frameRate} fps`,
  ].join(' · ');
}

export function getToolbarQualityOptions(settings: VideoRecordingSurfaceOutputSettings) {
  const builtInLabels = new Map<string, string>(
    Object.entries({
      'builtin:compact': translate('popup.video.profileCompact'),
      'builtin:optimal': translate('popup.video.profileOptimal'),
      'builtin:high': translate('popup.video.profileHigh'),
      'builtin:maximum': translate('popup.video.profileMaximum'),
    })
  );
  return getVideoRecordingProfiles(settings).map((profile) => ({
    ...profile,
    label: builtInLabels.get(profile.id) ?? profile.name,
    selected:
      profile.id === settings.qualityProfileId &&
      isVideoRecordingProfileConfigurationMatch(profile, settings.outputProfile),
    summary: getToolbarOutputSummary(profile.configuration),
    disabled: !isToolbarOutputSupported(profile.configuration),
  }));
}

export function isToolbarOutputSupported(profile: VideoOutputProfile): boolean {
  if (!isVideoResolutionFrameRateSupported(profile.resolution, profile.frameRate)) return false;
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function')
    return true;
  // Source acquisition performs the final check for the actual audio layout.
  return [false, true].some((audio) =>
    getVideoRecordingMimeTypeCandidates(profile, audio).some((mime) =>
      MediaRecorder.isTypeSupported(mime)
    )
  );
}

export function resolveToolbarOutputContainer(
  current: VideoOutputProfile,
  container: VideoOutputContainer
): VideoOutputProfile {
  const codecs = [VideoOutputCodec.VP9, VideoOutputCodec.VP8, VideoOutputCodec.AVC].filter(
    (codec) => isVideoOutputCodecCompatible(container, codec)
  );
  const codec = codecs.includes(current.codec)
    ? current.codec
    : (codecs.find((codec) => isToolbarOutputSupported({ ...current, container, codec })) ??
      getDefaultVideoOutputCodec(container));
  return { ...current, container, codec };
}
