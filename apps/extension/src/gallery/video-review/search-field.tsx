import { translate } from '../../platform/i18n';
import { SearchField } from '../../ui/compact-inspector-controls/row-controls';

/** The filter owner supplies the query and keeps its collection state. */
export function ReviewSearchField({
  label,
  query,
  onChange,
}: {
  label: string;
  query: string;
  onChange(query: string): void;
}) {
  return (
    <SearchField
      label={label}
      clearLabel={translate('gallery.videoReview.historySearchClear')}
      placeholder={label}
      value={query}
      onChange={onChange}
    />
  );
}
