import { formatDateTime, formatNumber, translate } from '../../platform/i18n';
import { VideoProjectClipType, VideoProjectActionPreset } from '../../features/video/project/types';
import type { VideoProjectClip, VideoProjectActionEvent } from '../../features/video/project/types';

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

/** Describes the captured target independently of its selected animation preset. */
export function getActionEventLabel(
  event: Pick<VideoProjectActionEvent, 'kind' | 'data' | 'label'>
): string {
  const kind = translate(
    (
      {
        CLICK: 'videoEditor.timeline.historyClick',
        KEY: 'videoEditor.timeline.historyKeys',
        SCROLL: 'videoEditor.timeline.historyScroll',
        PAUSE: 'videoEditor.timeline.historyPause',
        CALLOUT: 'videoEditor.timeline.historyCallout',
      } as const
    )[event.kind]
  );
  const presetLabels = new Set<string>([
    ...Object.values(VideoProjectActionPreset),
    translate('videoEditor.sidebar.actionPresetClickRipple', 'en'),
    translate('videoEditor.sidebar.actionPresetClickRipple', 'ru'),
  ]);
  const label = event.label.trim();
  const name =
    typeof event.data['targetName'] === 'string'
      ? event.data['targetName'].trim().slice(0, 120)
      : event.kind !== 'KEY' && !presetLabels.has(label)
        ? label.slice(0, 120)
        : '';
  const tag =
    typeof event.data['targetTag'] === 'string' ? event.data['targetTag'].slice(0, 32) : '';
  const role =
    typeof event.data['targetRole'] === 'string' ? event.data['targetRole'].slice(0, 32) : '';
  const target = [name, tag ? `<${tag}${role ? ` role="${role}"` : ''}>` : role]
    .filter(Boolean)
    .join(' · ');
  const shortcut =
    event.kind === 'KEY'
      ? event.label || (typeof event.data['code'] === 'string' ? event.data['code'] : '')
      : '';
  return [kind, shortcut, target].filter(Boolean).join(' · ');
}
