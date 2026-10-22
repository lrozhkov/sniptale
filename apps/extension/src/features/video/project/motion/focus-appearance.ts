import {
  createQuickEditBorder,
  createQuickEditSpotlight,
  parseQuickEditBorder,
  parseQuickEditSpotlight,
  clampQuickEditSpotlightArea,
  type QuickEditBorder,
  type QuickEditSpotlight,
} from '../scene/focus-appearance';
import { isBoundedNumber, isRecord } from '../validation/primitives';
import type { VideoProject, VideoProjectMotionRegion } from '../types';

type AppearancePatch<T extends { area: QuickEditSpotlight['area'] }> = Omit<Partial<T>, 'area'> & {
  area?: Partial<T['area']>;
};

/** Explicit activation can change mode. Partial edits cannot revive a removed appearance. */
export type MotionFocusEdit =
  | {
      kind: 'border';
      enabled?: boolean;
      target?: 'viewport' | 'window';
      settings?: AppearancePatch<QuickEditBorder>;
    }
  | {
      kind: 'spotlight';
      enabled?: boolean;
      target?: 'viewport' | 'window' | 'scene' | 'source-scene';
      settings?: AppearancePatch<QuickEditSpotlight>;
    };

/** Merge against accepted authoring while retaining its clock and dormant camera values. */
export function editMotionFocus(
  project: Pick<VideoProject, 'clips'>,
  region: VideoProjectMotionRegion,
  edit: MotionFocusEdit
): VideoProjectMotionRegion | null {
  if (!isMotionFocusEdit(edit)) return null;
  const active = edit.kind === 'border' ? region.border : region.spotlight;
  if (!(edit.enabled ?? active !== undefined)) {
    if (edit.settings !== undefined || edit.target !== undefined) return null;
    if (!active) return region;
    if (edit.kind === 'border') {
      const { border: _border, borderTarget: _target, ...retained } = region;
      return retained;
    }
    const { spotlight: _spotlight, spotlightTarget: _target, ...retained } = region;
    return retained;
  }
  const target =
    edit.target ??
    (edit.kind === 'border' ? region.borderTarget : region.spotlightTarget) ??
    (region.sourceBinding ? 'window' : 'viewport');
  if (
    target !== 'viewport' &&
    !project.clips.some((clip) => clip.type === 'VIDEO' && clip.id === region.sourceBinding?.clipId)
  )
    return null;
  if (edit.settings?.area !== undefined && !isMotionFocusAreaPatch(edit.settings.area)) return null;
  if (edit.kind === 'border') {
    const previous = region.border ?? createQuickEditBorder();
    const border = parseQuickEditBorder({
      ...previous,
      ...edit.settings,
      area: clampQuickEditSpotlightArea({ ...previous.area, ...edit.settings?.area }),
    });
    if (!border || target === 'scene' || target === 'source-scene') return null;
    if (
      !region.spotlight &&
      target === region.borderTarget &&
      JSON.stringify(border) === JSON.stringify(parseQuickEditBorder(region.border))
    )
      return region;
    const { spotlight: _spotlight, spotlightTarget: _target, ...retained } = region;
    return { ...retained, border, borderTarget: target };
  }
  const previous = region.spotlight ?? createQuickEditSpotlight();
  const spotlight = parseQuickEditSpotlight({
    ...previous,
    ...edit.settings,
    area: clampQuickEditSpotlightArea({ ...previous.area, ...edit.settings?.area }),
  });
  if (!spotlight) return null;
  if (
    !region.border &&
    target === region.spotlightTarget &&
    JSON.stringify(spotlight) === JSON.stringify(parseQuickEditSpotlight(region.spotlight))
  )
    return region;
  const { border: _border, borderTarget: _target, ...retained } = region;
  return { ...retained, spotlight, spotlightTarget: target };
}

function isMotionFocusEdit(edit: MotionFocusEdit): boolean {
  if (edit.kind !== 'border' && edit.kind !== 'spotlight') return false;
  if (edit.enabled !== undefined && typeof edit.enabled !== 'boolean') return false;
  if (
    edit.target !== undefined &&
    edit.target !== 'window' &&
    edit.target !== 'viewport' &&
    (edit.kind !== 'spotlight' || (edit.target !== 'scene' && edit.target !== 'source-scene'))
  )
    return false;
  return edit.settings === undefined || isRecord(edit.settings);
}

function isMotionFocusAreaPatch(area: unknown): boolean {
  if (!isRecord(area)) return false;
  const minimums: Readonly<Record<string, number>> = { x: 0, y: 0, width: 0.01, height: 0.01 };
  return Object.entries(area).every(([key, value]) => {
    const minimum = minimums[key];
    return (
      Object.hasOwn(minimums, key) &&
      typeof minimum === 'number' &&
      isBoundedNumber(value, minimum, 1)
    );
  });
}
