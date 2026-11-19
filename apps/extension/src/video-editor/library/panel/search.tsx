import { SearchField } from '../../../ui/compact-inspector-controls/row-controls';
import { useInspectorLayout } from '../../../ui/compact-inspector-controls/layout';
import { translate } from '../../../platform/i18n';
import { ProjectSearchField } from '@sniptale/ui/searchable-project-picker/parts';

export function LibraryPanelSearch(props: {
  onQueryChange: (value: string) => void;
  query: string;
}) {
  const inspector = useInspectorLayout();
  const label = translate('videoEditor.sidebar.librarySearchPlaceholder');
  if (inspector)
    return (
      <SearchField
        label={label}
        placeholder={label}
        value={props.query}
        onChange={props.onQueryChange}
        disableTextAssistance
      />
    );
  return (
    <div className="[&_input:focus]:placeholder:text-transparent [&>label]:rounded-md">
      <label htmlFor="video-editor-library-search" className="sr-only">
        {label}
      </label>
      <ProjectSearchField
        onChange={props.onQueryChange}
        presentation="compact"
        searchId="video-editor-library-search"
        searchPlaceholder={label}
        value={props.query}
      />
    </div>
  );
}
