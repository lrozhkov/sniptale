import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import { createRecordingCursorTrajectoryStore } from '../../composition/persistence/recordings/cursor-trajectory/store';
import { createRecordingCursorTrajectoryReader } from '../../composition/persistence/recordings/cursor-trajectory/reader';
import { prepareCursorTrajectoryProject } from '../../features/video/project/cursor-trajectory/project-window';
import type { RecordingCursorTrajectoryStoreDependencies } from '../../composition/persistence/recordings/cursor-trajectory/contracts';
import {
  motionRegionHasAvailableCursor,
  type CursorAvailabilityInterval,
} from '../../features/video/project/cursor-trajectory/availability';
import type { VideoProject } from '../../features/video/project/types';

/** A preview session or export job owns this bounded, disposable recording reader. */
export function createRecordingCursorTrajectoryRenderer(
  dependencies: RecordingCursorTrajectoryStoreDependencies = {
    database: () => initDB(),
    mintGeneration: () => crypto.randomUUID(),
  }
) {
  const store = createRecordingCursorTrajectoryStore(dependencies);
  let reader = createRecordingCursorTrajectoryReader(store);
  let completed: VideoProject | undefined;
  let revision = 0;
  return {
    async prepare(project: VideoProject, time: number): Promise<VideoProject> {
      const current = ++revision;
      const activeReader = reader;
      const prepared = await prepareCursorTrajectoryProject(
        project,
        time,
        (identity, descriptor, timeUs) => activeReader.read(identity, descriptor, timeUs),
        completed
      );
      if (current === revision) completed = prepared;
      return prepared;
    },
    clear() {
      revision++;
      reader.clear();
      // Pending reads can only fill the detached reader, never the next reader's cache.
      reader = createRecordingCursorTrajectoryReader(store);
      completed = undefined;
    },
  };
}

/** A mounted selection owns its archive scan and the bounded reader cache. */
export function createRecordingCursorAvailabilityReader(
  dependencies: RecordingCursorTrajectoryStoreDependencies = {
    database: () => initDB(),
    mintGeneration: () => crypto.randomUUID(),
  }
) {
  const store = createRecordingCursorTrajectoryStore(dependencies);
  let reader = createRecordingCursorTrajectoryReader(store);
  return {
    available(project: VideoProject, region: CursorAvailabilityInterval, signal?: AbortSignal) {
      const current = reader;
      return motionRegionHasAvailableCursor(
        project,
        region,
        (identity, descriptor, timeUs) => current.read(identity, descriptor, timeUs),
        signal
      );
    },
    clear() {
      reader.clear();
      reader = createRecordingCursorTrajectoryReader(store);
    },
  };
}
