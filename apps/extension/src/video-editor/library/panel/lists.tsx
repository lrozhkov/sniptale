import { useState, type ReactNode } from 'react';
import { LibraryMediaAdd } from './media-add';
import { Film, Image, Music } from 'lucide-react';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';
import { translate } from '../../../platform/i18n';
import { formatDuration, formatSize } from '../../chrome/display';
import { formatDimensions } from '../items/cards';
import type { LibraryThumbnailViewState } from './thumbnails/types';
import { MediaPreviewPane } from './media-preview';

export function LibraryMediaSection(props: {
  search?: ReactNode;
  items: MediaLibraryItem[];
  thumbnails: Record<string, LibraryThumbnailViewState>;
  onAddMedia: (mediaId: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = props.items.find(({ id }) => id === selectedId) ?? props.items[0] ?? null;
  return (
    <div
      className={[
        'grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3',
        'grid-rows-[minmax(120px,0.7fr)_minmax(0,1.3fr)]',
        'md:grid-cols-[minmax(240px,0.4fr)_minmax(0,1fr)] md:grid-rows-1',
      ].join(' ')}
      data-ui="video-editor.library.media-tab"
    >
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        {props.search}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" data-ui="recordings-scroll">
          {props.items.length === 0 ? (
            <p className="text-sm text-[var(--sniptale-color-text-muted)]">
              {translate('videoEditor.sidebar.libraryNoSearchResults')}
            </p>
          ) : (
            props.items.map((item) => {
              const isImage = item.kind === 'image' || item.kind === 'screenshot';
              const Icon = isImage ? Image : item.kind === 'audio' ? Music : Film;
              const thumbnail = props.thumbnails[item.id]?.url;
              return (
                <div key={item.id} className="group/library-card relative">
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={selected?.id === item.id}
                    className={[
                      'relative flex w-full items-center gap-3 rounded-lg border p-2 pr-10 text-left',
                      'border-[var(--sniptale-color-border-soft)]',
                      'hover:bg-[var(--sniptale-color-surface-hover)]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
                      'focus-visible:ring-[var(--sniptale-color-text-primary)]',
                    ].join(' ')}
                  >
                    {selected?.id === item.id ? (
                      <span
                        data-ui="video-editor.library.selection-mark"
                        aria-hidden="true"
                        className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full
                          bg-[var(--sniptale-color-text-secondary)]"
                      />
                    ) : null}
                    <span
                      className={[
                        'flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md',
                        'bg-[var(--sniptale-color-surface-panel)]',
                      ].join(' ')}
                    >
                      {thumbnail ? (
                        <img src={thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icon size={22} aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]"
                        title={item.filename}
                      >
                        {item.filename}
                      </span>
                      <span className="block truncate text-xs text-[var(--sniptale-color-text-muted)]">
                        {[
                          !isImage && item.duration !== null ? formatDuration(item.duration) : null,
                          formatDimensions(item.width, item.height),
                          formatSize(item.size),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                  <div
                    className={[
                      'pointer-events-none absolute bottom-2 right-2 opacity-0',
                      'group-hover/library-card:pointer-events-auto group-hover/library-card:opacity-100',
                      'group-focus-within/library-card:pointer-events-auto group-focus-within/library-card:opacity-100',
                    ].join(' ')}
                  >
                    <LibraryMediaAdd itemId={item.id} compact onAddMedia={props.onAddMedia} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <MediaPreviewPane
        key={selected?.id ?? 'empty'}
        item={selected}
        onAddMedia={props.onAddMedia}
      />
    </div>
  );
}
