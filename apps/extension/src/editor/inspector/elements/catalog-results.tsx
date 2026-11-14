import { useEffect, useState, type Ref, type PointerEvent, type UIEvent } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type {
  EditorVectorCatalogEntry,
  EditorVectorLibraryTab,
} from '../../application/vector-elements/session';
import { EditorElementsGrid, editorVectorErrorMessage } from './catalog';
import {
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
} from '../../application/vector-elements/context';
import { translate } from '../../../platform/i18n';

const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);

function ElementResultsError({
  code,
  retryAt,
  now,
  onRetry,
}: {
  code: string | null;
  retryAt: number | null;
  now: number;
  onRetry(): void;
}) {
  return (
    <div role="alert" className="space-y-2 p-2 text-xs text-[var(--sniptale-color-danger)]">
      <p>{editorVectorErrorMessage(code)}</p>
      <ProductActionButton
        tone="secondary"
        compact
        disabled={retryAt !== null && now < retryAt}
        onClick={onRetry}
      >
        {message('retry')}
      </ProductActionButton>
    </div>
  );
}

function ElementResultsPagination({
  count,
  visibleCount,
  hasMore,
  retryAt,
  now,
}: {
  count: number;
  visibleCount: number;
  hasMore: boolean;
  retryAt: number | null;
  now: number;
}) {
  const session = useEditorVectorLibrarySession();
  const hasHiddenEntries = count > visibleCount;
  if (!hasHiddenEntries && !hasMore) return null;
  return (
    <ProductActionButton
      tone="secondary"
      compact
      className="mt-2 w-full"
      disabled={count <= visibleCount && retryAt !== null && now < retryAt}
      onClick={() => {
        if (hasHiddenEntries) session.showMore();
        else void session.loadMore();
      }}
    >
      {message('more')}
    </ProductActionButton>
  );
}

function ElementResultsEmpty({
  count,
  error,
  status,
  tab,
  query,
}: {
  count: number;
  error: boolean;
  status: string;
  tab: EditorVectorLibraryTab;
  query: string;
}) {
  if (count || error || (status !== 'ready' && status !== 'idle')) return null;
  const label = tab === 'favorites' ? 'emptyFavorites' : query ? 'emptySearch' : 'emptyLocal';
  return (
    <p className="p-2 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
      {message(label)}
    </p>
  );
}
export function EditorElementsResults({
  resultsRef,
  whole,
  dark,
  error,
  onClearError,
  onAdd,
  onPointerDown,
  onManage,
  onScroll,
}: {
  resultsRef: Ref<HTMLDivElement>;
  whole: boolean;
  dark: boolean;
  error: boolean;
  onClearError(): void;
  onAdd(entry: EditorVectorCatalogEntry): Promise<void>;
  onPointerDown(event: PointerEvent<HTMLButtonElement>, entry: EditorVectorCatalogEntry): void;
  onManage(): void;
  onScroll(event: UIEvent<HTMLDivElement>): void;
}) {
  const session = useEditorVectorLibrarySession(),
    state = useEditorVectorLibrarySnapshot();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (state.retryAt === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, state.retryAt - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [state.retryAt]);
  return (
    <div
      ref={resultsRef}
      className={
        whole
          ? 'min-h-16 flex-none overflow-visible px-2 pb-2'
          : 'min-h-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]'
      }
      data-ui="editor.elements.results"
      onScroll={onScroll}
    >
      {error || state.error ? (
        <ElementResultsError
          code={state.errorCode}
          retryAt={state.retryAt}
          now={now}
          onRetry={() => {
            onClearError();
            void session.refresh();
          }}
        />
      ) : null}
      {state.status === 'loading' ? (
        <p role="status" className="p-2 text-xs">
          {message('loading')}
        </p>
      ) : null}
      <EditorElementsGrid
        entries={state.entries.slice(0, state.visibleCount)}
        selectedKey={state.selectedKey}
        dark={dark}
        onSelect={(entry) => session.select(entry.key)}
        onAdd={(entry) => void onAdd(entry)}
        onFavorite={(entry) => {
          void session.favorite(entry);
        }}
        onPointerDown={onPointerDown}
      />
      <ElementResultsPagination
        count={state.entries.length}
        visibleCount={state.visibleCount}
        hasMore={state.hasMore}
        retryAt={state.retryAt}
        now={now}
      />
      <ElementResultsEmpty
        count={state.entries.length}
        error={state.error}
        status={state.status}
        tab={state.tab}
        query={state.query}
      />
      {!state.settings?.networkEnabled ? (
        <button
          type="button"
          className="p-2 text-left text-xs leading-5 text-[var(--sniptale-color-text-secondary)] underline"
          onClick={() => onManage()}
        >
          {message('networkDisabled')}
        </button>
      ) : null}
    </div>
  );
}
