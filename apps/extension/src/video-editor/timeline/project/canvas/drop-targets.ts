import { getSortedTracks } from '../../../../features/video/project/timeline';
import { VideoProjectAssetType, VideoTrackKind } from '../../../../features/video/project/types';
import type { VideoProject } from '../../../../features/video/project/types';

export type TimelineDropImportKind = 'audio' | 'image' | 'video';

const TRACK_KIND_BY_IMPORT_KIND = {
  audio: VideoTrackKind.AUDIO,
  image: VideoTrackKind.OVERLAY,
  video: VideoTrackKind.PRIMARY,
} as const satisfies Record<TimelineDropImportKind, VideoTrackKind>;

function getTimelineDropImportKind(file: File): TimelineDropImportKind | null {
  if (file.type.startsWith(`${VideoProjectAssetType.AUDIO.toLowerCase()}/`)) {
    return 'audio';
  }
  if (file.type.startsWith(`${VideoProjectAssetType.IMAGE.toLowerCase()}/`)) {
    return 'image';
  }
  if (file.type.startsWith(`${VideoProjectAssetType.VIDEO.toLowerCase()}/`)) {
    return 'video';
  }

  return null;
}

export function getFirstSupportedTimelineDropFile(dataTransfer: DataTransfer): {
  file: File;
  kind: TimelineDropImportKind;
} | null {
  for (const file of Array.from(dataTransfer.files)) {
    const kind = getTimelineDropImportKind(file);
    if (kind) {
      return { file, kind };
    }
  }

  return null;
}

export function hasTimelineDropFiles(dataTransfer: DataTransfer): boolean {
  return (
    dataTransfer.files.length > 0 ||
    Array.from(dataTransfer.items).some((item) => item.kind === 'file') ||
    Array.from(dataTransfer.types).includes('Files')
  );
}

export function resolveTimelineDropTrackId(
  project: VideoProject,
  targetTrackId: string,
  importKind: TimelineDropImportKind
): string | null {
  const targetTrack = project.tracks.find((track) => track.id === targetTrackId);
  const expectedKind = TRACK_KIND_BY_IMPORT_KIND[importKind];
  if (targetTrack?.kind === expectedKind) {
    return targetTrack.id;
  }

  return getSortedTracks(project).find((track) => track.kind === expectedKind)?.id ?? null;
}
