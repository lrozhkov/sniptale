import { LibraryNavigation } from '../../composition/library-preview/navigation';
import { LibraryMediaPlayer } from '../../composition/library-preview/player';
import { GUIDE_LIBRARY_IMAGE_DRAG_TYPE } from './image-drop';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Image, RefreshCw, Film } from 'lucide-react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { listMediaLibrary, getMediaThumbnail } from '../../composition/persistence/media-library';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import {
  listGallerySavedViews,
  type GallerySavedView,
} from '../../composition/persistence/gallery-saved-views';
import { getAggregatePresentation } from '../../composition/persistence/aggregate-presentations';
import { matchesLibraryFilters } from '../../features/media-hub/library-filters';
import type { Translate } from '../../platform/i18n';

/** Reads library metadata; revisioned presentation bytes remain with the aggregate owner. */
function useLibraryCatalog() {
  const [catalog, setCatalog] = useState<{ items: MediaLibraryItem[]; views: GallerySavedView[] }>({
    items: [],
    views: [],
  });
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const turn = ++generation.current;
    setStatus('loading');
    try {
      const [items, views] = await Promise.all([listMediaLibrary(), listGallerySavedViews()]);
      if (turn !== generation.current) return;
      setCatalog({
        items: items.filter(
          (item) =>
            ((['video', 'recording', 'export'].includes(item.kind) &&
              item.mimeType.startsWith('video/')) ||
              item.kind === 'image' ||
              item.kind === 'screenshot') &&
            item.source.kind !== 'web-snapshot'
        ),
        views: views.filter((view) =>
          ['all', 'recording', 'screenshot'].includes(view.folderFilter)
        ),
      });
      setStatus('ready');
    } catch {
      if (turn === generation.current) setStatus('failed');
    }
  }, []);
  useEffect(() => {
    void reload();
    return () => {
      generation.current += 1;
    };
  }, [reload]);
  return { ...catalog, status, reload };
}

/** Owns one revocable preview URL; lazy cards acquire only when approaching the viewport. */
function LibraryRaster({
  item,
  full = false,
  t,
}: {
  item: MediaLibraryItem;
  full?: boolean;
  t: Translate;
}) {
  const video = item.kind !== 'image' && item.kind !== 'screenshot';
  const anchor = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{ item: MediaLibraryItem; url: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    let started = false;
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const presentation = video
          ? null
          : await getAggregatePresentation({ kind: 'image', id: item.id });
        const thumbnail = video ? await getMediaThumbnail(item.id) : null;
        if (!alive) return;
        const blob = video
          ? thumbnail?.blob
          : presentation?.presentationRevision === (item.workspaceRevision ?? 0)
            ? full
              ? presentation.previewBlob
              : presentation.thumbnailBlob
            : undefined;
        url = blob ? URL.createObjectURL(blob) : null;
        setResult({ item, url });
      } catch {
        if (alive) setResult({ item, url: null });
      }
    };
    const observer =
      !full && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                void load();
              }
            },
            { rootMargin: '160px' }
          )
        : null;
    if (observer && anchor.current) observer.observe(anchor.current);
    else void load();
    return () => {
      alive = false;
      observer?.disconnect();
      if (url) URL.revokeObjectURL(url);
    };
  }, [item, full, video]);
  const current = result?.item === item ? result : null;
  return (
    <span
      ref={anchor}
      className={full ? 'guide-library-preview-raster' : 'guide-library-thumbnail'}
    >
      <LibraryRasterContent
        current={current}
        full={full}
        video={video}
        filename={item.filename}
        t={t}
      />
    </span>
  );
}

function LibraryRasterContent({
  current,
  full,
  video,
  filename,
  t,
}: {
  current: { url: string | null } | null;
  full: boolean;
  video: boolean;
  filename: string;
  t: Translate;
}) {
  return (
    <>
      {current?.url ? (
        full ? (
          <LibraryMediaPlayer kind="image" src={current.url} filename={filename}>
            <span role="status">{t('scenario.editor.loading')}</span>
          </LibraryMediaPlayer>
        ) : (
          <img src={current.url} alt="" draggable={false} />
        )
      ) : video ? (
        <Film size={24} aria-hidden="true" />
      ) : (
        <Image size={full ? 32 : 24} aria-hidden="true" />
      )}
      {full && !current && <span role="status">{t('scenario.editor.loading')}</span>}
      {full && current && !current.url && (
        <span role="alert">{t('scenario.editor.guideLibraryPreviewUnavailable')}</span>
      )}
    </>
  );
}

/** Library navigation, image grid and selected preview use the app's read-only library contracts. */
type GuideLibraryBrowserProps = {
  t: Translate;
  disabled: boolean;
  selectedIds: string[];
  onChoose: (id: string, name: string, kind: 'image' | 'video') => void;
  onDragStart?: (() => void) | undefined;
  previewContent?: ReactNode;
};

