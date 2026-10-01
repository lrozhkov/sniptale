import { useEffect, useState } from 'react';
import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type { TranslationKey } from '../../../platform/i18n';
import { isGalleryMediaItem, type GalleryItem } from '../items';

interface RecordingSourceSummary {
  method: TranslationKey | null;
  actionCount: number;
  hasPointer: boolean;
}

function summarize(entry: RecordingTelemetryEntry): RecordingSourceSummary {
  let method: TranslationKey | null = null;
  if (entry.captureMode === 'CAMERA') method = 'gallery.preview.captureCamera';
  else if (entry.captureMode === 'TAB_CROP') method = 'gallery.preview.captureTabCrop';
  else if (entry.captureMode === 'TAB' || entry.displaySurface === 'browser')
    method = 'gallery.preview.captureTab';
  else if (entry.displaySurface === 'window') method = 'gallery.preview.captureWindow';
  else if (entry.displaySurface === 'monitor') method = 'gallery.preview.captureScreen';
  else if (entry.captureMode === 'SCREEN') method = 'gallery.preview.captureDisplay';
  return {
    method,
    actionCount: entry.actionEvents.length,
    hasPointer: Boolean(entry.cursorTrack?.samples.length),
  };
}

/** Projects validated recording metadata without exposing retained event contents to the view. */
export function usePreviewSourceMetadata(item: GalleryItem) {
  const recordingId =
    isGalleryMediaItem(item) && item.source.kind === 'recording' ? item.source.recordingId : null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    id: string | null;
    status: 'loading' | 'ready' | 'missing' | 'unavailable';
    summary: RecordingSourceSummary | null;
  }>({ id: null, status: 'loading', summary: null });
  useEffect(() => {
    if (!recordingId) return;
    let active = true;
    setResult({ id: recordingId, status: 'loading', summary: null });
    void getRecordingTelemetry(recordingId).then(
      (entry) => {
        if (active)
          setResult({
            id: recordingId,
            status: entry ? 'ready' : 'missing',
            summary: entry ? summarize(entry) : null,
          });
      },
      () => {
        if (active) setResult({ id: recordingId, status: 'unavailable', summary: null });
      }
    );
    return () => {
      active = false;
    };
  }, [recordingId, attempt]);
  return {
    status: !recordingId ? 'none' : result.id === recordingId ? result.status : 'loading',
    summary: recordingId && result.id === recordingId ? result.summary : null,
    retry: () => setAttempt((value) => value + 1),
  };
}

/** Only retained acquisition evidence establishes provenance; missing URLs do not imply import. */
export function getPreviewOrigin(item: GalleryItem): TranslationKey {
  if (!isGalleryMediaItem(item)) {
    if (item.kind === 'scenario-export') return 'gallery.preview.exportedMedia';
    return 'gallery.preview.projectMedia';
  }
  switch (item.source.kind) {
    case 'recording':
      return item.kind === 'video' ? 'gallery.preview.savedMedia' : 'gallery.preview.recordedMedia';
    case 'screenshot':
      return item.kind === 'screenshot'
        ? 'gallery.preview.capturedImage'
        : 'gallery.preview.savedMedia';
    case 'project-export':
      return 'gallery.preview.exportedMedia';
    case 'project-asset':
      return 'gallery.preview.projectMedia';
    case 'web-snapshot':
      return 'gallery.preview.kindWebSnapshot';
    case 'stored-asset':
      return 'gallery.preview.savedMedia';
  }
}
