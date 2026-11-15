import {
  parseAudioProcessing,
  type AudioProcessing,
} from '@sniptale/runtime-contracts/audio-effects';
import { applyVideoProjectMutationPatch } from './mutation';
import { areProjectClipsEditable, getLinkedClipIds } from './timeline';
import type { VideoProject, VideoProjectAudioClip, VideoProjectVideoClip } from './types';

type Placement = VideoProjectAudioClip | VideoProjectVideoClip;
export type ProjectAudioProcessingTarget =
  | { kind: 'clip'; clipId: string }
  | { kind: 'source'; assetId: string; sourceInstanceId: string };

function soundTargets(project: VideoProject, clip: Placement): Placement[] {
  const asset = project.assets.find((asset) => asset.id === clip.assetId);
  if (!asset?.metadata.hasAudio) return [];
  if (clip.type === 'AUDIO') return [clip];
  const linked = new Set(getLinkedClipIds(project, clip.id));
  const companions = project.clips.filter(
    (item): item is VideoProjectAudioClip =>
      item.type === 'AUDIO' &&
      linked.has(item.id) &&
      item.startTime < clip.startTime + clip.duration &&
      item.startTime + item.duration > clip.startTime
  );
  return companions.length ? companions : [clip];
}
function resolveTargets(project: VideoProject, target: ProjectAudioProcessingTarget): Placement[] {
  const selected = project.clips.filter(
    (clip): clip is Placement =>
      (clip.type === 'AUDIO' || clip.type === 'VIDEO') &&
      (target.kind === 'clip'
        ? clip.id === target.clipId
        : clip.assetId === target.assetId &&
          (clip.sourceInstanceId ?? clip.id) === target.sourceInstanceId)
  );
  return [
    ...new Map(
      selected.flatMap((clip) => soundTargets(project, clip)).map((clip) => [clip.id, clip])
    ).values(),
  ];
}
function settings(value: AudioProcessing | undefined) {
  return value
    ? JSON.stringify({ ...value, effects: value.effects.map(({ id: _id, ...effect }) => effect) })
    : '';
}
/** Resolves only audible placement owners; source-level editing does not introduce inheritance. */
export function getProjectAudioProcessingSelection(
  project: VideoProject,
  target: ProjectAudioProcessingTarget
) {
  const clips = resolveTargets(project, target);
  const first = clips[0]?.audioProcessing;
  return {
    clipIds: clips.map((clip) => clip.id),
    value: first,
    mixed: clips.some((clip) => settings(clip.audioProcessing) !== settings(first)),
    editable:
      clips.length > 0 &&
      areProjectClipsEditable(
        project,
        clips.map((clip) => clip.id)
      ),
  };
}

/** Accepts one atomic project command. The caller supplies instance identities for copied chains. */
export function updateProjectAudioProcessing(
  project: VideoProject,
  target: ProjectAudioProcessingTarget,
  value: unknown,
  createId: () => string
): { ok: true; project: VideoProject } | { ok: false; reason: 'missing' | 'locked' | 'invalid' } {
  const processing = value === undefined ? undefined : parseAudioProcessing(value);
  if (processing === null) return { ok: false, reason: 'invalid' };
  const selected = resolveTargets(project, target);
  if (!selected.length) return { ok: false, reason: 'missing' };
  if (
    !areProjectClipsEditable(
      project,
      selected.map((clip) => clip.id)
    )
  )
    return { ok: false, reason: 'locked' };
  if (selected.every((clip) => settings(clip.audioProcessing) === settings(processing)))
    return { ok: true, project };
  const replacements = new Map<string, Placement>();
  for (const [index, clip] of selected.entries()) {
    const { audioProcessing: _previous, ...rest } = clip;
    if (!processing) {
      replacements.set(clip.id, rest);
      continue;
    }
    const owned = structuredClone(processing);
    // The visible first chain keeps focus/instance identity; other placements own independent IDs.
    if (index > 0) for (const effect of owned.effects) effect.id = createId();
    const accepted = parseAudioProcessing(owned);
    if (!accepted) return { ok: false, reason: 'invalid' };
    replacements.set(clip.id, { ...clip, audioProcessing: accepted });
  }
  return {
    ok: true,
    project: applyVideoProjectMutationPatch(project, {
      clips: project.clips.map((clip) => replacements.get(clip.id) ?? clip),
    }),
  };
}
