import { materializeVideoProjectCursorSourceObservations } from '../project/cursor-source-observations';
import type { CompositionJoinSettings } from '../project/scene/composition-join';
import { calculateProjectDuration } from '../project/timeline/basics';
import { resolveVideoProjectCompositionJoinPlans } from '../project/scene/joins';
import type { ReviewSource } from './types';
import { parseReviewSource } from './validation';
import { createAudioClipFromAsset, createVideoClipFromAsset } from '../project/factories/clip';
import { createVideoProjectTrack } from '../project/factories/creation';
import { createBookendClipPresentation } from '../project/scene/bookend-presets';
import type { VideoProjectBookendPreset } from '../project/scene/bookend-presets-types';
import { prefixVideoProjectComposition } from '../project/timeline/composition-prefix';
import type { VideoProject, VideoProjectAsset, VideoProjectClip } from '../project/types/model';
import { isVideoProjectAsset } from '../project/validation/assets';
import {
  resolvePresentationSettings,
  type QuickEditPresentationSettings,
} from './advanced/presentation';
import {
  planReviewPresentationSequence,
  presentationMainHoldTime,
  type PresentationSequencePlan,
} from './presentation-sequence';

/** Immutable media admitted by the existing workspace resource workflow. */
export interface ReviewProjectBookendResource {
  reviewAssetId: string;
  asset: VideoProjectAsset;
  /** Verified video-track facts can differ from full-container metadata. */
  source?: ReviewSource;
}

/** Both remembered variants remain dependencies when the active edge mode changes. */
export function reviewProjectBookendReferences(
  settings: QuickEditPresentationSettings | undefined
) {
  const slots = settings ? [settings.intro, settings.outro] : [];
  return {
    images: [...new Set(slots.flatMap((slot) => (slot.image ? [slot.image.assetId] : [])))],
    videos: [...new Set(slots.flatMap((slot) => (slot.video ? [slot.video.assetId] : [])))],
  };
}

function admittedResources(
  settings: QuickEditPresentationSettings,
  supplied: readonly ReviewProjectBookendResource[],
  project: VideoProject
): Map<string, VideoProjectAsset> | null {
  const references = reviewProjectBookendReferences(settings);
  const wanted = new Set([...references.images, ...references.videos]);
  if (supplied.length !== wanted.size) return null;
  const resources = new Map<string, VideoProjectAsset>();
  const ids = new Set<string>();
  const sources = new Map<string, ReviewSource>();
  for (const { reviewAssetId, asset, source } of supplied) {
    if (
      !wanted.has(reviewAssetId) ||
      resources.has(reviewAssetId) ||
      ids.has(asset.id) ||
      !/^project-asset:\S{1,242}$/u.test(reviewAssetId) ||
      !isVideoProjectAsset(asset) ||
      asset.source.kind !== 'project-asset' ||
      asset.source.projectAssetId !== reviewAssetId.slice('project-asset:'.length)
    )
      return null;
    const videoSource = source === undefined ? undefined : parseReviewSource(source);
    if (asset.type === 'VIDEO' ? !videoSource : source !== undefined) return null;
    if (videoSource) sources.set(reviewAssetId, videoSource);
    const existing = project.assets.find(({ id }) => id === asset.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(asset)) return null;
    resources.set(reviewAssetId, structuredClone(asset));
    ids.add(asset.id);
  }
  for (const slot of [settings.intro, settings.outro]) {
    if (slot.image) {
      const asset = resources.get(slot.image.assetId);
      if (
        !asset ||
        asset.type !== 'IMAGE' ||
        asset.metadata.duration !== null ||
        asset.metadata.hasAudio ||
        asset.metadata.width !== slot.image.width ||
        asset.metadata.height !== slot.image.height ||
        !asset.metadata.mimeType.startsWith('image/')
      )
        return null;
    }
    if (slot.video) {
      const asset = resources.get(slot.video.assetId);
      const verified = sources.get(slot.video.assetId);
      const mimeType = slot.video.source.mimeType.split(';', 1)[0]?.trim().toLowerCase();
      if (
        !asset ||
        asset.type !== 'VIDEO' ||
        !verified ||
        asset.metadata.duration === null ||
        asset.metadata.duration < verified.duration ||
        !(['duration', 'width', 'height', 'size'] as const).every(
          (field) => verified[field] === slot.video!.source[field]
        ) ||
        !(['width', 'height', 'size'] as const).every(
          (field) => asset.metadata[field] === verified[field]
        ) ||
        verified.mimeType.split(';', 1)[0]?.trim().toLowerCase() !== mimeType ||
        asset.metadata.mimeType.split(';', 1)[0]?.trim().toLowerCase() !== mimeType
      )
        return null;
    }
  }
  return resources;
}

