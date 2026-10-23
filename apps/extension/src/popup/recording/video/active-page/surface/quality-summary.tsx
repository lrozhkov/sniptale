import type { VideoOutputProfile } from '@sniptale/runtime-contracts/video/types/types';
import { getQualityOption } from '../../settings/quality-card/options';
import {
  getOutputCodecLabel,
  getOutputContainerLabel,
  getOutputResolutionLabel,
} from '../../settings/output-card/options';

export function VideoRecordingQualitySummary({
  profile,
}: {
  profile?: VideoOutputProfile | null | undefined;
}) {
  if (!profile) return null;
  const summary = [
    getOutputContainerLabel(profile.container),
    getOutputCodecLabel(profile.codec),
    getOutputResolutionLabel(profile.resolution),
    `${profile.frameRate} fps`,
    getQualityOption(profile.quality).label,
  ].join(' · ');
  return (
    <p
      data-ui="popup.video-active.quality-summary"
      className="mt-2 text-pretty text-[11px] leading-4 text-[var(--sniptale-color-text-secondary)]"
    >
      {summary}
    </p>
  );
}
