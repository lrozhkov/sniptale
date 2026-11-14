import { INSPECTOR_CONTENT_INLINE_INSET_CLASS_NAME } from '../chrome';
import type { EditorIconAppearance } from './presentation';
import { useEffect, useState, type RefObject, type PointerEvent, type UIEvent } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type {
  EditorVectorCatalogEntry,
  EditorVectorLibraryTab,
} from '../../application/vector-elements/session';
import {
  EditorElementsGrid,
  editorVectorErrorMessage,
  editorVectorCollectionName,
} from './catalog';
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
  scrollRootRef,
  whole,
  appearance,
  error,
  onClearError,
  onAdd,
  onPointerDown,
  onOpenSettings,
  onScroll,
}: {
  resultsRef: RefObject<HTMLDivElement | null>;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  whole: boolean;
  appearance: EditorIconAppearance;
  error: boolean;
  onClearError(): void;
  onAdd(entry: EditorVectorCatalogEntry): Promise<void>;
  onPointerDown(event: PointerEvent<HTMLButtonElement>, entry: EditorVectorCatalogEntry): void;
  onOpenSettings?(): void;
  onScroll(event: UIEvent<HTMLDivElement>): void;
}) {
  const session = useEditorVectorLibrarySession(),
    state = useEditorVectorLibrarySnapshot();
  const [now, setNow] = useState(Date.now);
  const previewScope = JSON.stringify([
    state.settings?.baseUrl,
    state.settings?.incarnation,
    state.settings?.sourceGeneration,
    state.tab,
    state.query,
    state.collection,
    state.entries.slice(0, state.visibleCount).map((entry) => entry.key),
  ]);
  useEffect(() => {
    const root = scrollRootRef.current;
    const cards = Array.from(
      resultsRef.current?.querySelectorAll<HTMLButtonElement>('[data-ui="editor.elements.card"]') ??
        []
    );
    let active = true;
    const visible = new Set<Element>();
    const report = () =>
      session.setVisibleEntries(
        cards.flatMap((card) => {
          const key = card.dataset['entryKey'];
          return visible.has(card) && key ? [key] : [];
        })
      );
    const observer =
      root && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (changes) => {
              if (!active) return;
              for (const change of changes) {
                if (change.isIntersecting) visible.add(change.target);
                else visible.delete(change.target);
              }
              report();
            },
            { root, rootMargin: '72px 0px', threshold: 0 }
          )
        : null;
    if (observer) cards.forEach((card) => observer.observe(card));
    else {
      cards.slice(0, 8).forEach((card) => visible.add(card));
      report();
    }
    return () => {
      active = false;
      observer?.disconnect();
      session.setVisibleEntries([]);
    };
  }, [session, resultsRef, scrollRootRef, previewScope]);
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
          ? `min-h-16 flex-none overflow-visible ${INSPECTOR_CONTENT_INLINE_INSET_CLASS_NAME} pb-3`
          : `min-h-0 flex-1 overflow-y-auto ${INSPECTOR_CONTENT_INLINE_INSET_CLASS_NAME} pb-3 [scrollbar-width:thin]`
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
        appearance={appearance}
        onSelect={(entry) => session.select(entry.key)}
        onAdd={(entry) => void onAdd(entry)}
        collectionNames={
          new Map(
            state.entries.map((entry) => [entry.key, editorVectorCollectionName(entry, state)])
          )
        }
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
        <p className="p-2 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
          {message('networkDisabled')}
          {onOpenSettings ? (
            <button type="button" className="ml-1 underline" onClick={onOpenSettings}>
              {message('openIconSettings')}
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
