import { parseCompositionJoinSettings } from './composition-join';
import { isRecord, isString } from '../validation/primitives';
import type { VideoProject, VideoProjectAsset } from '../types/model';
import {
  createBookendImagePresentation,
  createBookendVideoPresentation,
  parseBookendImagePresentation,
  parseBookendVideoPresentation,
} from './bookend-media';
import type {
  VideoProjectBookendPreset,
  VideoProjectBookendPresets,
} from './bookend-presets-types';

/** Absence remains absent until an explicit authoring command. */
export function createVideoProjectBookendPresets(): VideoProjectBookendPresets {
  return { intro: { mode: 'none' }, outro: { mode: 'none' } };
}
function hasFields(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function parseSlot(value: unknown): VideoProjectBookendPreset | null {
  if (!isRecord(value) || !hasFields(value, ['mode', 'image', 'video'])) return null;
  const image = value['image'];
  const video = value['video'];
  if (
    image !== undefined &&
    (!isRecord(image) ||
      !hasFields(image, ['assetId', 'fit', 'fillColor', 'crop', 'duration']) ||
      !isString(image['assetId']) ||
      !image['assetId'].length)
  )
    return null;
  if (
    video !== undefined &&
    (!isRecord(video) ||
      !hasFields(video, ['assetId', 'fit', 'fillColor', 'crop', 'trim', 'audio']) ||
      !isString(video['assetId']) ||
      !video['assetId'].length)
  )
    return null;
  const imageSettings = image === undefined ? undefined : parseBookendImagePresentation(image);
  const videoSettings = video === undefined ? undefined : parseBookendVideoPresentation(video);
  if (imageSettings === null || videoSettings === null) return null;
  const variants = {
    ...(imageSettings && isRecord(image) && isString(image['assetId'])
      ? { image: { ...imageSettings, assetId: image['assetId'] } }
      : {}),
    ...(videoSettings && isRecord(video) && isString(video['assetId'])
      ? { video: { ...videoSettings, assetId: video['assetId'] } }
      : {}),
  };
  if (value['mode'] === 'none') return { mode: 'none', ...variants };
  if (value['mode'] === 'image' && variants.image)
    return { ...variants, mode: 'image', image: variants.image };
  if (value['mode'] === 'video' && variants.video)
    return { ...variants, mode: 'video', video: variants.video };
  return null;
}

/** Refuses malformed remembered settings as well as malformed active settings. */
export function parseVideoProjectBookendPresets(value: unknown): VideoProjectBookendPresets | null {
  if (
    !isRecord(value) ||
    !hasFields(value, ['intro', 'outro', 'introTransition', 'outroTransition'])
  )
    return null;
  for (const key of ['introTransition', 'outroTransition']) {
    const setting = value[key];
    if (
      setting !== undefined &&
      (!isRecord(setting) || !hasFields(setting, ['type', 'before', 'after', 'color']))
    )
      return null;
  }
  const intro = parseSlot(value['intro']);
  const outro = parseSlot(value['outro']);
  const introTransition =
    value['introTransition'] === undefined
      ? undefined
      : parseCompositionJoinSettings(value['introTransition']);
  const outroTransition =
    value['outroTransition'] === undefined
      ? undefined
      : parseCompositionJoinSettings(value['outroTransition']);
  if (introTransition === null || outroTransition === null) return null;
  return intro && outro
    ? {
        intro,
        outro,
        ...(introTransition ? { introTransition } : {}),
        ...(outroTransition ? { outroTransition } : {}),
      }
    : null;
}

/** All retained recipes refer to declared compatible materials, even in None mode. */
export function hasValidVideoProjectBookendReferences(project: VideoProject): boolean {
  if (!project.bookendPresets) return true;
  return [project.bookendPresets.intro, project.bookendPresets.outro].every((slot) => {
    const image = slot.image && project.assets.find((asset) => asset.id === slot.image?.assetId);
    const video = slot.video && project.assets.find((asset) => asset.id === slot.video?.assetId);
    return (
      (!slot.image ||
        (image?.type === 'IMAGE' && image.metadata.width > 0 && image.metadata.height > 0)) &&
      (!slot.video ||
        ((video?.type === 'VIDEO' || video?.type === 'RECORDING') &&
          video.metadata.width > 0 &&
          video.metadata.height > 0 &&
          video.metadata.duration !== null &&
          slot.video.trim.end <= video.metadata.duration))
    );
  });
}

/** Replacing a material retains the other kind and the prior framing and gain. */
export function selectVideoProjectBookendMaterial(
  previous: VideoProjectBookendPreset,
  asset: VideoProjectAsset
): VideoProjectBookendPreset | null {
  if (asset.metadata.width <= 0 || asset.metadata.height <= 0) return null;
  if (asset.type === 'IMAGE')
    return {
      ...previous,
      mode: 'image',
      image: { ...createBookendImagePresentation(), ...previous.image, assetId: asset.id },
    };
  if (asset.type === 'AUDIO' || !asset.metadata.duration) return null;
  const defaults = createBookendVideoPresentation(asset.metadata.duration);
  return {
    ...previous,
    mode: 'video',
    video: {
      ...defaults,
      ...previous.video,
      assetId: asset.id,
      trim: defaults.trim,
      audio: { muted: false, gain: previous.video?.audio.gain ?? 1 },
    },
  };
}

/** Confirmed source removal clears exact references without removing other variants. */
export function removeVideoProjectBookendSources(
  presets: VideoProjectBookendPresets,
  removed: ReadonlySet<string>
): VideoProjectBookendPresets {
  const clear = (slot: VideoProjectBookendPreset): VideoProjectBookendPreset => {
    const image = slot.image && !removed.has(slot.image.assetId) ? slot.image : undefined;
    const video = slot.video && !removed.has(slot.video.assetId) ? slot.video : undefined;
    const variants = { ...(image ? { image } : {}), ...(video ? { video } : {}) };
    if (slot.mode === 'image' && image) return { ...variants, mode: 'image', image };
    if (slot.mode === 'video' && video) return { ...variants, mode: 'video', video };
    return { ...variants, mode: 'none' };
  };
  return { ...presets, intro: clear(presets.intro), outro: clear(presets.outro) };
}
