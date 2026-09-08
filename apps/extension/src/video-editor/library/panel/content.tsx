import { useState } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Film, Image } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { VideoEditorLibraryPanelBodyProps } from '../contracts/panel';
import { LibraryPanelSearch } from './search';
import { LibraryMediaSection } from './lists';
import type { LibraryThumbnailViewState } from './thumbnails/types';

type LibraryPanelContentProps = VideoEditorLibraryPanelBodyProps & {
  category: 'video' | 'image';
  presetId: string | null;
  onPresetChange: (id: string, category: 'video' | 'image') => void;
  onCategoryChange: (category: 'video' | 'image') => void;
  onQueryChange: (query: string) => void;
  query: string;
  thumbnails: Record<string, LibraryThumbnailViewState>;
};

export function LibraryPanelDrawerContent(props: LibraryPanelContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <main
        className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4"
        data-ui="video-editor.library.tab-body"
      >
        <nav
          className="w-44 shrink-0 space-y-1 overflow-y-auto"
          aria-label={translate('videoEditor.app.libraryTitle')}
        >
          {(['video', 'image'] as const).map((category) => (
            <LibraryCategory key={category} {...props} categoryKey={category} />
          ))}
        </nav>
        {props.error ? (
          <div>
            <p role="alert" className="text-sm">
              {props.error}
            </p>
            <ContentToolbarButton
              onClick={() => void props.onRefresh()}
              aria-label={translate('common.actions.retry')}
            >
              {translate('common.actions.retry')}
            </ContentToolbarButton>
          </div>
        ) : props.loading ? (
          <p role="status" className="text-sm text-[var(--sniptale-color-text-muted)]">
            {translate('common.states.loading')}
          </p>
        ) : (
          <LibraryMediaSection
            search={<LibraryPanelSearch query={props.query} onQueryChange={props.onQueryChange} />}
            items={props.items}
            thumbnails={props.thumbnails}
            onAddMedia={props.onAddMedia}
          />
        )}
      </main>
    </div>
  );
}

function libraryNavigationClass(active: boolean): string {
  return [
    'flex h-10 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-sm',
    'text-[var(--sniptale-color-text-primary)] hover:bg-[var(--sniptale-color-surface-panel)]',
    active ? 'bg-[var(--sniptale-color-surface-panel)] font-medium' : '',
  ].join(' ');
}

function LibraryCategory(props: LibraryPanelContentProps & { categoryKey: 'video' | 'image' }) {
  const [visibleCount, setVisibleCount] = useState(5);
  const category = props.categoryKey;
  const Icon = category === 'video' ? Film : Image;
  const views = props.savedViews.filter(
    (view) =>
      view.folderFilter === 'all' ||
      view.folderFilter === (category === 'video' ? 'recording' : 'screenshot')
  );
  const active = props.category === category;
  return (
    <div>
      <button
        type="button"
        aria-pressed={active && props.presetId === null}
        onClick={() => props.onCategoryChange(category)}
        className={libraryNavigationClass(active && props.presetId === null)}
      >
        <Icon size={16} aria-hidden />
        {translate(
          category === 'video'
            ? 'videoEditor.app.materialsVideo'
            : 'videoEditor.sidebar.libraryScreenshots'
        )}
      </button>
      <div className="space-y-0.5 pl-7" data-ui={`library-filters-${category}`}>
        {views.slice(0, visibleCount).map((view) => (
          <button
            key={view.id}
            type="button"
            title={view.name}
            aria-pressed={active && props.presetId === view.id}
            onClick={() => props.onPresetChange(view.id, category)}
            className={`${libraryNavigationClass(active && props.presetId === view.id)} !h-8 !px-2 !text-xs`}
          >
            <span className="truncate">{view.name}</span>
          </button>
        ))}
        {visibleCount < views.length && (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + 5)}
            className="h-8 w-full cursor-pointer px-2 text-left text-xs text-[var(--sniptale-color-accent-emphasis)]"
          >
            {translate('gallery.app.savedViewShowMore')}
          </button>
        )}
      </div>
    </div>
  );
}
