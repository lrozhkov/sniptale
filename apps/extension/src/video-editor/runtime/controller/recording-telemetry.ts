import { useEffect, useRef } from 'react';
import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';
import type { RecordingTelemetryPort } from '../../contracts/controller-store';
import type { VideoProject } from '../../../features/video/project/types';
import { collectProjectRecordingIds } from '../../project/operations/source-timed-clips';

export function useRecordingTelemetry(
  project: VideoProject | null,
  setRecordingTelemetry: RecordingTelemetryPort['setRecordingTelemetry']
) {
  const sourceIds = collectProjectRecordingIds(project);
  const stableIds = useRef(sourceIds);
  if (
    sourceIds.length !== stableIds.current.length ||
    sourceIds.some((id, index) => id !== stableIds.current[index])
  )
    stableIds.current = sourceIds;
  const recordingIds = stableIds.current;
  const projectId = project?.id;
  useEffect(() => {
    let disposed = false;
    let loadRevision = 0;
    setRecordingTelemetry([]);
    if (recordingIds.length === 0) {
      return () => {
        disposed = true;
      };
    }

    const load = () => {
      const revision = loadRevision + 1;
      loadRevision = revision;
      void Promise.all(
        recordingIds.map(async (id) => {
          try {
            const entry = await getRecordingTelemetry(id);
            return entry?.recordingId === id ? [entry] : [];
          } catch {
            return [];
          }
        })
      ).then((entries) => {
        if (!disposed && revision === loadRevision) {
          setRecordingTelemetry(entries.flat());
        }
      });
    };

    load();
    const unsubscribe = subscribeToMediaHubEvents((event) => {
      if (
        event.type === 'library-changed' &&
        recordingIds.some((id) => event.assetIds.includes(`recording:${id}`))
      ) {
        load();
      }
    });
    return () => {
      disposed = true;
      loadRevision += 1;
      unsubscribe();
    };
  }, [setRecordingTelemetry, projectId, recordingIds]);
}