function presetSlot(
  settings: QuickEditPresentationSettings,
  side: 'intro' | 'outro',
  resources: ReadonlyMap<string, VideoProjectAsset>
): VideoProjectBookendPreset {
  const slot = settings[side];
  const control = side === 'intro' ? settings.introControl : settings.outroControl;
  const inherit = (fade: NonNullable<typeof control>['plain']) => ({
    ...structuredClone(fade),
    color: fade.color ?? settings.color,
    audioFade: fade.audioFade ?? settings.audioFade,
  });
  const variants = {
    ...(control
      ? {
          edgeControl: {
            mode: control.mode,
            plain: inherit(control.plain),
            media: inherit(control.media),
          },
        }
      : {}),
    ...(slot.image
      ? {
          image: {
            assetId: resources.get(slot.image.assetId)!.id,
            fit: slot.image.fit,
            fillColor: slot.image.fillColor,
            crop: structuredClone(slot.image.crop),
            duration: slot.image.duration,
          },
        }
      : {}),
    ...(slot.video
      ? {
          video: {
            assetId: resources.get(slot.video.assetId)!.id,
            fit: slot.video.fit,
            fillColor: slot.video.fillColor,
            crop: structuredClone(slot.video.crop),
            trim: structuredClone(slot.video.trim),
            audio: structuredClone(slot.video.audio),
          },
        }
      : {}),
  };
  if (slot.mode === 'image') return { ...variants, mode: 'image', image: variants.image! };
  if (slot.mode === 'video') return { ...variants, mode: 'video', video: variants.video! };
  return { ...variants, mode: 'none' };
}

