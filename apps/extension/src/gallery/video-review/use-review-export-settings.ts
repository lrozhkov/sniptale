import { useEffect, useState } from 'react';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import {
  supportedReviewVideoCodecs,
  type ReviewMediaIndex,
  type ReviewRenderSettings,
} from '../../workflows/video-review/media-index';
import { resolveReviewOutputProfile } from '../../workflows/video-review/render-settings';

/** Session-local settings and latest-profile capability probe; stale probe results never enable export. */
export function useReviewExportSettings(
  source: ReviewMediaIndex | null,
  advanced: QuickEditAdvancedState
) {
  const [renderSettings, setRenderSettings] = useState<ReviewRenderSettings>({
    quality: 'HIGH',
    frameRate: 0,
  });
  const [probe, setProbe] = useState<{
    source: ReviewMediaIndex | null;
    key: string;
    codecs: NonNullable<ReviewMediaIndex['outputCodecs']>;
  } | null>(null);
  const profile = source ? resolveReviewOutputProfile(source, advanced, renderSettings) : null;
  const enabled = !!source && advanced.ui.mode === 'advanced';
  const width = profile?.width ?? 0;
  const height = profile?.height ?? 0;
  const bitrate = profile?.bitrate ?? 0;
  const fps = profile?.fps ?? 30;
  const key = JSON.stringify([width, height, bitrate, fps]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const dimensions = { width, height, bitrate, fps };
    void Promise.all([
      supportedReviewVideoCodecs('mp4', dimensions),
      supportedReviewVideoCodecs('webm', dimensions),
    ])
      .then(([mp4, webm]) => {
        if (current) setProbe({ source, key, codecs: { mp4, webm } });
      })
      .catch(() => {
        if (current) setProbe({ source, key, codecs: { mp4: [], webm: [] } });
      });
    return () => {
      current = false;
    };
  }, [source, enabled, width, height, bitrate, fps, key]);
  const index =
    source && enabled
      ? {
          ...source,
          outputCodecs:
            probe?.source === source && probe.key === key ? probe.codecs : { mp4: [], webm: [] },
        }
      : source;
  const checkingCodecs = enabled && !(probe?.source === source && probe.key === key);
  return { index, renderSettings, setRenderSettings, checkingCodecs };
}
