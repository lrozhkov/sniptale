import { LibraryNavigation } from '../../../composition/library-preview/navigation';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import type { VideoEditorLibraryPanelBodyProps } from '../contracts/panel';
import { LibraryPanelSearch } from './search';
import { LibraryMediaSection } from './lists';
import type { LibraryThumbnailViewState } from './thumbnails/types';

type LibraryPanelContentProps = VideoEditorLibraryPanelBodyProps & {
  category: 'all' | 'video' | 'image';
  presetId: string | null;
  onPresetChange: (id: string, category: 'all' | 'video' | 'image') => void;
  onCategoryChange: (category: 'all' | 'video' | 'image') => void;
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
        <div className="w-44 shrink-0 min-h-0 overflow-auto">
          <LibraryNavigation
            category={props.category}
            presetId={props.presetId}
            savedViews={props.savedViews}
            onCategoryChange={props.onCategoryChange}
            onPresetChange={props.onPresetChange}
          />
        </div>
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
