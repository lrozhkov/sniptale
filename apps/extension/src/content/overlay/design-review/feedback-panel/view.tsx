import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { isTrustedDomEvent } from '../../../platform/trusted-events';
import { isBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';
import { useReviewSessionRuntime } from '../../../application/design-review-session/use-session';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { isDesignReviewFeedbackRecord } from '../records';
import { FeedbackPanelControls } from './controls';
import type { FeedbackActionFilter } from './filter';
import { FeedbackPanelHeader } from './header';
import { useFeedbackPanelLifecycle } from './lifecycle';
import { FeedbackList } from './list';
import { SessionFeedbackActions } from './session-actions';
import { useFeedbackPanelPosition } from './position';
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
  const lifecycle = useFeedbackPanelLifecycle({
    filterOpen,
    filterRootRef,
    filterTriggerRef,
    onClose: closePanel,
    onFilterOpenChange: setFilterOpen,
    open: props.open && !confirmClear,
  });

  if (!props.open) return null;

  return (
    <aside
      ref={panelRef}
      className={[
        'sniptale-design-review-chrome sniptale-compact-workspace',
        'pointer-events-auto fixed z-[2147483646] flex flex-col overflow-visible',
        'rounded-[4px] border shadow-2xl',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      data-ui="content.design-review.feedback-panel"
      style={{
        left: drag.position.x * uiScale,
        top: drag.position.y * uiScale,
        width: 'min(408px, calc(var(--sniptale-content-ui-viewport-width) - 24px))',
        maxHeight: 'calc(var(--sniptale-content-ui-viewport-height) - 24px)',
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
      <FeedbackPanelHeader
        count={records.length}
        onClose={lifecycle.closePanel}
        {...(runtime && session?.active ? { onClear: () => setConfirmClear(true) } : {})}
        clearDisabled={records.length === 0 || (session?.pending ?? false)}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
      />
      <FeedbackPanelControls
        filter={filter}
        filterMenuRef={filterMenuRef}
        filterOpen={filterOpen}
        filterRootRef={filterRootRef}
        filterTriggerRef={filterTriggerRef}
        onFilterChange={setFilter}
        onFilterOpenChange={setFilterOpen}
        onQueryChange={setQuery}
        query={query}
      />
      <SessionFeedbackActions
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
    </aside>
  );
}
