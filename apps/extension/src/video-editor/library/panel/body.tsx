import { matchesLibraryFilters } from '../../../features/media-hub/library-filters';
import { useDeferredValue, useMemo, useState } from 'react';
import { LibraryPanelDrawerContent } from './content';
import { useLibraryThumbnails } from './thumbnails/use-thumbnails';
import type { VideoEditorLibraryPanelBodyProps } from '../contracts/panel';

export function VideoEditorLibraryPanelBody(props: VideoEditorLibraryPanelBodyProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'video' | 'image'>('video');
  const [presetId, setPresetId] = useState<string | null>(null);
  const savedViews = props.savedViews.filter((view) =>
    ['all', 'recording', 'screenshot'].includes(view.folderFilter)
  );
  const preset = savedViews.find((view) => view.id === presetId);
  const normalizedQuery = useDeferredValue(query).trim().toLocaleLowerCase();
  const items = useMemo(
    () =>
      props.items.filter((item) => {
        if (item.source.kind === 'project-asset') return false;
        const eligible =
          category === 'image'
            ? item.kind === 'image' || item.kind === 'screenshot'
            : ['recording', 'video', 'export'].includes(item.kind) &&
              item.mimeType.startsWith('video/');
        return (
          eligible &&
          item.filename.toLocaleLowerCase().includes(normalizedQuery) &&
          (!preset || matchesLibraryFilters(item, preset.filters, Date.now()))
        );
      }),
    [props.items, category, normalizedQuery, preset]
  );
  const thumbnailItems = useMemo(
    () =>
      items.map((item) => ({
        createdAt: item.createdAt,
        id: item.id,
        mimeType: item.mimeType,
        sourceMediaId: item.id,
        thumbnailId: item.id,
        ...(item.workspaceRevision === undefined
          ? {}
          : { workspaceRevision: item.workspaceRevision }),
      })),
    [items]
  );
  const thumbnails = useLibraryThumbnails(thumbnailItems);
  return (
    <LibraryPanelDrawerContent
      {...props}
      items={items}
      query={query}
      onQueryChange={setQuery}
      category={category}
      onCategoryChange={(next) => {
        setCategory(next);
        setPresetId(null);
      }}
      savedViews={savedViews}
      presetId={preset?.id ?? null}
      onPresetChange={(id) => {
        const view = savedViews.find((candidate) => candidate.id === id);
        setPresetId(id);
        if (view?.folderFilter === 'recording') setCategory('video');
        if (view?.folderFilter === 'screenshot') setCategory('image');
      }}
      thumbnails={thumbnails}
    />
  );
}
