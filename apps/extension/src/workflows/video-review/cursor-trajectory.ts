import { compileProjectCameraBundle } from '../../features/video/composition/motion/project-camera-preparation';
import {
  attachPreparedProjectCamera,
  preparedProjectCamera,
  withoutPreparedProjectCamera,
  projectCameraInputSignature,
  projectRequiresPreparedCamera,
  projectCameraOutputKey,
  type PreparedProjectCamera,
} from '../../features/video/composition/motion/prepared-project-camera';
import type { CameraOutputViewport } from '../../features/video/project/export/output-dimensions';
import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import { createRecordingCursorTrajectoryStore } from '../../composition/persistence/recordings/cursor-trajectory/store';
import { createRecordingCursorTrajectoryReader } from '../../composition/persistence/recordings/cursor-trajectory/reader';
import {
  prepareCameraCursorTrajectoryProject,
  prepareCursorTrajectoryProject,
} from '../../features/video/project/cursor-trajectory/project-window';
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
  let cameraRevision = 0;
  let cameraSource: string | undefined;
  let cameraLifetime = new AbortController();
  const cameraPlans = new Map<string, PreparedProjectCamera>();
  const cameraPending = new Map<string, Promise<PreparedProjectCamera>>();
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
    /** Compiles complete native camera support once; frame reads have an independent lifetime. */
    async prepareCamera(
      project: VideoProject,
      output?: CameraOutputViewport,
      signal?: AbortSignal
    ): Promise<VideoProject> {
      signal?.throwIfAborted();
      const source = projectCameraInputSignature(project);
      if (cameraSource !== source) {
        cameraRevision++;
        cameraLifetime.abort();
        cameraLifetime = new AbortController();
        cameraPlans.clear();
        cameraPending.clear();
        cameraSource = source;
      }
      if (!projectRequiresPreparedCamera(project))
        return preparedProjectCamera(project) ? withoutPreparedProjectCamera(project) : project;
      const key = projectCameraOutputKey(project, output);
      const attached = preparedProjectCamera(project);
      if (attached?.signature === source && attached.output === key) {
        cameraPlans.set(key, attached);
        return project;
      }
      const cached = cameraPlans.get(key);
      if (cached) return attachPreparedProjectCamera(project, cached);
      let pending = cameraPending.get(key);
      if (!pending) {
        const current = cameraRevision;
        const active = cameraLifetime.signal;
        const activeReader = reader;
        pending = (async () => {
          const scratch = await prepareCameraCursorTrajectoryProject(
            project,
            (identity, descriptor, timeUs) => activeReader.read(identity, descriptor, timeUs),
            active
          );
          active.throwIfAborted();
          const bundle = compileProjectCameraBundle(scratch, output);
          active.throwIfAborted();
          if (cameraRevision !== current)
            throw new DOMException('Camera preparation was cancelled', 'AbortError');
          cameraPlans.set(key, bundle);
          return bundle;
        })();
        cameraPending.set(key, pending);
        const owned = pending;
        void pending
          .finally(() => {
            if (cameraPending.get(key) === owned) cameraPending.delete(key);
          })
          .catch(() => {});
      }
      const bundle = await new Promise<PreparedProjectCamera>((resolve, reject) => {
        const aborted = () =>
          reject(
            signal?.reason ?? new DOMException('Camera preparation was cancelled', 'AbortError')
          );
        signal?.addEventListener('abort', aborted, { once: true });
        void pending
          .then(resolve, reject)
          .finally(() => signal?.removeEventListener('abort', aborted));
      });
      signal?.throwIfAborted();
      return attachPreparedProjectCamera(project, bundle);
    },
    clear() {
      cameraRevision++;
      cameraLifetime.abort();
      cameraLifetime = new AbortController();
      cameraSource = undefined;
      cameraPlans.clear();
      cameraPending.clear();
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