function insertBookend(
  project: VideoProject,
  side: 'intro' | 'outro',
  preset: Exclude<VideoProjectBookendPreset, { mode: 'none' }>,
  placement: { start: number; duration: number; transition?: CompositionJoinSettings }
): VideoProject | null {
  const prefix = `${project.id}:bookend:${side}`;
  const asset = project.assets.find(
    ({ id }) => id === (preset.mode === 'image' ? preset.image.assetId : preset.video.assetId)
  )!;
  const track = {
    ...createVideoProjectTrack(
      asset.name,
      Math.min(0, ...project.tracks.map(({ order }) => order)) - 1,
      'PRIMARY'
    ),
    id: `${prefix}:track`,
  };
  const start = placement.start;
  const duration =
    preset.mode === 'image' ? placement.duration : preset.video.trim.end - preset.video.trim.start;
  const raw = createVideoClipFromAsset(track.id, asset, project.width, project.height, start, {
    groupId: prefix,
    muted: true,
  });
  const media =
    raw.type === 'VIDEO' && preset.mode === 'video'
      ? {
          ...raw,
          id: `${prefix}:media`,
          duration,
          sourceStart: preset.video.trim.start,
          sourceDuration: duration,
          sourceInstanceId: prefix,
        }
      : { ...raw, id: `${prefix}:media`, duration };
  const clips: VideoProjectClip[] = [media];
  const tracks = [track];
  if (preset.mode === 'video' && asset.metadata.hasAudio) {
    const audioTrack = {
      ...createVideoProjectTrack(
        asset.name,
        Math.max(0, ...project.tracks.map(({ order }) => order)) + 1,
        'AUDIO'
      ),
      id: `${prefix}:audio-track`,
    };
    tracks.push(audioTrack);
    clips.push({
      ...createAudioClipFromAsset(audioTrack.id, asset, start, { groupId: prefix }),
      id: `${prefix}:audio`,
      duration,
      sourceStart: preset.video.trim.start,
      sourceDuration: duration,
      sourceInstanceId: prefix,
    });
  }
  const styled = createBookendClipPresentation(
    { ...project, tracks: [...project.tracks, ...tracks] },
    clips,
    media.id,
    preset.mode === 'image' ? { ...preset, image: { ...preset.image, duration } } : preset
  );
  if (!styled) return null;
  const fillTrack = { ...styled.track, id: `${prefix}:fill-track` };
  const window =
    preset.mode === 'video' && Math.abs(placement.duration - duration) > 0.000001
      ? {
          offset: 0,
          extent: placement.duration,
          holdAt: duration,
          fadePhase: { offset: 0, duration },
          gainPhase: { offset: 0, duration },
        }
      : undefined;
  const composition =
    side === 'intro' ? prefixVideoProjectComposition(project, placement.duration) : project;
  if (!composition) return null;
  const authoredTransition =
    side === 'intro'
      ? project.bookendPresets?.introTransition
      : project.bookendPresets?.outroTransition;
  const adjustedSlot =
    window || (preset.mode === 'image' && Math.abs(duration - preset.image.duration) > 0.000001);
  const transition =
    adjustedSlot && authoredTransition && placement.transition
      ? {
          ...authoredTransition,
          before: placement.transition.before,
          after: placement.transition.after,
        }
      : authoredTransition;
  return {
    ...composition,
    version: window ? 43 : composition.version,
    duration: side === 'intro' ? project.duration + placement.duration : start + placement.duration,
    tracks: [...composition.tracks, ...tracks, fillTrack],
    clips: [
      ...composition.clips,
      ...styled.clips.map((clip) => ({
        ...clip,
        ...(window
          ? { duration: placement.duration, playbackWindow: structuredClone(window) }
          : {}),
        ...(clip.trackId === styled.track.id
          ? { id: `${prefix}:fill`, trackId: fillTrack.id }
          : {}),
      })),
    ],
    compositionJoins: [
      ...(composition.compositionJoins ?? []),
      {
        id: `${prefix}:join`,
        clipId: media.id,
        edge: side === 'intro' ? 'end' : 'start',
        ...(transition ? { transition: structuredClone(transition) } : {}),
      },
    ],
  };
}

function preservesJoinTiming(
  previous: VideoProject,
  project: VideoProject,
  sequence: PresentationSequencePlan
): boolean {
  try {
    const plans = resolveVideoProjectCompositionJoinPlans(project);
    const cuts = resolveVideoProjectCompositionJoinPlans(previous).filter(
      ({ boundary }) => boundary.sampling === 'cut'
    );
    if (
      cuts.some((cut) => {
        const current = plans.find(({ boundary }) => boundary.id === cut.boundary.id);
        return (
          !current ||
          Math.abs(current.before - cut.before) > 0.000001 ||
          Math.abs(current.after - cut.after) > 0.000001
        );
      })
    )
      return false;
    return (sequence.joins ?? []).every((join) => {
      if (join.beforeUs + join.afterUs === 0) return true;
      const current = plans.find(
        (plan) =>
          plan.boundary.id.startsWith(`${project.id}:bookend:`) &&
          Math.abs(plan.seam - join.seamUs / 1_000_000) <= 0.000001
      );
      return (
        current !== undefined &&
        Math.abs(current.before - join.beforeUs / 1_000_000) <= 0.000001 &&
        Math.abs(current.after - join.afterUs / 1_000_000) <= 0.000001
      );
    });
  } catch {
    return false;
  }
}

