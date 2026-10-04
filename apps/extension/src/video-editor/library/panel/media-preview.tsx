import { Maximize2, Minimize2, Music } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { LibraryMediaAdd } from './media-add';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library/index';
import { getAggregatePresentation } from '../../../composition/persistence/aggregate-presentations';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';
import { translate } from '../../../platform/i18n';
import { formatDuration, formatSize } from '../../chrome/display';
import { formatDimensions } from '../items/cards';
import { PreviewVideo } from '../../../composition/library-preview/video-player';
import { PreviewZoomControls } from '../../../composition/library-preview/image-zoom-controls';
import { usePreviewImageZoom } from '../../../composition/library-preview/usePreviewImageZoom';
import { useLibraryFullscreen } from '../../../composition/library-preview/viewport';

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
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg bg-[var(--sniptale-color-surface-canvas)]">
      {media.url ? (
        isImage ? (
          <LibraryImagePreview key={media.url} src={media.url} filename={item.filename} />
        ) : (
          <PreviewVideo key={media.url} src={media.url} />
        )
      ) : (
        fallback
      )}
    </div>
  );
}

function LibraryImagePreview({ src, filename }: { src: string; filename: string }) {
  const zoom = usePreviewImageZoom(true, src);
  const [failed, setFailed] = useState(false);
  const [fullscreenFailed, setFullscreenFailed] = useState(false);
  const fullscreen = useLibraryFullscreen(setFullscreenFailed);
  const fullscreenLabel = translate(
    fullscreen.fullscreen ? 'videoEditor.stage.exitFullscreen' : 'videoEditor.stage.enterFullscreen'
  );
  return (
    <div
      ref={fullscreen.frame}
      data-ui="video-editor.library.image-preview"
      className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--sniptale-color-surface-canvas)]"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && fullscreen.fullscreen) {
          event.preventDefault();
          event.stopPropagation();
          fullscreen.exitFullscreen();
        }
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 p-2">
        <PreviewZoomControls controls={zoom.controls} disabled={!zoom.image.ready || failed} />
        <ContentToolbarButton
          ref={fullscreen.fullscreen ? undefined : fullscreen.fullscreenButton}
          type="button"
          aria-label={fullscreenLabel}
          title={fullscreenLabel}
          disabled={!zoom.image.ready || failed}
          tone="utility"
          size="compact"
          className="!h-9 !w-9 !p-0"
          onClick={fullscreen.fullscreen ? fullscreen.exitFullscreen : fullscreen.enterFullscreen}
        >
          {fullscreen.fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </ContentToolbarButton>
      </div>
      {fullscreenFailed ? (
        <p role="alert" className="px-3 text-xs">
          {translate('videoEditor.sidebar.mediaPreviewActionFailed')}
        </p>
      ) : null}
      <div
        ref={zoom.viewport.containerRef}
        onPointerDown={zoom.viewport.handlePointerDown}
        onPointerMove={zoom.viewport.handlePointerMove}
        onPointerUp={zoom.viewport.handlePointerEnd}
        onPointerCancel={zoom.viewport.handlePointerEnd}
        className={`min-h-0 min-w-0 flex-1 touch-none overflow-auto overscroll-contain p-4 ${
          zoom.controls.isZoomedFromFit
            ? zoom.viewport.isPanning
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : ''
        }`}
      >
        <div className="grid h-max min-h-full w-max min-w-full place-items-center">
          {!failed ? (
            <img
              src={src}
              alt={filename}
              draggable={false}
              onLoad={zoom.image.handleImageLoad}
              onError={() => setFailed(true)}
              style={{ ...zoom.image.style, visibility: zoom.image.ready ? 'visible' : 'hidden' }}
              className="block max-h-none max-w-none shrink-0 select-none"
            />
          ) : (
            <p role="alert" className="text-sm text-[var(--sniptale-color-text-primary)]">
              {translate('videoEditor.sidebar.mediaPreviewImageDecodeFailed')}
            </p>
          )}
        </div>
      </div>
    </div>
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
  item: MediaLibraryItem | null;
};
function useMediaPreview(item: MediaLibraryItem | null): PreviewState {
  const [state, setState] = useState<PreviewState>({ status: 'loading', url: null, item: null });
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    setState({ status: 'loading', url: null, item });
    if (!item) return;
    const load = async () => {
      const isImage = item.kind === 'image' || item.kind === 'screenshot';
      let blob: Blob | undefined;
      if (isImage && ((item.workspaceRevision ?? 0) !== 0 || item.imageContentState === 'edited')) {
        const presentation = await getAggregatePresentation({ id: item.id, kind: 'image' });
        if (presentation?.presentationRevision === (item.workspaceRevision ?? 0))
          blob = presentation.previewBlob;
        if (!blob) {
          if (!disposed) setState({ status: 'image-not-ready', url: null, item });
          return;
        }
      } else blob = await getMediaAssetBlob(item.id);
      if (disposed) return;
      if (!blob?.size) {
        setState({ status: 'unavailable', url: null, item });
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setState({ status: 'ready', url: objectUrl, item });
    };
    void load().catch(() => {
      if (!disposed) setState({ status: 'failed', url: null, item });
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item]);
  return state.item === item ? state : { status: 'loading', url: null, item };
}
