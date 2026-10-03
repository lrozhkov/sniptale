import {
  Archive,
  AudioLines,
  BookOpen,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  Library,
  Video,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { translate } from '../../../platform/i18n';
import type { FolderFilter } from '../types';
import type { RecordingGroupMemberRole } from '../../../features/media-hub/recording-groups';
import { ensureGalleryItemThumbnail, type GalleryItem, type GalleryItemKind } from '../items';
import { createMediaThumbFallbackItem } from './fallback-items';
import { formatDurationLabel } from '../../../composition/audio-recording/format';

const GALLERY_THUMB_FALLBACK_CLASS_NAME =
  'flex h-full w-full items-center justify-center text-[var(--sniptale-color-text-secondary)]';

const GALLERY_THUMB_FALLBACK_SURFACE_CLASS_NAME = [
  'bg-[radial-gradient(circle_at_top,',
  'color-mix(in_srgb,var(--sniptale-color-accent-soft)_90%,transparent),',
  'color-mix(in_srgb,var(--sniptale-color-surface-panel)_60%,var(--sniptale-color-surface-canvas)_40%)_38%,',
  'var(--sniptale-color-surface-canvas))]',
].join('');

export const FOLDER_LABELS: Record<FolderFilter, string> = {
  all: translate('gallery.preview.folderAll'),
  audio: translate('gallery.preview.kindAudio'),
  screenshot: translate('gallery.preview.folderScreenshot'),
  recording: translate('gallery.preview.folderRecording'),
  export: translate('gallery.preview.folderExport'),
  'web-snapshot': translate('gallery.preview.folderWebSnapshot'),
  scenario: translate('gallery.preview.folderScenario'),
  'video-project': translate('gallery.preview.folderVideoProject'),
};

export function getGalleryFolderIcon(folder: FolderFilter) {
  if (folder === 'all') {
    return Library;
  }

  if (folder === 'scenario') {
    return BookOpen;
  }

  if (folder === 'export') {
    return FileText;
  }

  if (folder === 'web-snapshot') {
    return Archive;
  }

  return getKindIcon(folder);
}

export function getGalleryItemKindLabel(kind: GalleryItemKind): string {
  switch (kind) {
    case 'screenshot':
      return translate('gallery.preview.folderScreenshot');
    case 'recording':
      return translate('gallery.preview.folderRecording');
    case 'export':
      return translate('gallery.preview.kindVideo');
    case 'audio':
      return translate('gallery.preview.kindAudio');
    case 'image':
      return translate('gallery.preview.kindImage');
    case 'video':
      return translate('gallery.preview.kindVideo');
    case 'video-project':
      return translate('gallery.preview.kindVideoProject');
    case 'scenario':
      return translate('gallery.preview.folderScenario');
    case 'scenario-export':
      return translate('gallery.preview.kindScenarioExport');
    case 'web-archive':
      return translate('gallery.preview.kindWebSnapshot');
  }
}

export function getRecordingGroupRoleLabel(role: RecordingGroupMemberRole): string {
  switch (role) {
    case 'display':
      return translate('gallery.preview.recordingRoleDisplay');
    case 'webcam':
      return translate('gallery.preview.recordingRoleWebcam');
    case 'microphone':
      return translate('gallery.preview.recordingRoleMicrophone');
  }
}

export { formatDate } from './date';

export function getKindIcon(kind: GalleryItemKind) {
  switch (kind) {
    case 'recording':
    case 'export':
    case 'video':
      return Video;
    case 'video-project':
      return Clapperboard;
    case 'audio':
      return AudioLines;
    case 'scenario':
      return BookOpen;
    case 'scenario-export':
      return FileText;
    case 'web-archive':
      return Archive;
    default:
      return ImageIcon;
  }
}

export function isImageKind(kind: GalleryItemKind): boolean {
  return kind === 'screenshot' || kind === 'image';
}

export function isVideoKind(kind: GalleryItemKind): boolean {
  return kind === 'recording' || kind === 'export' || kind === 'video' || kind === 'video-project';
}

function loadThumbUrl(item: GalleryItem, setThumbUrl: (value: string | null) => void) {
  let disposed = false;
  let objectUrl: string | null = null;
  const controller = new AbortController();

  ensureGalleryItemThumbnail(item, controller.signal)
    .then((thumb) => {
      if (disposed) {
        return;
      }
      if (!thumb) {
        setThumbUrl(null);
        return;
      }

      objectUrl = URL.createObjectURL(thumb.blob);
      setThumbUrl(objectUrl);
    })
    .catch(() => {
      if (disposed) {
        return;
      }
      setThumbUrl(null);
    });

  return () => {
    disposed = true;
    controller.abort();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  };
}

function getGalleryItemThumbnailIdentity(item: GalleryItem): string {
  if (item.type === 'video-project') {
    return `${item.id}:${item.hasThumbnail}:${item.presentationRevision ?? ''}:${item.workspaceRevision ?? ''}`;
  }
  if (item.type === 'scenario' || item.type === 'scenario-export') {
    return `${item.id}:${item.hasThumbnail}:${item.project.updatedAt}:${item.workspaceRevision ?? ''}`;
  }
  return `${item.id}:${item.hasThumbnail}:${item.entityId ?? item.id}`;
}

type MediaThumbProps = {
  assetId?: string;
  deferUntilVisible?: boolean;
  fit?: 'contain' | 'cover';
  showProjectHint?: boolean;
  item?: GalleryItem;
  kind?: GalleryItemKind;
};

function useResolvedMediaThumbItem(props: MediaThumbProps): GalleryItem {
  const syntheticItemRef = useRef<GalleryItem | null>(null);
  const syntheticKeyRef = useRef<string | null>(null);

  if (props.item) {
    syntheticItemRef.current = null;
    syntheticKeyRef.current = null;
    return props.item;
  }

  const kind = props.kind ?? 'image';
  const id = props.assetId ?? 'thumb-item';
  const nextSyntheticKey = `${kind}:${id}`;

  if (syntheticKeyRef.current !== nextSyntheticKey || syntheticItemRef.current === null) {
    syntheticKeyRef.current = nextSyntheticKey;
    syntheticItemRef.current = createMediaThumbFallbackItem(kind, id);
  }

  return syntheticItemRef.current;
}

export function MediaThumb(props: MediaThumbProps) {
  const item = useResolvedMediaThumbItem(props);
  const itemRef = useRef(item);
  itemRef.current = item;
  const thumbnailIdentity = getGalleryItemThumbnailIdentity(item);
  const deferUntilVisible =
    props.deferUntilVisible === true && (item.type === 'scenario' || item.type === 'video-project');
  const visibilityRoot = useRef<HTMLDivElement>(null);
  const [visibility, setVisibility] = useState({ visible: false, epoch: 0 });
  const visible = !deferUntilVisible || visibility.visible;
  const epoch = deferUntilVisible ? visibility.epoch : 0;
  const [thumb, setThumb] = useState<{
    epoch: number;
    identity: string;
    url: string | null;
  } | null>(null);

  useEffect(() => {
    if (!deferUntilVisible) return;
    const root = visibilityRoot.current;
    if (!root) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisibility((current) => ({ visible: true, epoch: current.epoch + 1 }));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const nextVisible = entries.some((entry) => entry.isIntersecting);
        setVisibility((current) =>
          current.visible === nextVisible
            ? current
            : { visible: nextVisible, epoch: current.epoch + 1 }
        );
      },
      { rootMargin: '300px 0px' }
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [deferUntilVisible]);

  useEffect(() => {
    if (!visible) return;
    return loadThumbUrl(itemRef.current, (url) =>
      setThumb({ epoch, identity: thumbnailIdentity, url })
    );
  }, [thumbnailIdentity, visible, epoch]);

  const thumbUrl =
    visible && thumb?.identity === thumbnailIdentity && thumb.epoch === epoch ? thumb.url : null;
  const content = thumbUrl ? (
    <img
      src={thumbUrl}
      alt={translate('gallery.preview.thumbnailAlt')}
      className={`pointer-events-none h-full w-full object-center ${
        props.fit === 'contain' ? 'object-contain' : 'object-cover'
      }`}
      data-fit={props.fit ?? 'cover'}
    />
  ) : (
    <MediaThumbFallback item={item} showProjectHint={props.showProjectHint ?? true} />
  );

  return deferUntilVisible ? (
    <div
      ref={visibilityRoot}
      className="pointer-events-none h-full w-full"
      data-ui="gallery.thumb.visibility-root"
    >
      {content}
    </div>
  ) : (
    content
  );
}

function MediaThumbFallback(props: { item: GalleryItem; showProjectHint: boolean }) {
  const { item } = props;
  const Icon = getKindIcon(item.kind);
  const isProject = item.type === 'scenario' || item.type === 'video-project';
  const isAudio = item.kind === 'audio';
  const duration =
    isAudio && item.duration !== null && Number.isFinite(item.duration) ? item.duration : null;
  return (
    <div
      className={[
        'pointer-events-none',
        GALLERY_THUMB_FALLBACK_CLASS_NAME,
        GALLERY_THUMB_FALLBACK_SURFACE_CLASS_NAME,
      ].join(' ')}
    >
      <div className="max-w-full space-y-1 px-2 text-center">
        <Icon
          className={
            isAudio
              ? 'mx-auto h-4 w-4 opacity-80'
              : isProject
                ? 'mx-auto h-6 w-6 opacity-80'
                : 'h-10 w-10 opacity-80'
          }
          aria-hidden="true"
        />
        {isAudio ? (
          <div data-ui="gallery.thumb.audio" className="min-w-0 space-y-1">
            <p className="line-clamp-2 break-words text-xs font-medium" title={item.filename}>
              {item.filename}
            </p>
            {duration !== null ? (
              <p className="text-[10px] tabular-nums">{formatDurationLabel(duration)}</p>
            ) : null}
          </div>
        ) : null}
        {props.showProjectHint && isProject ? (
          <p className="text-xs">{translate('gallery.preview.projectPreviewMissing')}</p>
        ) : null}
      </div>
    </div>
  );
}