export function GuideLibraryBrowser({
  t,
  disabled,
  selectedIds,
  onChoose,
  onDragStart,
  previewContent,
}: GuideLibraryBrowserProps) {
  const catalog = useLibraryCatalog();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'video' | 'image'>('image');
  const [viewId, setViewId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const view = catalog.views.find((entry) => entry.id === viewId);
  const normalized = query.trim().toLocaleLowerCase();
  const items = catalog.items.filter(
    (item) =>
      (category === 'all' ||
        (category === 'video'
          ? item.kind !== 'image' && item.kind !== 'screenshot'
          : item.kind === 'image' || item.kind === 'screenshot')) &&
      item.filename.toLocaleLowerCase().includes(normalized) &&
      (!view || matchesLibraryFilters(item, view.filters, Date.now()))
  );
  const preview = catalog.items.find((item) => item.id === previewId);
  return (
    <div className="guide-library-browser">
      <LibraryNavigation
        t={t}
        label={t('scenario.editor.guideLibraryNavigation')}
        category={category}
        presetId={viewId}
        savedViews={catalog.views}
        onCategoryChange={(value) => {
          setCategory(value);
          setViewId(null);
        }}
        onPresetChange={(id, nextCategory) => {
          setCategory(nextCategory);
          setViewId(id);
        }}
      />
      <div className="guide-library-content">
        <div className="guide-library-search">
          <ProductInput
            aria-label={t(
              category === 'video'
                ? 'scenario.editor.guideLibraryVideoSearch'
                : 'scenario.editor.guideLibrarySearch'
            )}
            placeholder={t(
              category === 'video'
                ? 'scenario.editor.guideLibraryVideoSearch'
                : 'scenario.editor.guideLibrarySearch'
            )}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ContentToolbarButton
            title={t('scenario.editor.guideChooseLibrary')}
            disabled={catalog.status === 'loading'}
            onClick={() => void catalog.reload()}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </ContentToolbarButton>
        </div>
        {catalog.status === 'loading' && <p role="status">{t('scenario.editor.loading')}</p>}
        {catalog.status === 'failed' && (
          <p role="alert">{t('scenario.editor.guideLibraryLoadFailed')}</p>
        )}
        <div
          className="guide-library-grid"
          aria-label={t(
            category === 'video'
              ? 'scenario.editor.guideLibraryVideos'
              : 'scenario.editor.guideLibraryAll'
          )}
        >
          {catalog.status === 'ready' &&
            items.map((item) => (
              <LibraryCard
                key={item.id}
                item={item}
                t={t}
                disabled={disabled}
                selected={selectedIds.includes(item.id)}
                onDragStart={onDragStart}
                onChoose={() => {
                  setPreviewId(item.id);
                  onChoose(
                    item.id,
                    item.filename,
                    item.kind === 'image' || item.kind === 'screenshot' ? 'image' : 'video'
                  );
                }}
              />
            ))}
          {catalog.status === 'ready' && !items.length && (
            <p>
              {t(
                category === 'video'
                  ? 'scenario.editor.guideLibraryVideoEmpty'
                  : 'scenario.editor.guideLibraryEmpty'
              )}
            </p>
          )}
        </div>
      </div>
      <aside
        className="guide-library-preview"
        aria-label={t('scenario.editor.guideLibraryPreview')}
      >
        {preview && preview.kind !== 'image' && preview.kind !== 'screenshot' ? (
          previewContent
        ) : preview ? (
          <>
            <LibraryRaster item={preview} full t={t} />
            <strong>{preview.filename}</strong>
            <span>
              {preview.width} × {preview.height}
            </span>
          </>
        ) : (
          <p>{t('scenario.editor.guideLibraryPreviewHint')}</p>
        )}
      </aside>
    </div>
  );
}

/** One media card owns its selection affordance and native image drag payload. */
function LibraryCard({
  item,
  t,
  disabled,
  selected,
  onDragStart,
  onChoose,
}: {
  item: MediaLibraryItem;
  t: Translate;
  disabled: boolean;
  selected: boolean;
  onDragStart: (() => void) | undefined;
  onChoose(): void;
}) {
  return (
    <button
      type="button"
      className="guide-library-card"
      draggable={
        (item.kind === 'image' || item.kind === 'screenshot') && !disabled && Boolean(onDragStart)
      }
      onDragStart={(event) => {
        if ((item.kind !== 'image' && item.kind !== 'screenshot') || disabled || !onDragStart) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(
          GUIDE_LIBRARY_IMAGE_DRAG_TYPE,
          JSON.stringify({ mediaId: item.id })
        );
        onDragStart();
      }}
      disabled={disabled}
      aria-pressed={selected}
      onClick={onChoose}
    >
      <LibraryRaster item={item} t={t} />
      <span className="guide-library-card-name">{item.filename}</span>
      {selected && <Check size={16} className="guide-library-card-selected" aria-hidden="true" />}
    </button>
  );
}
