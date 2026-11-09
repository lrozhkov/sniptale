import { useEffect, useMemo, useRef, useState } from 'react';
import { sameCursorAvailabilitySource } from '../../features/video/project/cursor-trajectory/availability';
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
export function useMotionRegionCursorAvailability(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  createReader = createRecordingCursorAvailabilityReader
) {
  const retained = useRef({ project, region });
  const previous = retained.current;
  if (
    !sameCursorAvailabilitySource(previous.project, project) ||
    previous.region.id !== region.id ||
    previous.region.startTime !== region.startTime ||
    previous.region.duration !== region.duration ||
    previous.region.sourceBinding?.clipId !== region.sourceBinding?.clipId
  )
    retained.current = { project, region };
  const query = retained.current;
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
  owner.latest = query;
  const [completed, setCompleted] = useState<{
    project: VideoProject;
    region: VideoProjectMotionRegion;
    available: boolean;
  } | null>(null);
  useRecordingHistoryReadLifetime(owner);
  useEffect(() => {
    const request = { ...query, controller: new AbortController() };
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
  }, [owner, query]);
  const ready = completed?.project === query.project && completed.region === query.region;
  return { available: ready && completed.available, pending: !ready };
}
