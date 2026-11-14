import type { VideoProject } from '../types';
import type { VideoProjectEffectInstance } from './types';

export function isEffectInstanceEditable(
  project: VideoProject,
  instance: VideoProjectEffectInstance
): boolean {
  if (instance.kind !== 'standalone' || instance.target.kind !== 'scene') return false;
  const hosts = project.clips.filter(
    (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
  );
  return (
    hosts.length === 1 &&
    hosts.every((clip) => {
      const track = project.tracks.find((track) => track.id === clip.trackId);
      return track !== undefined && !track.locked;
    })
  );
}
