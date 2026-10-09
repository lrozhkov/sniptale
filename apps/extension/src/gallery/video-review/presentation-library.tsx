import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Search, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { ProductModal, ProductModalHeader } from '@sniptale/ui/product-modal';
import { MaterialBrowser } from '@sniptale/ui/material-browser';
import type { GallerySavedView } from '../../composition/persistence/gallery-saved-views';
import {
  usePresentationLibrary,
  usePresentationLibraryThumbnail,
} from './use-presentation-library';
import { translate } from '../../platform/i18n';

/** Each visible thumbnail owns and revokes its disposable Blob URL. */
function PresentationLibraryThumbnail({
  mediaId,
  fit = 'cover',
}: {
  mediaId: string;
  fit?: 'cover' | 'contain';
}) {
  const { anchor, url } = usePresentationLibraryThumbnail(mediaId);
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
export function ReviewPresentationLibrary(props: {
  kind: 'image' | 'video' | 'media';
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
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
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
        <div
          className="flex h-full min-h-0 flex-col"
          data-ui="gallery.videoReview.presentationLibrary.drawer"
        >
          <PresentationLibraryContent {...props} />
        </div>
      </ProductModal>
    </dialog>,
    resolveThemeSafePortalTarget(props.anchor)
  );
}

/** Library listing owns its read/search/retry lifecycle independently of modal placement. */
function PresentationLibraryContent(props: {
  kind: 'image' | 'video' | 'media';
  onSelect(id: string): void;
  onClose(): void;
  busy: boolean;
}) {
  const [appliedQuery, setAppliedQuery] = useState('');
  const [viewId, setViewId] = useState('section:all');
  const { items, views, visibleItems, activeViewId, status, retry } = usePresentationLibrary(
    props.kind,
    appliedQuery,
    viewId
  );
  const title = translate('settings.editor.backgrounds.library');
  return (
    <>
      <PresentationLibraryHeader
        kind={props.kind}
        views={views}
        viewId={activeViewId}
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
              <button onClick={retry}>{translate('settings.editor.backgrounds.retry')}</button>
            ) : items.length === 0 ? (
              <p>{translate('gallery.videoReview.presentationLibraryEmpty')}</p>
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
                <PresentationLibraryThumbnail mediaId={item.id} fit="contain" />
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
function PresentationLibraryHeader(props: {
  kind: 'image' | 'video' | 'media';
  views: GallerySavedView[];
  viewId: string;
  onViewChange(id: string): void;
  onQuery(query: string): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const { onQuery } = props;
  useEffect(() => {
    const timer = setTimeout(() => onQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query, onQuery]);
  return (
    <ProductModalHeader
      title={translate('settings.editor.backgrounds.library')}
      actions={
        <div
          className="flex shrink-0 items-center gap-3"
          data-ui="gallery.videoReview.presentationLibrary.controls"
        >
          <div
            className="flex h-8 w-48 shrink-0 items-center gap-1.5 rounded-[6px] border
              border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)] px-2
              transition-[width] duration-200 focus-within:w-60 motion-reduce:transition-none"
            data-ui="gallery.videoReview.presentationLibrary.search"
          >
            <Search
              className="h-4 w-4 shrink-0 text-[var(--sniptale-color-text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none
                  placeholder:text-[var(--sniptale-color-text-muted)] focus:placeholder:text-transparent"
              aria-label={translate(
                props.kind === 'media'
                  ? 'gallery.videoReview.presentationSearchMedia'
                  : props.kind === 'video'
                    ? 'gallery.videoReview.presentationSearchVideo'
                    : 'settings.editor.backgrounds.search'
              )}
              placeholder={translate(
                props.kind === 'media'
                  ? 'gallery.videoReview.presentationSearchMedia'
                  : props.kind === 'video'
                    ? 'gallery.videoReview.presentationSearchVideo'
                    : 'settings.editor.backgrounds.search'
              )}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  props.onQuery(query);
                }
              }}
            />
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-1">
            <Filter
              size={16}
              className="text-[var(--sniptale-color-text-muted)]"
              aria-hidden="true"
            />
            <ProductSelect
              dataUi="gallery.videoReview.presentationLibrary.filter"
              aria-label={translate('settings.editor.backgrounds.filter')}
              title={presentationLibrarySelectionLabel(props)}
              containerClassName="!w-48 shrink-0"
              style={{
                minHeight: 32,
                height: 32,
                paddingTop: 4,
                paddingBottom: 4,
                borderRadius: 6,
              }}
              controlSize="sm"
              value={props.viewId}
              onChange={props.onViewChange}
              menuWidth={280}
              options={presentationLibraryOptions(props)}
            />
          </div>
          <ContentToolbarButton
            onClick={props.onClose}
            aria-label={translate('common.actions.close')}
            title={translate('common.actions.close')}
          >
            <X size={14} aria-hidden="true" />
          </ContentToolbarButton>
        </div>
      }
    />
  );
}

function presentationLibrarySections(kind: 'image' | 'video' | 'media') {
  return kind === 'media'
    ? [
        {
          id: 'all',
          folder: 'all',
          label: translate('gallery.videoReview.presentationLibraryAll'),
        },
        {
          id: 'image',
          folder: 'screenshot',
          label: translate('gallery.videoReview.presentationLibraryImages'),
        },
        {
          id: 'video',
          folder: 'recording',
          label: translate('gallery.videoReview.presentationLibraryVideos'),
        },
      ]
    : [
        {
          id: 'all',
          folder: 'all',
          label: translate(
            kind === 'video'
              ? 'gallery.videoReview.presentationLibraryVideos'
              : 'gallery.videoReview.presentationLibraryImages'
          ),
        },
      ];
}

function presentationLibraryOptions(props: {
  kind: 'image' | 'video' | 'media';
  views: GallerySavedView[];
}) {
  return presentationLibrarySections(props.kind).flatMap((section) => [
    { value: `section:${section.id}`, label: section.label },
    ...props.views
      .filter((view) => (props.kind === 'media' ? view.folderFilter === section.folder : true))
      .map((view) => ({
        value: `view:${view.id}`,
        label: view.name,
        group: section.label,
      })),
  ]);
}

function presentationLibrarySelectionLabel(props: {
  kind: 'image' | 'video' | 'media';
  views: GallerySavedView[];
  viewId: string;
}) {
  const option = presentationLibraryOptions(props).find((option) => option.value === props.viewId);
  return option && 'group' in option ? `${option.group}: ${option.label}` : option?.label;
}
