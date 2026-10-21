import {
  createClipGroupId,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import { createShapeClip } from '../../../../features/video/project/factories/overlay-clip';
import { resolveMediaFitFrame } from '../../../../features/video/project/window-geometry';
import type { VideoProjectBookendPreset } from '../../../../features/video/project/scene/bookend-presets-types';
import type { VideoProject } from '../../../../features/video/project/types/model';
import { translate } from '../../../../platform/i18n';
import type { AddAssetClipResult } from '../asset-shared';

type ActivePreset = Exclude<VideoProjectBookendPreset, { mode: 'none' }>;

/** An explicit material insertion uses a recipe only for the matching material and edge. */
export function resolveBookendMaterialPresentation(
  project: VideoProject,
  side: 'intro' | 'outro',
  assetId: string
): ActivePreset | null {
  const slot = project.bookendPresets?.[side];
  if (slot?.mode === 'image' && slot.image.assetId === assetId) return slot;
  if (slot?.mode === 'video' && slot.video.assetId === assetId) return slot;
  return null;
}

/** Creates independent ordinary clips; no later recipe edit can rebuild this instance. */
export function applyBookendMaterialPresentation(
  previous: VideoProject,
  placement: AddAssetClipResult,
  preset: ActivePreset
): AddAssetClipResult | null {
  const main = placement.project.clips.find((clip) => clip.id === placement.selectedClipId);
  if (!main || (main.type !== 'IMAGE' && main.type !== 'VIDEO')) return null;
  if ((preset.mode === 'image') !== (main.type === 'IMAGE')) return null;
  const asset = previous.assets.find((item) => item.id === main.assetId);
  if (!asset || asset.metadata.width <= 0 || asset.metadata.height <= 0) return null;
  const settings = preset.mode === 'image' ? preset.image : preset.video;
  const frame = resolveMediaFitFrame({
    source: asset.metadata,
    output: previous,
    fit: settings.fit,
    crop: settings.crop,
  });
  const duration = preset.mode === 'image' ? preset.image.duration : main.duration;
  const groupId = main.groupId ?? createClipGroupId();
  const oldIds = new Set(previous.clips.map(({ id }) => id));
  const clips = placement.project.clips.map((clip) => {
    if (oldIds.has(clip.id)) return clip;
    const grouped = { ...clip, groupId, linkMode: 'LINKED' as const };
    if (clip.type === 'AUDIO' && preset.mode === 'video')
      return {
        ...grouped,
        muted: preset.video.audio.muted,
        volume: preset.video.audio.gain,
        audioGainStart: preset.video.audio.gain,
        audioGainEnd: preset.video.audio.gain,
      };
    if (clip.id !== main.id) return grouped;
    if (settings.fit === 'contain')
      return {
        ...grouped,
        duration,
        transform: {
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          rotation: 0,
          opacity: 1,
        },
      };
    const width = Math.min(1, previous.width / frame.width);
    const height = Math.min(1, previous.height / frame.height);
    return {
      ...grouped,
      duration,
      fitMode: 'COVER' as const,
      sourceCrop: {
        x: Math.max(0, Math.min(1 - width, -frame.x / frame.width)),
        y: Math.max(0, Math.min(1 - height, -frame.y / frame.height)),
        width,
        height,
      },
      transform: {
        x: 0,
        y: 0,
        width: previous.width,
        height: previous.height,
        rotation: 0,
        opacity: 1,
      },
    };
  });
  const track = createVideoProjectTrack(
    translate('gallery.videoReview.presentationFill'),
    Math.max(0, ...placement.project.tracks.map(({ order }) => order)) + 1,
    'PRIMARY'
  );
  const background = createShapeClip(
    track.id,
    previous.width,
    previous.height,
    main.startTime,
    'RECTANGLE'
  );
  clips.push({
    ...background,
    name: translate('gallery.videoReview.presentationFill'),
    duration,
    groupId,
    linkMode: 'LINKED',
    transform: {
      x: 0,
      y: 0,
      width: previous.width,
      height: previous.height,
      rotation: 0,
      opacity: 1,
    },
    style: { ...background.style, fillColor: settings.fillColor, strokeWidth: 0, borderRadius: 0 },
  });
  return {
    ...placement,
    project: { ...placement.project, clips, tracks: [...placement.project.tracks, track] },
  };
}
