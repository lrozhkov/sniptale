import { formatDateTime, formatNumber, translate } from '../../platform/i18n';
import { VideoProjectClipType } from '../../features/video/project/types';
import type { VideoProjectClip } from '../../features/video/project/types';

export function formatDate(timestamp: number): string {
  return formatDateTime(timestamp, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

export function formatDuration(duration: number): string {
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

export function formatSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${formatNumber(size / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
  }

  return `${formatNumber(Math.max(1, Math.round(size / 1024)))} KB`;
}

export function getClipTypeLabel(clip: VideoProjectClip | null): string {
  if (!clip) {
    return translate('videoEditor.sidebar.nothingSelected');
  }

  switch (clip.type) {
    case VideoProjectClipType.VIDEO:
      return translate('videoEditor.sidebar.clipTypeVideo');
    case VideoProjectClipType.AUDIO:
      return translate('videoEditor.sidebar.clipTypeAudio');
    case VideoProjectClipType.IMAGE:
      return translate('videoEditor.sidebar.clipTypeImage');
    case VideoProjectClipType.TEXT:
      return translate('videoEditor.sidebar.clipTypeText');
    case VideoProjectClipType.ANNOTATION:
    case VideoProjectClipType.EFFECT:
      return translate('videoEditor.sidebar.clipTypeAnnotation');
    case VideoProjectClipType.SUBTITLE:
      return translate('videoEditor.sidebar.clipTypeSubtitle');
    case VideoProjectClipType.SHAPE:
      return translate('videoEditor.sidebar.clipTypeShape');
  }
}
