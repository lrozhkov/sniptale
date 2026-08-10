import { useEffect } from 'react';
import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';
import type { VideoEditorControllerStorePort } from '../../contracts/controller-store';

export function useRecordingTelemetry(
  sourceRecordingId: string | null,
  setRecordingTelemetry: VideoEditorControllerStorePort['setRecordingTelemetry']
) {
  useEffect(() => {
    let disposed = false;
    let loadRevision = 0;
    setRecordingTelemetry(null);
    if (!sourceRecordingId) {
      return () => {
        disposed = true;
      };
    }

    const load = () => {
      const revision = loadRevision + 1;
      loadRevision = revision;
      void getRecordingTelemetry(sourceRecordingId)
        .then((recordingTelemetry) => {
          if (!disposed && revision === loadRevision) {
            setRecordingTelemetry(
              recordingTelemetry?.recordingId === sourceRecordingId ? recordingTelemetry : null
            );
          }
        })
        .catch(() => {
          if (!disposed && revision === loadRevision) {
            setRecordingTelemetry(null);
          }
        });
    };

    load();
    const unsubscribe = subscribeToMediaHubEvents((event) => {
      if (
        event.type === 'library-changed' &&
        event.assetIds.includes(`recording:${sourceRecordingId}`)
      ) {
        load();
      }
    });
    return () => {
      disposed = true;
      loadRevision += 1;
      unsubscribe();
    };
  }, [setRecordingTelemetry, sourceRecordingId]);
}
