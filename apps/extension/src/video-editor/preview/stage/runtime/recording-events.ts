import { useEffect, useMemo, useState } from 'react';
import { createRecordingEventsRenderer } from '../../../../workflows/video-review/recording-events';
import { recordingEventsProjectCoversTime } from '../../../../features/video/project/recording-events/project-facts';
import type { VideoProject } from '../../../../features/video/project/types';
import type { PreviewEffectRuntimeFeedback } from '../types';

type Request = { project: VideoProject; start: number; retryVersion: number };

/** The mounted preview owns one active read and one replaceable seek request. */
export function useRecordingEventsProject(
  project: VideoProject,
  time: number,
  feedback: Pick<PreviewEffectRuntimeFeedback, 'onFailure' | 'onRecovery' | 'retryVersion'>,
  createRenderer = createRecordingEventsRenderer
): VideoProject {
  const { onFailure, onRecovery, retryVersion } = feedback;
  const start = Math.floor(Math.max(0, time));
  const owner = useMemo(
    () => ({
      renderer: createRenderer(),
      active: false,
      epoch: 0,
      running: false,
      pending: null as Request | null,
      latest: { project: null as VideoProject | null, time: 0, retryVersion: 0 },
    }),
    [createRenderer]
  );
  const [completed, setCompleted] = useState<{
    source: VideoProject;
    project: VideoProject;
    retryVersion: number;
  } | null>(null);
  owner.latest = { project, time, retryVersion };
  useEffect(() => {
    owner.active = true;
    owner.epoch++;
    return () => {
      owner.active = false;
      owner.epoch++;
      owner.pending = null;
      owner.renderer.clear();
    };
  }, [owner]);
  useEffect(() => {
    if (!project.actionFeedback?.some((group) => group.events && group.events.totalBlocks > 0))
      return;
    owner.pending = { project, start, retryVersion };
    const run = () => {
      if (!owner.active || owner.running || !owner.pending) return;
      const request = owner.pending;
      const epoch = owner.epoch;
      owner.pending = null;
      owner.running = true;
      const current = () =>
        owner.active &&
        owner.epoch === epoch &&
        owner.latest.project === request.project &&
        owner.latest.retryVersion === request.retryVersion;
      void (async () => {
        try {
          const prepared = await owner.renderer.prepare(request.project, {
            start: request.start,
            end: request.start + 2,
          });
          if (current() && recordingEventsProjectCoversTime(prepared, owner.latest.time)) {
            setCompleted({
              source: request.project,
              project: prepared,
              retryVersion: request.retryVersion,
            });
            onRecovery('recording-history');
          }
        } catch (error) {
          if (current()) {
            setCompleted(null);
            onFailure('recording-history', error);
          }
        } finally {
          owner.running = false;
          if (owner.active && owner.pending) run();
        }
      })();
    };
    run();
  }, [owner, project, start, retryVersion, onFailure, onRecovery]);
  return completed?.source === project &&
    completed.retryVersion === retryVersion &&
    recordingEventsProjectCoversTime(completed.project, time)
    ? completed.project
    : project;
}
