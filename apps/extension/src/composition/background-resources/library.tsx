import { MediaLibraryList } from '../../ui/media-library-list';
import { NativeDrawer } from '@sniptale/ui/product-modal/native-drawer';
import { DebouncedMediaLibraryHeader } from '../../ui/media-library-header';
import { useEffect, useRef, useState } from 'react';

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
  return (
    <NativeDrawer
      anchor={props.anchor}
      onClose={props.onClose}
      title={translate('settings.editor.backgrounds.library')}
      dataUi="background.library.drawer"
    >
      <BackgroundLibraryContent {...props} />
    </NativeDrawer>
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
      <MediaLibraryList
        label={title}
        status={status}
        total={items.length}
        items={visibleItems}
        busy={props.busy}
        onSelect={props.onSelect}
        onRetry={() => setAttempt((n) => n + 1)}
        emptyLabel={translate('settings.editor.backgrounds.empty')}
        thumbnail={(item) => <BackgroundLibraryThumbnail mediaId={item.id} fit="contain" />}
      />
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
  return (
    <DebouncedMediaLibraryHeader
      title={translate('settings.editor.backgrounds.library')}
      dataUi="background.library"
      onQuery={props.onQuery}
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
