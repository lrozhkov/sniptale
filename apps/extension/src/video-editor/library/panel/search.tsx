import { useRef } from 'react';
import { Search } from 'lucide-react';
import { InspectorFieldClear } from '../../../ui/compact-inspector-controls/text-field';
import { useInspectorLayout } from '../../../ui/compact-inspector-controls/layout';
import { translate } from '../../../platform/i18n';
import { ProjectSearchField } from '@sniptale/ui/searchable-project-picker/parts';

export function LibraryPanelSearch(props: {
  onQueryChange: (value: string) => void;
  query: string;
}) {
  const inspector = useInspectorLayout();
  const input = useRef<HTMLInputElement>(null);
  const label = translate('videoEditor.sidebar.librarySearchPlaceholder');
  if (inspector)
    return (
      <label
        htmlFor="video-editor-library-search"
        className="sniptale-text-value video-library-search"
      >
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          id="video-editor-library-search"
          type="search"
          aria-label={label}
          placeholder={label}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-autocomplete="none"
        />
        {props.query ? <InspectorFieldClear label={label} target={input} /> : null}
      </label>
    );
  return (
    <div className="[&_input:focus]:placeholder:text-transparent [&>label]:rounded-md">
      <label htmlFor="video-editor-library-search" className="sr-only">
        {translate('videoEditor.sidebar.librarySearchPlaceholder')}
      </label>
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
