import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { isTrustedDomEvent } from '../../../platform/trusted-events';
import { isBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';
import { useReviewSessionRuntime } from '../../../application/design-review-session/use-session';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { isDesignReviewFeedbackRecord } from '../records';
import type { FeedbackActionFilter } from './filter';
import { FeedbackPanelHeader } from './header';
import { useFeedbackPanelLifecycle } from './lifecycle';
import { FeedbackList } from './list';
import { SessionFeedbackActions } from './session-actions';
import { useFeedbackPanelPosition } from './position';
import { useFeedbackPanelResize } from './resize';
import { translate } from '../../../../platform/i18n';
import { useContentUiScale } from '../../../platform/dom-host';

const subscribeWithoutRuntime = () => () => undefined;
const getNoSession = () => null;

export function DesignReviewFeedbackPanel(props: {
  onClose: () => void;
  onOpenRecord: (annotationId: number) => boolean;
  open: boolean;
}) {
  const { onClose } = props;
  const panelRef = useRef<HTMLElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const filterRootRef = useRef<HTMLDivElement | null>(null);
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const runtime = useReviewSessionRuntime();
  const session = useSyncExternalStore(
    runtime?.subscribe ?? subscribeWithoutRuntime,
    runtime?.getSnapshot ?? getNoSession,
    getNoSession
  );
  const [confirmClear, setConfirmClear] = useState(false);
  const closePanel = useCallback(() => {
    runtime?.setPanelOpen(false);
    onClose();
  }, [runtime, onClose]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
    queueMicrotask(() => searchTriggerRef.current?.focus());
  }, []);
  const [filter, setFilter] = useState<FeedbackActionFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const uiScale = useContentUiScale();
  useSyncExternalStore(
    browserAnnotationSession.subscribe,
    () => browserAnnotationSession.getState().revision,
    () => 0
  );
  const currentRecords = browserAnnotationSession
    .getState()
    .domRecords.filter(isDesignReviewFeedbackRecord);
  const records = session?.active ? session.records.map((entry) => entry.record) : currentRecords;
  const drag = useFeedbackPanelPosition(
    panelRef,
    props.open,
    uiScale,
    runtime && session
      ? {
          position: session.position,
          setPosition: runtime.setPosition,
        }
      : undefined
  );
  const resize = useFeedbackPanelResize(panelRef, props.open, uiScale);
  const lifecycle = useFeedbackPanelLifecycle({
    searchOpen,
    onSearchClose: closeSearch,
    filterOpen,
    filterRootRef,
    filterTriggerRef,
    onClose: closePanel,
    onFilterOpenChange: setFilterOpen,
    open: props.open && !confirmClear,
  });

  if (!props.open) return null;

  return (
    <FeedbackPanelFrame
      panelRef={panelRef}
      position={drag.position}
      resize={resize}
      uiScale={uiScale}
    >
      <FeedbackPanelHeader
        count={records.length}
        onClose={lifecycle.closePanel}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        onLostPointerCapture={drag.onLostPointerCapture}
        searchOpen={searchOpen}
        searchTriggerRef={searchTriggerRef}
        onSearchOpen={() => {
          setFilterOpen(false);
          setSearchOpen(true);
        }}
        onSearchClose={closeSearch}
        onQueryChange={setQuery}
        query={query}
        filterProps={{
          filter,
          menuRef: filterMenuRef,
          open: filterOpen,
          rootRef: filterRootRef,
          triggerRef: filterTriggerRef,
          onChange: setFilter,
          onOpenChange: setFilterOpen,
        }}
      />
      <SessionFeedbackActions
        recordCount={records.length}
        runtime={runtime}
        session={session}
        confirmClear={confirmClear}
        onConfirmClearChange={setConfirmClear}
      >
        <FeedbackList
          filter={filter}
          onOpenRecord={props.onOpenRecord}
          query={query}
          records={records}
          {...(session?.active ? { entries: session.records } : {})}
          pending={session?.pending ?? false}
          {...(runtime
            ? {
                onOpenEntry: (id: string) => {
                  void runtime.openRecord(id).catch(() => undefined);
                },
                onDeleteEntry: (id: string) => {
                  void runtime.deleteRecord(id).catch(() => undefined);
                },
              }
            : {})}
        />
      </SessionFeedbackActions>
    </FeedbackPanelFrame>
  );
}

function FeedbackPanelFrame(props: {
  panelRef: RefObject<HTMLElement | null>;
  position: { x: number; y: number };
  resize: ReturnType<typeof useFeedbackPanelResize>;
  uiScale: number;
  children: ReactNode;
}) {
  const { resize, uiScale } = props;
  return (
    <aside
      ref={props.panelRef}
      className={[
        'sniptale-design-review-chrome sniptale-compact-workspace',
        'pointer-events-auto fixed z-[2147483646] flex flex-col overflow-visible',
        'rounded-[4px] border shadow-2xl',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)] text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      data-ui="content.design-review.feedback-panel"
      style={{
        left: props.position.x * uiScale,
        top: props.position.y * uiScale,
        width: 'min(360px, calc(var(--sniptale-content-ui-viewport-width) - 24px))',
        height: resize.resized ? resize.height : undefined,
        maxHeight: resize.resized ? resize.maxHeight : Math.min(420, resize.maxHeight),
      }}
      onClickCapture={(event) => {
        if (isTrustedDomEvent(event.nativeEvent) || isBridgedMouseEvent(event.nativeEvent)) return;
        event.preventDefault();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {props.children}
      <div
        role="separator"
        aria-label={translate('content.designReview.panelResize')}
        aria-orientation="horizontal"
        aria-valuemin={Math.round(Math.min(resize.minHeight, resize.ariaHeight))}
        aria-valuemax={Math.round(resize.maxHeight)}
        aria-valuenow={Math.round(resize.ariaHeight)}
        tabIndex={0}
        data-ui="content.design-review.feedback-resize"
        className={[
          'flex h-3 shrink-0 touch-none cursor-ns-resize items-center justify-center rounded-b-[4px]',
          'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--sniptale-color-accent)]',
        ].join(' ')}
        onPointerDown={resize.onPointerDown}
        onPointerMove={resize.onPointerMove}
        onPointerUp={resize.onPointerUp}
        onPointerCancel={resize.onPointerCancel}
        onLostPointerCapture={resize.onLostPointerCapture}
        onKeyDown={resize.onKeyDown}
      >
        <span className="h-0.5 w-8 rounded-[4px] bg-[var(--sniptale-color-border-soft)]" />
      </div>
    </aside>
  );
}