/** Physical slots use the same output lattice as the Gallery sequence. */
function sequencePlacements(sequence: PresentationSequencePlan) {
  const fps = sequence.rate.numerator / sequence.rate.denominator;
  const placements = new Map<
    string,
    { start: number; duration: number; transition?: CompositionJoinSettings }
  >();
  for (const segment of sequence.segments) {
    // Native samples exact ticks. Rounded microseconds can put the first sample before a clip.
    const start = segment.startTick / fps;
    const end =
      segment.endUs === sequence.totalDurationUs
        ? sequence.totalDurationUs / 1_000_000
        : segment.endTick / fps;
    const duration = end - start;
    if (duration <= 0) return null;
    const seam = segment.name === 'intro' ? segment.endUs : segment.startUs;
    const join =
      segment.name === 'main' ? undefined : sequence.joins?.find(({ seamUs }) => seamUs === seam);
    placements.set(segment.name, {
      start,
      duration,
      ...(join
        ? {
            transition: {
              type: join.type,
              color: join.color,
              before: join.beforeUs / 1_000_000,
              after: join.afterUs / 1_000_000,
            },
          }
        : {}),
    });
  }
  return placements;
}

function fitMainPlacement(
  project: VideoProject,
  duration: number,
  hold: number
): VideoProject | null {
  if (Math.abs(duration - project.duration) <= 0.000001) return project;
  const expanding = duration > project.duration;
  const boundary = expanding ? hold : duration;
  const clips: VideoProjectClip[] = [];
  for (const clip of project.clips) {
    const end = clip.startTime + clip.duration;
    if (
      (clip.type === 'EFFECT' && clip.sourceRange?.dormant) ||
      end <= boundary ||
      (clip.type === 'AUDIO' && end <= duration && end < project.duration - 0.000001)
    ) {
      clips.push(clip);
      continue;
    }
    const outsidePlacement =
      clip.type === 'AUDIO'
        ? clip.startTime >= duration
        : expanding
          ? clip.startTime > boundary
          : clip.startTime >= boundary;
    if (outsidePlacement) {
      if (clip.type === 'VIDEO' || clip.type === 'AUDIO') {
        clips.push({
          ...clip,
          duration: 0,
          playbackWindow: {
            offset: 0,
            extent: clip.duration,
            fadePhase: { offset: 0, duration: clip.duration },
            gainPhase: { offset: 0, duration: clip.duration },
          },
        });
        continue;
      }
      if (clip.type !== 'EFFECT' || !clip.sourceRange) return null;
      clips.push({ ...clip, sourceRange: { ...clip.sourceRange, dormant: true } });
      continue;
    }
    if (
      end < project.duration - 0.000001 &&
      clip.type !== 'VIDEO' &&
      clip.type !== 'AUDIO' &&
      clip.type !== 'EFFECT'
    )
      return null;
    if (clip.playbackWindow) return null;
    const placementDuration = duration - clip.startTime;
    clips.push({
      ...clip,
      duration: placementDuration,
      playbackWindow: {
        offset: 0,
        extent: Math.max(clip.duration, placementDuration),
        ...(expanding && clip.type !== 'AUDIO'
          ? { holdAt: Math.max(0, hold - clip.startTime) }
          : {}),
        fadePhase: { offset: 0, duration: clip.duration },
        gainPhase: { offset: 0, duration: clip.duration },
      },
    });
  }
  const fitted: VideoProject = { ...project, version: 43, duration, clips };
  fitted.cursorTrack = materializeVideoProjectCursorSourceObservations(fitted);
  return fitted;
}

