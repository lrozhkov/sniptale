import { translate } from '../../../platform/i18n';
import { ProjectSearchField } from '@sniptale/ui/searchable-project-picker/parts';

export function LibraryPanelSearch(props: {
  onQueryChange: (value: string) => void;
  query: string;
}) {
  return (
    <div>
      <ProjectSearchField
        onChange={props.onQueryChange}
        presentation="compact"
        searchId="video-editor-library-search"
        searchPlaceholder={translate('videoEditor.sidebar.librarySearchPlaceholder')}
        value={props.query}
      />
    </div>
  );
}
