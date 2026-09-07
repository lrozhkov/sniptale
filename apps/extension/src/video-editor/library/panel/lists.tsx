import { useState } from 'react';
import { Film, Image } from 'lucide-react';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';
import { translate } from '../../../platform/i18n';
import { formatDuration, formatSize } from '../../chrome/display';
import { formatDimensions } from '../items/cards';
import type { LibraryThumbnailViewState } from './thumbnails/types';
import { MediaPreviewPane } from './media-preview';

export function LibraryMediaSection(props: {
  items: MediaLibraryItem[];
  thumbnails: Record<string, LibraryThumbnailViewState>;
  onAddMedia: (mediaId: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = props.items.find(({ id }) => id === selectedId) ?? props.items[0] ?? null;
  return (
    <div
      className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(240px,0.65fr)_minmax(0,1.35fr)] gap-4"
      data-ui="video-editor.library.media-tab"
    >
      <div className="min-h-0 space-y-2 overflow-y-auto pr-1" data-ui="recordings-scroll">
        {props.items.length === 0 ? (
          <p className="text-sm text-[var(--sniptale-color-text-muted)]">
            {translate('videoEditor.sidebar.libraryNoSearchResults')}
          </p>
        ) : (
          props.items.map((item) => {
            const isImage = item.kind === 'image' || item.kind === 'screenshot';
            const Icon = isImage ? Image : Film;
            const thumbnail = props.thumbnails[item.id]?.url;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                aria-pressed={selected?.id === item.id}
                className={[
                  'flex w-full items-center gap-3 rounded-lg border p-2 text-left',
                  'hover:bg-[var(--sniptale-color-surface-panel)]',
                  selected?.id === item.id
                    ? 'border-[var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-surface-panel)]'
                    : 'border-[var(--sniptale-color-border-soft)]',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md',
                    'bg-[var(--sniptale-color-surface-panel)]',
                  ].join(' ')}
                >
                  {thumbnail ? (
                    <img src={thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon size={22} aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
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
            );
          })
        )}
      </div>
      <MediaPreviewPane
        key={selected?.id ?? 'empty'}
        item={selected}
        onAddMedia={props.onAddMedia}
      />
    </div>
  );
}
