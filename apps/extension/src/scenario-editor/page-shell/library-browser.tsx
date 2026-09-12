import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Image, Library, RefreshCw } from 'lucide-react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { listMediaLibrary } from '../../composition/persistence/media-library';
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
            (item.kind === 'image' || item.kind === 'screenshot') &&
            item.source.kind !== 'web-snapshot'
        ),
        views: views.filter(
          (view) => view.folderFilter === 'all' || view.folderFilter === 'screenshot'
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
        const presentation = await getAggregatePresentation({ kind: 'image', id: item.id });
        if (!alive) return;
        const blob =
          presentation?.presentationRevision === (item.workspaceRevision ?? 0)
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
  }, [item, full]);
  const current = result?.item === item ? result : null;
  return (
    <span
      ref={anchor}
      className={full ? 'guide-library-preview-raster' : 'guide-library-thumbnail'}
    >
      {current?.url ? (
        <img src={current.url} alt={full ? item.filename : ''} draggable={false} />
      ) : (
        <Image size={full ? 32 : 24} aria-hidden="true" />
      )}
      {full && !current && <span role="status">{t('scenario.editor.loading')}</span>}
      {full && current && !current.url && (
        <span role="alert">{t('scenario.editor.guideLibraryPreviewUnavailable')}</span>
      )}
    </span>
  );
}

/** Library navigation, image grid and selected preview use the app's read-only library contracts. */
export function GuideLibraryBrowser({
  t,
  disabled,
  selectedIds,
  onChoose,
  fileAction,
}: {
  t: Translate;
  disabled: boolean;
  selectedIds: string[];
  onChoose: (id: string, name: string) => void;
  fileAction: ReactNode;
}) {
  const catalog = useLibraryCatalog();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'screenshot' | 'image'>('all');
  const [viewId, setViewId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const view = catalog.views.find((entry) => entry.id === viewId);
  const normalized = query.trim().toLocaleLowerCase();
  const items = catalog.items.filter(
    (item) =>
      (category === 'all' || item.kind === category) &&
      item.filename.toLocaleLowerCase().includes(normalized) &&
      (!view || matchesLibraryFilters(item, view.filters, Date.now()))
  );
  const preview = catalog.items.find((item) => item.id === previewId);
  return (
    <div className="guide-library-browser">
      <nav
        className="guide-library-navigation"
        aria-label={t('scenario.editor.guideLibraryNavigation')}
      >
        {(['all', 'screenshot', 'image'] as const).map((key) => (
          <button
            type="button"
            key={key}
            aria-pressed={category === key && !view}
            onClick={() => {
              setCategory(key);
              setViewId(null);
            }}
          >
            {key === 'all' ? (
              <Library size={16} aria-hidden="true" />
            ) : (
              <Image size={16} aria-hidden="true" />
            )}
            {t(
              key === 'all'
                ? 'scenario.editor.guideLibraryAll'
                : key === 'screenshot'
                  ? 'scenario.editor.guideLibraryScreenshots'
                  : 'scenario.editor.guideLibraryImages'
            )}
          </button>
        ))}
        {catalog.views.map((entry) => (
          <button
            type="button"
            key={entry.id}
            aria-pressed={view?.id === entry.id}
            onClick={() => {
              setCategory('all');
              setViewId(entry.id);
            }}
          >
            {entry.name}
          </button>
        ))}
      </nav>
      <div className="guide-library-content">
        <div className="guide-library-search">
          <ProductInput
            aria-label={t('scenario.editor.guideLibrarySearch')}
            placeholder={t('scenario.editor.guideLibrarySearch')}
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
          {fileAction}
        </div>
        {catalog.status === 'loading' && <p role="status">{t('scenario.editor.loading')}</p>}
        {catalog.status === 'failed' && (
          <p role="alert">{t('scenario.editor.guideLibraryLoadFailed')}</p>
        )}
        <div className="guide-library-grid" aria-label={t('scenario.editor.guideLibraryAll')}>
          {catalog.status === 'ready' &&
            items.map((item) => (
              <button
                type="button"
                key={item.id}
                className="guide-library-card"
                disabled={disabled}
                aria-pressed={selectedIds.includes(item.id)}
                onClick={() => {
                  setPreviewId(item.id);
                  onChoose(item.id, item.filename);
                }}
              >
                <LibraryRaster item={item} t={t} />
                <span className="guide-library-card-name">{item.filename}</span>
                {selectedIds.includes(item.id) && (
                  <Check size={16} className="guide-library-card-selected" aria-hidden="true" />
                )}
              </button>
            ))}
          {catalog.status === 'ready' && !items.length && (
            <p>{t('scenario.editor.guideLibraryEmpty')}</p>
          )}
        </div>
      </div>
      <aside
        className="guide-library-preview"
        aria-label={t('scenario.editor.guideLibraryPreview')}
      >
        {preview ? (
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
