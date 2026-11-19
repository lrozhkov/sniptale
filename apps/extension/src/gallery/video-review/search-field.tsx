import { useRef } from 'react';
import { Search, X } from 'lucide-react';
import { translate } from '../../platform/i18n';

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
  const search = useRef<HTMLInputElement>(null);
  const clearLabel = translate('gallery.videoReview.historySearchClear');

  return (
    <div className="review-search-field">
      <Search size={14} aria-hidden="true" />
      <input
        ref={search}
        type="search"
        aria-label={label}
        placeholder={label}
        value={query}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {query ? (
        <button
          type="button"
          className="sniptale-field-clear"
          aria-label={clearLabel}
          title={clearLabel}
          onClick={() => {
            onChange('');
            search.current?.focus();
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
