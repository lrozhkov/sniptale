import { MediaLibraryHeader } from '../../ui/media-library-header';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { ProductModal } from '@sniptale/ui/product-modal';
import { MaterialBrowser } from '@sniptale/ui/material-browser';
import {
  listMediaLibrary,
  getMediaThumbnail,
  getMediaAssetBlob,
} from '../persistence/media-library';
import type { MediaLibraryItem } from '../persistence/media-library/contracts';
import { listGallerySavedViews, type GallerySavedView } from '../persistence/gallery-saved-views';
import { matchesLibraryFilters } from '../../features/media-hub/library-filters';
import { translate } from '../../platform/i18n';

/** Each visible thumbnail owns and revokes its disposable Blob URL. */
export function BackgroundLibraryThumbnail({
  mediaId,
  fit = 'cover',
}: {
  mediaId: string;
  fit?: 'cover' | 'contain';
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((item) => item.isIntersecting)) return;
      observer.disconnect();
      void (async () => {
        const thumbnail = await getMediaThumbnail(mediaId);
        const blob = thumbnail?.blob ?? (await getMediaAssetBlob(mediaId));
        if (!blob || !active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })().catch(() => undefined);
    });
    if (anchor.current) observer.observe(anchor.current);
    return () => {
      active = false;
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);
  return (
    <span ref={anchor} className="block h-full w-full">
      {url && (
        <img
          src={url}
          alt=""
          className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
        />
      )}
    </span>
  );
}

/** Native modal owns focus trapping, Escape and restoration, including inside quick-editor dialogs. */
export function BackgroundLibraryDrawer(props: {
  anchor: HTMLElement | null;
  onClose(): void;
  onSelect(id: string): void;
  busy: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const theme = useResolvedPortalTheme(props.anchor);
  useLayoutEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);
  const title = translate('settings.editor.backgrounds.library');
  return createPortal(
    <dialog
      ref={dialog}
      role="dialog"
      data-theme={theme ?? undefined}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      className={[
        'm-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <ProductModal
        onClose={props.onClose}
        width="max(960px, 80vw)"
        maxWidth="calc(100vw - 24px)"
        maxHeight="100vh"
        role="presentation"
        dialogClassName={[
          '!bottom-0 !left-0 !top-0 !h-screen !transform-none !rounded-none !border-l-0',
          '!bg-[color:rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)]',
        ].join(' ')}
      >
        <div className="flex h-full min-h-0 flex-col" data-ui="background.library.drawer">
          <BackgroundLibraryContent {...props} />
        </div>
      </ProductModal>
    </dialog>,
    resolveThemeSafePortalTarget(props.anchor)
  );
}

/** Library listing owns its read/search/retry lifecycle independently of modal placement. */
function BackgroundLibraryContent(props: {
  onSelect(id: string): void;
  onClose(): void;
  busy: boolean;
}) {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [appliedQuery, setAppliedQuery] = useState('');
  const [views, setViews] = useState<GallerySavedView[]>([]);
  const [viewId, setViewId] = useState('');
  useEffect(() => {
    let active = true;
    setStatus('loading');
    void Promise.all([listMediaLibrary(), listGallerySavedViews()])
      .then(([rows, savedViews]) => {
        if (!active) return;
        setItems(
          rows.filter(
            (item) =>
              ['image', 'screenshot'].includes(item.kind) && item.lifecycle?.trashedAt === undefined
          )
        );
        setViews(
          savedViews.filter(
            (view) => view.folderFilter === 'all' || view.folderFilter === 'screenshot'
          )
        );
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('failed');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const selected = views.find((view) => view.id === viewId);
  const visibleItems = items.filter(
    (item) =>
      item.filename.toLocaleLowerCase().includes(appliedQuery.trim().toLocaleLowerCase()) &&
      (!selected || matchesLibraryFilters(item, selected.filters, Date.now()))
  );
  const title = translate('settings.editor.backgrounds.library');
  return (
    <>
      <BackgroundLibraryHeader
        views={views}
        viewId={viewId}
        onViewChange={setViewId}
        onQuery={setAppliedQuery}
        onClose={props.onClose}
      />
      <div className="flex min-h-0 flex-1 p-4">
        <MaterialBrowser
          labels={{ list: title, show: title, hide: title }}
          listClassName="auto-rows-max"
          status={
            status === 'loading' ? (
              <p>{translate('settings.editor.backgrounds.loading')}</p>
            ) : status === 'failed' ? (
              <button onClick={() => setAttempt((n) => n + 1)}>
                {translate('settings.editor.backgrounds.retry')}
              </button>
            ) : items.length === 0 ? (
              <p>{translate('settings.editor.backgrounds.empty')}</p>
            ) : visibleItems.length === 0 ? (
              <p>{translate('settings.editor.backgrounds.noResults')}</p>
            ) : undefined
          }
        >
          {visibleItems.map((item) => (
            <button
              type="button"
              key={item.id}
              disabled={props.busy}
              title={item.filename}
              onClick={() => props.onSelect(item.id)}
              className={[
                'flex min-h-0 flex-col overflow-hidden rounded border text-left',
                'border-[var(--sniptale-color-border-subtle)]',
                'hover:border-[var(--sniptale-color-text-secondary)] disabled:opacity-50',
              ].join(' ')}
            >
              <span className="block h-44 w-full shrink-0 bg-[var(--sniptale-color-surface-canvas)]">
                <BackgroundLibraryThumbnail mediaId={item.id} fit="contain" />
              </span>
              <span className="block w-full shrink-0 truncate p-2 text-xs">{item.filename}</span>
            </button>
          ))}
        </MaterialBrowser>
      </div>
    </>
  );
}

/** Header owns transient typing; applied filters remain with the listing. */
function BackgroundLibraryHeader(props: {
  views: GallerySavedView[];
  viewId: string;
  onViewChange(id: string): void;
  onQuery(query: string): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const { onQuery } = props;
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => onQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query, onQuery, composing]);
  return (
    <MediaLibraryHeader
      title={translate('settings.editor.backgrounds.library')}
      dataUi="background.library"
      query={query}
      onQueryChange={setQuery}
      onApplyQuery={() => onQuery(query)}
      onComposingChange={setComposing}
      searchLabel={translate('settings.editor.backgrounds.search')}
      filterLabel={translate('settings.editor.backgrounds.filter')}
      viewId={props.viewId}
      onViewChange={props.onViewChange}
      options={[
        { value: '', label: translate('settings.editor.backgrounds.allImages') },
        ...props.views.map((view) => ({
          value: view.id,
          label: view.name,
          group: translate('settings.editor.backgrounds.allImages'),
        })),
      ]}
      onClose={props.onClose}
    />
  );
}
