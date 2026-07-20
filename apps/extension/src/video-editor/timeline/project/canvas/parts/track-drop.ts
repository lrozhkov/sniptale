import {
  getFirstSupportedTimelineDropFile,
  hasTimelineDropFiles,
  type TimelineDropImportKind,
} from '../drop-targets';

export interface TimelineFileDropParams {
  clientX: number;
  file: File;
  importKind: TimelineDropImportKind;
  targetTimelineLaneId?: string | null;
  targetTrackId: string;
}

interface TrackFileDropHandlerParams {
  onDropTimelineFile: (drop: TimelineFileDropParams) => void;
  onSetDropTrackId: (trackId: string | null) => void;
  onUnsupportedTimelineFileDrop: () => void;
  resolveTimelineLaneId?: (event: React.DragEvent<HTMLDivElement>) => string | null;
  trackId: string;
}

function hasTimelineTrackDropData(dataTransfer: DataTransfer): boolean {
  return hasTimelineDropFiles(dataTransfer);
}

export function createTrackFileDragOverHandler(
  trackId: string,
  onSetDropTrackId: (trackId: string | null) => void
) {
  return (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasTimelineTrackDropData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    onSetDropTrackId(trackId);
  };
}

export function createTrackFileDragLeaveHandler(
  onSetDropTrackId: (trackId: string | null) => void
) {
  return (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    onSetDropTrackId(null);
  };
}

function handleTimelineFileDrop(
  params: TrackFileDropHandlerParams,
  event: React.DragEvent<HTMLDivElement>
): void {
  const dropFile = getFirstSupportedTimelineDropFile(event.dataTransfer);
  if (!dropFile) {
    params.onUnsupportedTimelineFileDrop();
    return;
  }

  params.onDropTimelineFile({
    clientX: event.clientX,
    file: dropFile.file,
    importKind: dropFile.kind,
    targetTimelineLaneId: params.resolveTimelineLaneId?.(event) ?? null,
    targetTrackId: params.trackId,
  });
}

export function createTrackFileDropHandler(params: TrackFileDropHandlerParams) {
  return (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasTimelineTrackDropData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    params.onSetDropTrackId(null);
    handleTimelineFileDrop(params, event);
  };
}
