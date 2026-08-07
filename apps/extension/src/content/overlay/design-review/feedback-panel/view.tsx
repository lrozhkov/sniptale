import { useRef, useState, useSyncExternalStore } from 'react';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { isDesignReviewFeedbackRecord } from '../records';
import { FeedbackPanelControls } from './controls';
import type { FeedbackActionFilter } from './filter';
import { FeedbackPanelHeader } from './header';
import { useFeedbackPanelLifecycle } from './lifecycle';
import { FeedbackList } from './list';
import { useFeedbackPanelPosition } from './position';
import { useContentUiScale } from '../../../platform/dom-host';

export function DesignReviewFeedbackPanel(props: {
  onClose: () => void;
  onOpenRecord: (annotationId: number) => boolean;
  open: boolean;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const filterRootRef = useRef<HTMLDivElement | null>(null);
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FeedbackActionFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const uiScale = useContentUiScale();
  useSyncExternalStore(
    browserAnnotationSession.subscribe,
    () => browserAnnotationSession.getState().revision,
    () => 0
  );
  const records = browserAnnotationSession
    .getState()
    .domRecords.filter(isDesignReviewFeedbackRecord);
  const drag = useFeedbackPanelPosition(panelRef, props.open, uiScale);
  const lifecycle = useFeedbackPanelLifecycle({
    filterOpen,
    filterRootRef,
    filterTriggerRef,
    onClose: props.onClose,
    onFilterOpenChange: setFilterOpen,
    open: props.open,
  });

  if (!props.open) return null;

  return (
    <aside
      ref={panelRef}
      className={[
        'pointer-events-auto fixed z-[2147483646] flex flex-col overflow-visible rounded-[14px] border shadow-2xl',
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
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <FeedbackPanelHeader
        count={records.length}
        onClose={lifecycle.closePanel}
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
      <FeedbackList
        filter={filter}
        onOpenRecord={props.onOpenRecord}
        query={query}
        records={records}
      />
    </aside>
  );
}
