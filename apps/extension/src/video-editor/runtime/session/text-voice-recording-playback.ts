import { useContext, useEffect, useRef, useState } from 'react';
import type { VideoProject } from '../../../features/video/project/types';
import {
  RuntimePlaybackContext,
  WorkspacePlaybackRangeContext,
  WorkspacePreviewContext,
} from '../controller/composition/contexts';
import { getCurrentVideoEditorCurrentTime, useVideoEditorPlaybackPort } from '../controller/store';

/** Temporarily owns silent, non-looping Montage playback during microphone capture. */
export function useTextVoiceRecordingPlayback(enabled: boolean, visible: boolean) {
  const runtime = useContext(RuntimePlaybackContext);
  const ranges = useContext(WorkspacePlaybackRangeContext);
  const viewer = useContext(WorkspacePreviewContext);
  const setCurrentTime = useVideoEditorPlaybackPort((port) => port.setCurrentTime);
  const [playVideo, setPlayVideo] = useState(true);
  const current = useRef({ enabled, visible, runtime, ranges, viewer, playVideo });
  current.current = { enabled, visible, runtime, ranges, viewer, playVideo };
  const generation = useRef(0);
  const owned = useRef<{
    range: { start: number; end: number; loop: false };
    previous: NonNullable<typeof ranges>['playbackRange'];
  } | null>(null);
  const pause = () => {
    generation.current += 1;
    if (owned.current) current.current.runtime?.pausePlayback();
  };
  const stop = () => {
    pause();
    const lease = owned.current;
    owned.current = null;
    const context = current.current.ranges;
    if (lease && context?.playbackRange === lease.range) context.setPlaybackRange(lease.previous);
  };
  const startPlayback = async (attempt: number) => {
    const admitted = () => {
      const value = current.current;
      if (!value.enabled || !value.visible || attempt !== generation.current)
        throw new Error('Recording cancelled');
      return value;
    };
    const value = admitted();
    if (value.ranges && value.ranges.playbackRange !== owned.current?.range)
      throw new Error('Recording range changed');
    if (!value.playVideo || getCurrentVideoEditorCurrentTime() >= (owned.current?.range.end ?? 0))
      return;
    if (!value.runtime) throw new Error('Playback unavailable');
    const started = await value.runtime.setPlaybackPlaying(true);
    admitted();
    if (started === false) throw new Error('Playback unavailable');
  };
  const latestStop = useRef(stop);
  latestStop.current = stop;
  useEffect(() => {
    if (!enabled) latestStop.current();
  }, [enabled]);
  useEffect(() => {
    if (!visible) {
      generation.current += 1;
      if (owned.current) current.current.runtime?.pausePlayback();
    }
  }, [visible]);
  useEffect(() => {
    if (owned.current && ranges?.playbackRange !== owned.current.range) {
      generation.current += 1;
      current.current.runtime?.pausePlayback();
    }
  }, [ranges?.playbackRange]);
  useEffect(() => () => latestStop.current(), []);
  return {
    playVideo,
    setPlayVideo,
    pause,
    stop,
    async start(project: VideoProject, position: number) {
      const previous = owned.current
        ? owned.current.previous
        : (current.current.ranges?.playbackRange ?? null);
      stop();
      const value = current.current;
      const start = Math.max(0, Math.min(position, project.duration));
      const range = { start, end: project.duration, loop: false as const };
      owned.current = { range, previous };
      value.runtime?.pausePlayback();
      value.viewer?.setSourceViewerActive(false);
      value.ranges?.setPlaybackRange(range);
      setCurrentTime(start);
      const attempt = generation.current;
      // Commit the mute projection and range before preview preparation can play media.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await startPlayback(attempt);
    },
    async resume() {
      const attempt = generation.current;
      try {
        await startPlayback(attempt);
      } catch (error) {
        if (attempt === generation.current) pause();
        throw error;
      }
    },
  };
}
