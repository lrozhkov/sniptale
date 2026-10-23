import { createBookendClipPresentation } from '../../../../features/video/project/scene/bookend-presets';
import type { VideoProjectBookendPreset } from '../../../../features/video/project/scene/bookend-presets-types';
import type { VideoProject } from '../../../../features/video/project/types/model';
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

/** Existing timeline placement retains history while the scene owner styles only the new clips. */
export function applyBookendMaterialPresentation(
  previous: VideoProject,
  placement: AddAssetClipResult,
  preset: ActivePreset
): AddAssetClipResult | null {
  if (!placement.selectedClipId) return null;
  const existing = new Set(previous.clips.map(({ id }) => id));
  const styled = createBookendClipPresentation(
    placement.project,
    placement.project.clips.filter(({ id }) => !existing.has(id)),
    placement.selectedClipId,
    preset
  );
  return styled
    ? {
        ...placement,
        project: {
          ...placement.project,
          clips: [...placement.project.clips.filter(({ id }) => existing.has(id)), ...styled.clips],
          tracks: [...placement.project.tracks, styled.track],
        },
      }
    : null;
}
