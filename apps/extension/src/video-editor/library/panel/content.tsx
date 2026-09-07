import { Film, Image, ListFilter, RefreshCw, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import type { VideoEditorLibraryPanelBodyProps } from '../contracts/panel';
import { LibraryPanelSearch } from './search';
import { LibraryMediaSection } from './lists';
import type { LibraryThumbnailViewState } from './thumbnails/types';

type LibraryPanelContentProps = VideoEditorLibraryPanelBodyProps & {
  category: 'video' | 'image';
  presetId: string | null;
  onPresetChange: (id: string) => void;
  onCategoryChange: (category: 'video' | 'image') => void;
  onQueryChange: (query: string) => void;
  query: string;
  thumbnails: Record<string, LibraryThumbnailViewState>;
};

export function LibraryPanelDrawerContent(props: LibraryPanelContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        className={[
          'flex shrink-0 items-center gap-3 border-b px-4 py-2',
          'border-[color:var(--sniptale-color-border-soft)]',
        ].join(' ')}
      >
        <div className="min-w-0 max-w-lg flex-1">
          <LibraryPanelSearch query={props.query} onQueryChange={props.onQueryChange} />
        </div>
        <ContentToolbarButton
          className="ml-auto"
          onClick={() => void props.onRefresh()}
          disabled={props.loading}
          title={translate('videoEditor.sidebar.libraryRefresh')}
          aria-label={translate('videoEditor.sidebar.libraryRefresh')}
        >
          <RefreshCw size={16} aria-hidden />
        </ContentToolbarButton>
        <ContentToolbarButton
          onClick={props.onClose}
          title={translate('common.actions.close')}
          aria-label={translate('common.actions.close')}
        >
          <X size={16} aria-hidden />
        </ContentToolbarButton>
      </header>
      <main
        className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4"
        data-ui="video-editor.library.tab-body"
      >
        <nav
          className="w-44 shrink-0 space-y-1 overflow-y-auto"
          aria-label={translate('videoEditor.app.libraryTitle')}
        >
          {(['video', 'image'] as const).map((category) => {
            const Icon = category === 'video' ? Film : Image;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={props.category === category && props.presetId === null}
                onClick={() => props.onCategoryChange(category)}
                className={libraryNavigationClass(
                  props.category === category && props.presetId === null
                )}
              >
                <Icon size={16} aria-hidden />
                {translate(
                  category === 'video'
                    ? 'videoEditor.app.materialsVideo'
                    : 'videoEditor.sidebar.libraryScreenshots'
                )}
              </button>
            );
          })}
          {props.savedViews.length > 0 && (
            <div className="mt-4 border-t border-[color:var(--sniptale-color-border-soft)] pt-3">
              <p className="px-3 pb-2 text-xs text-[var(--sniptale-color-text-muted)]">
                {translate('videoEditor.sidebar.librarySavedFilters')}
              </p>
              {props.savedViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  title={view.name}
                  aria-pressed={props.presetId === view.id}
                  onClick={() => props.onPresetChange(view.id)}
                  className={libraryNavigationClass(props.presetId === view.id)}
                >
                  <ListFilter size={16} className="shrink-0" aria-hidden />
                  <span className="truncate">{view.name}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
        {props.error ? (
          <p role="alert" className="text-sm">
            {props.error}
          </p>
        ) : props.loading ? (
          <p role="status" className="text-sm text-[var(--sniptale-color-text-muted)]">
            {translate('common.states.loading')}
          </p>
        ) : (
          <LibraryMediaSection
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
    'flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm',
    'text-[var(--sniptale-color-text-primary)] hover:bg-[var(--sniptale-color-surface-panel)]',
    active ? 'bg-[var(--sniptale-color-surface-panel)] font-medium' : '',
  ].join(' ');
}
