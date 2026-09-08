import { resolveCameraCanvasTransform } from './camera-transform';
import { updateCameraPositionVisual } from '../../../../features/video/project/camera/animation';
import { useCallback, useMemo, useState } from 'react';

import type { VideoProject, VideoProjectTransform } from '../../../../features/video/project/types';
import type { PreviewTransformGestureHooks } from '../canvas/transform/gesture';

interface TransientAnchors {
  instanceId: string;
  anchors: Record<string, { x: number; y: number }>;
}

interface TransientTransform {
  clipId: string;
  transform: VideoProjectTransform;
}

export function usePreviewStageTransientTransform(
  project: VideoProject,
  playback: { currentTime: number; pause(): number }
) {
  const { currentTime, pause } = playback;
  const [transient, setTransient] = useState<TransientTransform | TransientAnchors | null>(null);
  const [cacheBypass, setCacheBypass] = useState(false);
  const [frozenTime, setFrozenTime] = useState<number | null>(null);
  const previewProject = useMemo(() => {
    if (!transient) return project;
    if ('instanceId' in transient)
      return {
        ...project,
        effectInstances: (project.effectInstances ?? []).map((instance) =>
          instance.id === transient.instanceId
            ? { ...instance, sceneAnchors: transient.anchors }
            : instance
        ),
      };
    return {
      ...project,
      clips: project.clips.map((clip) => {
        if (clip.id !== transient.clipId) return clip;
        const time = frozenTime ?? currentTime;
        const destination = resolveCameraCanvasTransform(
          project,
          clip.id,
          time,
          transient.transform
        );
        if (!destination) return clip;
        if (
          clip.type === 'VIDEO' &&
          project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
        ) {
          return updateCameraPositionVisual(clip, time, { transform: destination });
        }
        return { ...clip, transform: transient.transform };
      }),
    };
  }, [project, transient, frozenTime, currentTime]);
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
  const onPreviewEffectAnchors = useCallback(
    (instanceId: string, anchors: Record<string, { x: number; y: number }> | null) => {
      if (anchors) {
        setFrozenTime(pause());
        setCacheBypass(true);
        setTransient({ instanceId, anchors });
      } else {
        setTransient(null);
        setFrozenTime(null);
        setCacheBypass(false);
      }
    },
    [pause]
  );
  return {
    onPreviewEffectAnchors,
    cacheBypass,
    currentTime: frozenTime ?? currentTime,
    gestureHooks,
    previewProject,
  };
}
