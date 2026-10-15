import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { ProductModalHeader } from '@sniptale/ui/product-modal';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../platform/i18n';

/** Shared visual header; each picker retains its query, filtering, acquisition and modal lifecycle. */
export function MediaLibraryHeader(props: {
  title: string;
  dataUi: string;
  searchLabel: string;
  filterLabel: string;
  query: string;
  onQueryChange(value: string): void;
  onApplyQuery(): void;
  onComposingChange(value: boolean): void;
  viewId: string;
  onViewChange(value: string): void;
  options: { value: string; label: string; group?: string }[];
  onClose(): void;
  children?: ReactNode;
}) {
  const selected = props.options.find((option) => option.value === props.viewId);
  return (
    <div className="shrink-0 [&>.sniptale-modal-header]:flex-wrap [&>.sniptale-modal-header]:gap-3">
      <ProductModalHeader
        title={props.title}
        actions={
          <div
            className="flex min-w-0 flex-wrap items-center justify-end gap-3"
            data-ui={`${props.dataUi}.controls`}
          >
            <div
              className="flex h-8 w-48 shrink-0 items-center gap-1.5 rounded-[6px] border
                border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)] px-2
                transition-[width] duration-200 focus-within:w-60 motion-reduce:transition-none"
              data-ui={`${props.dataUi}.search`}
            >
              <Search
                size={16}
                className="shrink-0 text-[var(--sniptale-color-text-muted)]"
                aria-hidden="true"
              />
              <input
                type="search"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none
                  placeholder:text-[var(--sniptale-color-text-muted)] focus:placeholder:text-transparent"
                aria-label={props.searchLabel}
                placeholder={props.searchLabel}
                value={props.query}
                onChange={(event) => props.onQueryChange(event.target.value)}
                onCompositionStart={() => props.onComposingChange(true)}
                onCompositionEnd={() => props.onComposingChange(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    props.onApplyQuery();
                  }
                }}
              />
            </div>
            <div className="flex min-w-0 shrink-0 items-center gap-1">
              <Filter
                size={16}
                className="text-[var(--sniptale-color-text-muted)]"
                aria-hidden="true"
              />
              <ProductSelect
                dataUi={`${props.dataUi}.filter`}
                aria-label={props.filterLabel}
                title={selected?.group ? `${selected.group}: ${selected.label}` : selected?.label}
                containerClassName="!w-48 shrink-0"
                style={{
                  minHeight: 32,
                  height: 32,
                  paddingTop: 4,
                  paddingBottom: 4,
                  borderRadius: 6,
                }}
                controlSize="sm"
                value={props.viewId}
                onChange={props.onViewChange}
                menuWidth={280}
                options={props.options}
              />
            </div>
            {props.children}
            <ContentToolbarButton
              tone="utility"
              className="!border-0 !bg-transparent shrink-0"
              onClick={props.onClose}
              aria-label={translate('common.actions.close')}
              title={translate('common.actions.close')}
            >
              <X size={16} aria-hidden="true" />
            </ContentToolbarButton>
          </div>
        }
      />
    </div>
  );
}

/** Header typing is disposable; applied filters remain with the owning listing. */
function useMediaLibraryQuery(onQuery: (value: string) => void) {
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => onQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query, onQuery, composing]);
  return { query, setQuery, setComposing };
}

/** Transient input lifecycle; callers own applied filters and available options. */
export function DebouncedMediaLibraryHeader(
  props: Omit<
    ComponentProps<typeof MediaLibraryHeader>,
    'query' | 'onQueryChange' | 'onApplyQuery' | 'onComposingChange'
  > & { onQuery(value: string): void }
) {
  const { onQuery, ...visual } = props;
  const { query, setQuery, setComposing } = useMediaLibraryQuery(onQuery);
  return (
    <MediaLibraryHeader
      {...visual}
      query={query}
      onQueryChange={setQuery}
      onApplyQuery={() => onQuery(query)}
      onComposingChange={setComposing}
    />
  );
}
