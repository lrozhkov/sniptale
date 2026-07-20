import {
  getMediaClipSourceTime,
  isClipActiveAtTime,
  isVideoClip,
} from '../../../features/video/project/timeline';
import type { VideoProject, VideoProjectVideoClip } from '../../../features/video/project/types';
import { seekMediaElement } from './seek';

export async function syncVideoClipFrame(
  job: Pick<{ clipMediaElements: Map<string, HTMLMediaElement> }, 'clipMediaElements'>,
  project: VideoProject,
  currentTime: number,
  signal?: AbortSignal
): Promise<void> {
  const activeVideoClips: VideoProjectVideoClip[] = [];
  for (const clip of project.clips) {
    if (isVideoClip(clip) && isClipActiveAtTime(clip, currentTime)) {
      activeVideoClips.push(clip);
    }
  }
  await Promise.all(
    activeVideoClips.map(async (clip) => {
      const element = job.clipMediaElements.get(clip.id);
      if (!(element instanceof HTMLVideoElement)) {
        return;
      }

      const desiredTime = getMediaClipSourceTime(clip, currentTime);
      await seekMediaElement(element, desiredTime, signal);
    })
  );
}