/** Materializes supported bookends with existing clips, prefixes and scene-edge fields. */
export function planReviewProjectPresentation(args: {
  project: VideoProject;
  settings: QuickEditPresentationSettings | undefined;
  applied: boolean;
  resources: readonly ReviewProjectBookendResource[];
}): { status: 'prepared'; project: VideoProject } | { status: 'blocked'; field: string } {
  const { settings, applied } = args;
  if (!settings)
    return args.resources.length
      ? { status: 'blocked', field: 'presentation-assets' }
      : { status: 'prepared', project: args.project };
  const resources = admittedResources(settings, args.resources, args.project);
  if (!resources) return { status: 'blocked', field: 'presentation-assets' };
  const resolved = resolvePresentationSettings(settings);
  const sequence = planReviewPresentationSequence({
    settings,
    mainDuration: args.project.duration,
    fragmentOffset: 0,
    includeBookends: applied,
    rate: { numerator: args.project.fps, denominator: 1 },
  });
  if (!sequence.ok) return { status: 'blocked', field: 'presentation-timing' };
  const active = applied && (resolved.intro.mode !== 'none' || resolved.outro.mode !== 'none');
  const placements = sequencePlacements(sequence.plan);
  if (active && !placements) return { status: 'blocked', field: 'presentation-timing' };
  if (active && calculateProjectDuration(args.project) > args.project.duration + 0.000001)
    return { status: 'blocked', field: 'presentation-overlays' };
  const mainPlacement = placements?.get('main');
  const mainProject =
    active && mainPlacement
      ? fitMainPlacement(
          args.project,
          mainPlacement.duration,
          presentationMainHoldTime(sequence.plan)
        )
      : args.project;
  if (!mainProject) return { status: 'blocked', field: 'presentation-timing' };
  const independent = settings.introControl !== undefined || settings.outroControl !== undefined;
  const fade = (side: 'intro' | 'outro') => {
    const value = side === 'intro' ? resolved.fadeIn : resolved.fadeOut;
    return {
      ...structuredClone(value),
      enabled: value.enabled && applied,
      ...(independent && applied && value.enabled
        ? {
            duration:
              side === 'intro'
                ? sequence.plan.visualEnvelope.fadeIn
                : sequence.plan.visualEnvelope.fadeOut,
          }
        : {}),
      color: value.color ?? settings.color,
      audioFade: value.audioFade ?? settings.audioFade,
    };
  };
  const hasPresets =
    resources.size > 0 || independent || settings.introTransition || settings.outroTransition;
  const requiredVersion: VideoProject['version'] = independent ? 41 : hasPresets ? 26 : 24;
  let project: VideoProject = {
    ...mainProject,
    version: mainProject.version > requiredVersion ? mainProject.version : requiredVersion,
    assets: [
      ...args.project.assets,
      ...[...resources.values()].filter(
        (asset) => !args.project.assets.some(({ id }) => id === asset.id)
      ),
    ],
    sceneEdges: { intro: fade('intro'), outro: fade('outro') },
    ...(hasPresets
      ? {
          bookendPresets: {
            intro: presetSlot(settings, 'intro', resources),
            outro: presetSlot(settings, 'outro', resources),
            ...(settings.introTransition
              ? { introTransition: structuredClone(settings.introTransition) }
              : {}),
            ...(settings.outroTransition
              ? { outroTransition: structuredClone(settings.outroTransition) }
              : {}),
          },
        }
      : {}),
  };
  for (const side of ['intro', 'outro'] as const) {
    const preset = project.bookendPresets?.[side];
    if (!applied || resolved[side].mode === 'none' || !preset || preset.mode === 'none') continue;
    const placement = placements?.get(side);
    if (!placement) return { status: 'blocked', field: 'presentation-timing' };
    const inserted = insertBookend(project, side, preset, placement);
    if (!inserted) return { status: 'blocked', field: 'presentation-timing' };
    project = inserted;
  }
  if (active && !preservesJoinTiming(args.project, project, sequence.plan))
    return { status: 'blocked', field: 'presentation-joins' };
  return { status: 'prepared', project };
}
