import { Music } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LibraryMediaAdd } from './media-add';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library/index';
import { getAggregatePresentation } from '../../../composition/persistence/aggregate-presentations';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';
import { translate } from '../../../platform/i18n';
import { formatDuration, formatSize } from '../../chrome/display';
import { formatDimensions } from '../items/cards';
import { LibraryMediaPlayer } from '../../../composition/library-preview/player';

export function MediaPreviewPane(props: {
  onAddMedia: (mediaId: string) => Promise<void>;
  item: MediaLibraryItem | null;
}) {
  const media = useMediaPreview(props.item);
  const item = props.item;
  const isImage = item?.kind === 'image' || item?.kind === 'screenshot';
  return (
    <aside
      data-ui="video-editor.library.media-preview"
      className={[
        'flex min-h-0 min-w-0 flex-col gap-3 rounded-xl border p-3',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
    >
      {item ? (
        <>
          <h2 className="shrink-0 truncate text-sm font-medium" title={item.filename}>
            {item.filename}
          </h2>
          <LibraryPreviewContent key={item.id} item={item} media={media} isImage={isImage} />
          <LibraryMediaInsert
            key={`insert:${item.id}`}
            item={item}
            ready={!!media.url}
            onAddMedia={props.onAddMedia}
          />
        </>
      ) : (
        <p className="text-sm text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.libraryMediaPreviewEmpty')}
        </p>
      )}
    </aside>
  );
}

function previewMessage(status: PreviewState['status'], item: MediaLibraryItem) {
  if (status === 'loading') return translate('common.states.loading');
  if (status === 'failed') return translate('videoEditor.sidebar.mediaPreviewReadFailed');
  if (status === 'image-not-ready')
    return translate('videoEditor.sidebar.mediaPreviewImageNotReady');
  if (item.kind === 'image' || item.kind === 'screenshot')
    return translate('videoEditor.sidebar.mediaPreviewImageMissing');
  if (item.kind === 'audio') return translate('videoEditor.sidebar.mediaPreviewAudioMissing');
  return translate('videoEditor.sidebar.mediaPreviewUnavailable');
}

function LibraryPreviewContent({
  item,
  media,
  isImage,
}: {
  item: MediaLibraryItem;
  media: PreviewState;
  isImage: boolean;
}) {
  const fallback = (
    <p
      role={media.status === 'loading' ? 'status' : 'alert'}
      className="p-4 text-sm text-[var(--sniptale-color-text-primary)]"
    >
      {previewMessage(media.status, item)}
    </p>
  );
  if (item.kind === 'audio')
    return (
      <LibraryAudioPreview url={media.url} filename={item.filename}>
        {fallback}
      </LibraryAudioPreview>
    );
  return (
    <LibraryMediaPlayer kind={isImage ? 'image' : 'video'} src={media.url} filename={item.filename}>
      {fallback}
    </LibraryMediaPlayer>
  );
}

function LibraryAudioPreview({
  url,
  filename,
  children,
}: {
  url: string | null;
  filename: string;
  children: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <div
      className={[
        'flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto rounded-lg p-4',
        'bg-[var(--sniptale-color-surface-canvas)]',
      ].join(' ')}
    >
      <Music size={48} aria-hidden />
      {url ? (
        <audio
          key={url}
          src={url}
          controls
          preload="metadata"
          aria-label={filename}
          className="w-full max-w-lg"
          onError={() => setFailed(true)}
        />
      ) : (
        children
      )}
      {failed && (
        <p role="alert">{translate('videoEditor.sidebar.mediaPreviewAudioDecodeFailed')}</p>
      )}
    </div>
  );
}

function LibraryMediaInsert(props: {
  item: MediaLibraryItem;
  ready: boolean;
  onAddMedia: (mediaId: string) => Promise<void>;
}) {
  const item = props.item;
  const isImage = item.kind === 'image' || item.kind === 'screenshot';
  return (
    <>
      <footer
        className={[
          'flex shrink-0 flex-wrap items-center gap-3 border-t pt-3',
          'border-[var(--sniptale-color-border-soft)]',
        ].join(' ')}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-[var(--sniptale-color-text-muted)]">
            {[
              !isImage && item.duration !== null ? formatDuration(item.duration) : null,
              formatDimensions(item.width, item.height),
              formatSize(item.size),
              item.mimeType,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <LibraryMediaAdd itemId={item.id} ready={props.ready} onAddMedia={props.onAddMedia} />
      </footer>
    </>
  );
}

type PreviewState = {
  status: 'loading' | 'unavailable' | 'image-not-ready' | 'failed' | 'ready';
  url: string | null;
};
function useMediaPreview(item: MediaLibraryItem | null): PreviewState {
  const [state, setState] = useState<PreviewState>({ status: 'loading', url: null });
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    setState({ status: 'loading', url: null });
    if (!item) return;
    const load = async () => {
      const isImage = item.kind === 'image' || item.kind === 'screenshot';
      let blob: Blob | undefined;
      if (isImage && ((item.workspaceRevision ?? 0) !== 0 || item.imageContentState === 'edited')) {
        const presentation = await getAggregatePresentation({ id: item.id, kind: 'image' });
        if (presentation?.presentationRevision === (item.workspaceRevision ?? 0))
          blob = presentation.previewBlob;
        if (!blob) {
          if (!disposed) setState({ status: 'image-not-ready', url: null });
          return;
        }
      } else blob = await getMediaAssetBlob(item.id);
      if (disposed) return;
      if (!blob?.size) {
        setState({ status: 'unavailable', url: null });
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setState({ status: 'ready', url: objectUrl });
    };
    void load().catch(() => {
      if (!disposed) setState({ status: 'failed', url: null });
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item]);
  return state;
}
