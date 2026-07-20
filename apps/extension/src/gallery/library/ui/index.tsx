import {
  Archive,
  AudioLines,
  FileStack,
  FileText,
  Image as ImageIcon,
  Images,
  Video,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatDateTime, getCurrentLocale, translate } from '../../../platform/i18n';
import type { FolderFilter } from '../types';
import { ensureGalleryItemThumbnail, type GalleryItem, type GalleryItemKind } from '../items';
import { createMediaThumbFallbackItem } from './fallback-items';

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
  screenshot: translate('gallery.preview.folderScreenshot'),
  recording: translate('gallery.preview.folderRecording'),
  export: translate('gallery.preview.folderExport'),
  'web-snapshot': translate('gallery.preview.folderWebSnapshot'),
  scenario: translate('gallery.preview.folderScenario'),
};

export function getGalleryFolderIcon(folder: FolderFilter) {
  if (folder === 'all') {
    return Images;
  }

  if (folder === 'scenario') {
    return FileStack;
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
      return translate('gallery.preview.folderExport');
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

export function formatDate(timestamp: number): string {
  return formatDateTime(
    timestamp,
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
    getCurrentLocale()
  );
}

export function getKindIcon(kind: GalleryItemKind) {
  switch (kind) {
    case 'recording':
    case 'export':
    case 'video':
    case 'video-project':
      return Video;
    case 'audio':
      return AudioLines;
    case 'scenario':
      return FileStack;
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

  ensureGalleryItemThumbnail(item)
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
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  };
}

function getGalleryItemThumbnailIdentity(item: GalleryItem): string {
  if (item.type === 'video-project') {
    return `${item.id}:${item.hasThumbnail}:${item.thumbnailSourceMediaId ?? ''}`;
  }
  if (item.type === 'scenario' || item.type === 'scenario-export') {
    return `${item.id}:${item.hasThumbnail}:${item.project.updatedAt}`;
  }
  return `${item.id}:${item.hasThumbnail}:${item.entityId ?? item.id}`;
}

type MediaThumbProps = {
  assetId?: string;
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
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    return loadThumbUrl(itemRef.current, setThumbUrl);
  }, [thumbnailIdentity]);

  const Icon = getKindIcon(item.kind);

  if (thumbUrl) {
    return (
      <img
        src={thumbUrl}
        alt={translate('gallery.preview.thumbnailAlt')}
        className="pointer-events-none h-full w-full object-cover"
      />
    );
  }

  return (
    <div
      className={[
        'pointer-events-none',
        GALLERY_THUMB_FALLBACK_CLASS_NAME,
        GALLERY_THUMB_FALLBACK_SURFACE_CLASS_NAME,
      ].join(' ')}
    >
      <Icon className="h-10 w-10 opacity-80" />
    </div>
  );
}
