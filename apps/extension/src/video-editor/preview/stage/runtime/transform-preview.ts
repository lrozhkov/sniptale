import { useMemo, useState } from 'react';

import type { VideoProject, VideoProjectTransform } from '../../../../features/video/project/types';
import type { PreviewTransformGestureHooks } from '../canvas/transform/gesture';

interface TransientTransform {
  clipId: string;
  transform: VideoProjectTransform;
}

export function usePreviewStageTransientTransform(
  project: VideoProject,
  playback: { currentTime: number; pause(): number }
) {
  const { currentTime, pause } = playback;
  const [transient, setTransient] = useState<TransientTransform | null>(null);
  const [cacheBypass, setCacheBypass] = useState(false);
  const [frozenTime, setFrozenTime] = useState<number | null>(null);
  const previewProject = useMemo(() => {
    if (!transient) return project;
    return {
      ...project,
      clips: project.clips.map((clip) =>
        clip.id === transient.clipId ? { ...clip, transform: transient.transform } : clip
      ),
    };
  }, [project, transient]);
  const gestureHooks = useMemo<PreviewTransformGestureHooks>(
    () => ({
      onActivate: () => {
        setFrozenTime(pause());
      },
      onCacheBypassChange: setCacheBypass,
      onPreviewTransform: (clipId, transform) =>
        setTransient(transform ? { clipId, transform } : null),
      onRestore: () => setTransient(null),
      onSettle: () => {
        setTransient(null);
        setFrozenTime(null);
      },
    }),
    [pause]
  );
  return {
    cacheBypass,
    currentTime: frozenTime ?? currentTime,
    gestureHooks,
    previewProject,
  };
}
