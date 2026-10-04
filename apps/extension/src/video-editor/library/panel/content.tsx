import { LibraryNavigation } from '../../../composition/library-preview/navigation';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import type { VideoEditorLibraryPanelBodyProps } from '../contracts/panel';
import { LibraryPanelSearch } from './search';
import { LibraryMediaSection } from './lists';
import type { LibraryThumbnailViewState } from './thumbnails/types';

type LibraryPanelContentProps = VideoEditorLibraryPanelBodyProps & {
  category: 'all' | 'video' | 'image' | 'audio';
  presetId: string | null;
  onPresetChange: (id: string, category: 'all' | 'video' | 'image' | 'audio') => void;
  onCategoryChange: (category: 'all' | 'video' | 'image' | 'audio') => void;
  onQueryChange: (query: string) => void;
  query: string;
  thumbnails: Record<string, LibraryThumbnailViewState>;
};

export function LibraryPanelDrawerContent(props: LibraryPanelContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <main
        className="flex min-h-0 flex-1 overflow-hidden p-3"
        data-ui="video-editor.library.tab-body"
      >
        <LibraryMediaSection
          navigation={
            <LibraryNavigation
              includeAudio
              category={props.category}
              presetId={props.presetId}
              savedViews={props.savedViews}
              onCategoryChange={props.onCategoryChange}
              onPresetChange={props.onPresetChange}
            />
          }
          search={<LibraryPanelSearch query={props.query} onQueryChange={props.onQueryChange} />}
          status={
            props.error ? (
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
            ) : undefined
          }
          items={props.error || props.loading ? [] : props.items}
          thumbnails={props.thumbnails}
          onAddMedia={props.onAddMedia}
        />
      </main>
    </div>
  );
}
