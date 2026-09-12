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
          <LibraryMediaPlayer
            key={item.id}
            kind={isImage ? 'image' : 'video'}
            src={media.url}
            filename={item.filename}
          >
            <p
              role={media.status === 'unavailable' ? 'alert' : 'status'}
              className="p-4 text-sm text-white"
            >
              {translate(
                media.status === 'unavailable'
                  ? 'videoEditor.sidebar.mediaPreviewUnavailable'
                  : 'common.states.loading'
              )}
            </p>
          </LibraryMediaPlayer>
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

function LibraryMediaInsert(props: {
  item: MediaLibraryItem;
  ready: boolean;
  onAddMedia: (mediaId: string) => Promise<void>;
}) {
  const item = props.item;
  const isImage = item.kind === 'image' || item.kind === 'screenshot';
  return (
    <>
      <footer className="flex shrink-0 items-center gap-4 border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={item.filename}>
            {item.filename}
          </p>
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

type PreviewState = { status: 'loading' | 'unavailable' | 'ready'; url: string | null };
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
      if (isImage) {
        const presentation = await getAggregatePresentation({ id: item.id, kind: 'image' });
        if (presentation?.presentationRevision === (item.workspaceRevision ?? 0))
          blob = presentation.previewBlob;
      } else blob = await getMediaAssetBlob(item.id);
      if (disposed) return;
      if (!blob) {
        setState({ status: 'unavailable', url: null });
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setState({ status: 'ready', url: objectUrl });
    };
    void load().catch(() => {
      if (!disposed) setState({ status: 'unavailable', url: null });
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item]);
  return state;
}
