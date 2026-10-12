import { MediaLibraryList } from '../../ui/media-library-list';
import { NativeDrawer } from '@sniptale/ui/product-modal/native-drawer';
import { DebouncedMediaLibraryHeader } from '../../ui/media-library-header';
import { useState } from 'react';

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
  return (
    <NativeDrawer
      anchor={props.anchor}
      onClose={props.onClose}
      title={translate('settings.editor.backgrounds.library')}
      dataUi="gallery.videoReview.presentationLibrary.drawer"
      containKeys
    >
      <PresentationLibraryContent {...props} />
    </NativeDrawer>
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
      <MediaLibraryList
        label={title}
        status={status}
        total={items.length}
        items={visibleItems}
        busy={props.busy}
        onSelect={props.onSelect}
        onRetry={retry}
        emptyLabel={translate('gallery.videoReview.presentationLibraryEmpty')}
        thumbnail={(item) => <PresentationLibraryThumbnail mediaId={item.id} fit="contain" />}
      />
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
  return (
    <DebouncedMediaLibraryHeader
      title={translate('settings.editor.backgrounds.library')}
      dataUi="gallery.videoReview.presentationLibrary"
      onQuery={props.onQuery}
      searchLabel={translate(
        props.kind === 'media'
          ? 'gallery.videoReview.presentationSearchMedia'
          : props.kind === 'video'
            ? 'gallery.videoReview.presentationSearchVideo'
            : 'settings.editor.backgrounds.search'
      )}
      filterLabel={translate('settings.editor.backgrounds.filter')}
      viewId={props.viewId}
      onViewChange={props.onViewChange}
      options={presentationLibraryOptions(props)}
      onClose={props.onClose}
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
