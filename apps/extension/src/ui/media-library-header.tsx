import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Filter, X } from 'lucide-react';
import { ProductModalHeader } from '@sniptale/ui/product-modal';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { SearchField } from './compact-inspector-controls/row-controls';
import { translate } from '../platform/i18n';

/** Shared visual header; each picker retains its query, filtering, acquisition and modal lifecycle. */
export function MediaLibraryHeader(props: {
  title: string;
  dataUi: string;
  searchLabel: string;
  filterLabel: string;
  menuClassName?: string;
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
            <SearchField
              className="w-48"
              dataUi={`${props.dataUi}.search`}
              label={props.searchLabel}
              placeholder={props.searchLabel}
              value={props.query}
              onChange={props.onQueryChange}
              inputProps={{
                onCompositionStart: () => props.onComposingChange(true),
                onCompositionEnd: () => props.onComposingChange(false),
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  props.onApplyQuery();
                }
              }}
            />
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
                  borderRadius: 'var(--sniptale-media-header-radius, 6px)',
                }}
                controlSize="sm"
                value={props.viewId}
                onChange={props.onViewChange}
                {...(props.menuClassName ? { menuClassName: props.menuClassName } : {})}
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
