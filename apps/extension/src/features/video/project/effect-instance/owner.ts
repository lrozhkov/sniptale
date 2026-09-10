import type { VideoProject, VideoProjectTrack } from '../types';
import type { VideoProjectEffectTarget } from './types';

export function isVideoEffectTrack(track: VideoProjectTrack): boolean {
  return track.kind === 'PRIMARY' && track.role !== 'CAMERA';
}

/** Project-time authority for FX. Clip movement never shifts track/group intervals. */
export function resolveEffectOwner(
  project: VideoProject,
  target: VideoProjectEffectTarget
): {
  startTime: number;
  duration: number;
  locked: boolean;
  visible: boolean;
  bypassed: boolean;
} | null {
  if (target.kind === 'clip') {
    const clip = project.clips.find((clip) => clip.id === target.clipId);
    const track = project.tracks.find((track) => track.id === clip?.trackId);
    if (!clip || clip.type === 'AUDIO' || !track) return null;
    return {
      startTime: clip.startTime,
      duration: clip.duration,
      locked: track.locked,
      visible: track.visible,
      bypassed: clip.effectsBypassed === true,
    };
  }
  if (target.kind !== 'track' && target.kind !== 'video-group') return null;
  const tracks = project.tracks.filter(
    (track) =>
      isVideoEffectTrack(track) && (target.kind === 'video-group' || track.id === target.trackId)
  );
  if (target.kind === 'track' && tracks.length !== 1) return null;
  const ids = new Set(tracks.map((track) => track.id));
  const end = Math.max(
    0,
    ...project.clips
      .filter((clip) => ids.has(clip.trackId))
      .map((clip) => clip.startTime + clip.duration)
  );
  return {
    startTime: 0,
    duration: end,
    locked: tracks.some((track) => track.locked),
    visible: tracks.some((track) => track.visible),
    bypassed:
      target.kind === 'video-group'
        ? project.videoEffectsBypassed === true
        : tracks[0]!.effectsBypassed === true,
  };
}
