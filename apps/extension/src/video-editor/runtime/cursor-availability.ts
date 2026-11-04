import { useEffect, useMemo, useState } from 'react';
import type { VideoProject, VideoProjectMotionRegion } from '../../features/video/project/types';
import { createRecordingCursorAvailabilityReader } from '../../workflows/video-review/cursor-trajectory';
import {
  runRecordingHistoryReads,
  useRecordingHistoryReadLifetime,
} from './recording-history-reader';

type Request = {
  project: VideoProject;
  region: VideoProjectMotionRegion;
  controller: AbortController;
};

/** Keeps interval admission local to the mounted selection; authoring remains with existing commands. */
export function useMotionRegionCursorAvailable(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  createReader = createRecordingCursorAvailabilityReader
): boolean {
  const owner = useMemo(
    () => ({
      renderer: createReader(),
      active: false,
      epoch: 0,
      running: false,
      pending: null as Request | null,
      latest: {
        project: null as VideoProject | null,
        region: null as VideoProjectMotionRegion | null,
      },
    }),
    [createReader]
  );
  owner.latest = { project, region };
  const [completed, setCompleted] = useState<{
    project: VideoProject;
    region: VideoProjectMotionRegion;
    available: boolean;
  } | null>(null);
  useRecordingHistoryReadLifetime(owner);
  useEffect(() => {
    const request = { project, region, controller: new AbortController() };
    owner.pending = request;
    runRecordingHistoryReads(owner, async (next, epoch) => {
      let available = false;
      try {
        available = await owner.renderer.available(
          next.project,
          next.region,
          next.controller.signal
        );
      } catch {
        /* Read refusal leaves authored camera settings unchanged. */
      }
      if (
        !next.controller.signal.aborted &&
        owner.active &&
        owner.epoch === epoch &&
        owner.latest.project === next.project &&
        owner.latest.region === next.region
      )
        setCompleted({ project: next.project, region: next.region, available });
    });
    return () => request.controller.abort();
  }, [owner, project, region]);
  return completed?.project === project && completed.region === region
    ? completed.available
    : false;
}
