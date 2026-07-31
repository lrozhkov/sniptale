import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { translate } from '../../../../platform/i18n';
import { DesignReviewSettings } from '../settings/view';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { DesignReviewActionMenu } from './action-menu';
import { PageStyleCommentField } from './comment';
import { useDesignReviewPopoverDrag } from './drag';
import { DesignReviewElementBar } from './element-bar';
import {
  DESIGN_REVIEW_POPOVER_VIEWPORT_GAP,
  readDesignReviewPopoverTargetRect,
  resolveDesignReviewPopoverPosition,
  useDesignReviewPopoverMetrics,
} from './position';

function DeleteConfirmation(props: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      className={[
        'min-w-0 border-t p-3',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
      data-ui="content.design-review.delete-confirmation"
    >
      <div className="text-sm font-bold">
        {translate('content.designReview.deleteConfirmTitle')}
      </div>
      <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
        {translate('content.designReview.deleteConfirmBody')}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="h-9 rounded-[8px] border border-[color:var(--sniptale-color-border-soft)] text-xs font-semibold"
          onClick={props.onCancel}
        >
          {translate('content.designReview.cancel')}
        </button>
        <button
          type="button"
          className="h-9 rounded-[8px] bg-[var(--sniptale-color-danger)] text-xs font-semibold text-white"
          onClick={props.onConfirm}
        >
          {translate('content.designReview.delete')}
        </button>
      </div>
    </div>
  );
}

export function DesignReviewPopover(props: {
  actions: DesignReviewActions;
  open: boolean;
  state: DesignReviewViewState;
}) {
  const [deleteRequested, setDeleteRequested] = useState(false);
  const popoverRef = useRef<HTMLElement | null>(null);
  const previousSelectionRef = useRef<Element | null>(null);
  const selectionElement = props.state.selection?.element ?? null;
  const active = Boolean(props.open && props.state.anchor && props.state.selection);
  const metrics = useDesignReviewPopoverMetrics({
    active,
    elementRef: popoverRef,
    measurementKey: `${props.state.selection?.domPath ?? ''}:${props.state.settingsOpen}:${deleteRequested}`,
  });
  const basePosition = resolveDesignReviewPopoverPosition(
    props.state.anchor ?? {
      x: DESIGN_REVIEW_POPOVER_VIEWPORT_GAP,
      y: DESIGN_REVIEW_POPOVER_VIEWPORT_GAP,
    },
    readDesignReviewPopoverTargetRect(selectionElement),
    props.state.settingsOpen,
    metrics
  );
  const drag = useDesignReviewPopoverDrag({
    active,
    basePosition,
    geometryKey: metrics?.height ?? 0,
    popoverRef,
    resetKey: selectionElement,
  });

  useEffect(() => {
    if (!props.open) {
      setDeleteRequested(false);
      return;
    }
    if (previousSelectionRef.current !== selectionElement) {
      previousSelectionRef.current = selectionElement;
      setDeleteRequested(false);
    }
  }, [props.open, selectionElement]);

  if (!props.open || !props.state.anchor || !props.state.selection) {
    return null;
  }

  return (
    <aside
      ref={popoverRef}
      data-ui="content.design-review.popover"
      className={[
        'pointer-events-auto fixed z-[2147483646] max-h-[calc(100vh-24px)] cursor-default overflow-visible',
        'rounded-[12px] border shadow-2xl',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      style={{ left: drag.position.left, top: drag.position.top, width: basePosition.width }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onWheelCapture={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={[
          'pointer-events-auto absolute -right-3 -top-3 z-50 inline-flex h-8 w-8',
          'cursor-pointer items-center justify-center',
          'rounded-full border shadow-md',
          'border-[color:var(--sniptale-color-border-soft)]',
          'bg-[var(--sniptale-color-surface-panel)]',
        ].join(' ')}
        aria-label={translate('content.designReview.close')}
        title={translate('content.designReview.close')}
        onClick={props.actions.close}
      >
        <X size={16} />
      </button>
      <div
        className="grid grid-rows-[auto_minmax(0,1fr)] overflow-visible"
        data-ui="content.design-review.popover-layout"
        style={{ maxHeight: basePosition.maxHeight }}
      >
        <div className="relative z-20 p-3 pb-2 pt-4" data-ui="content.design-review.comment-layer">
          <div
            className="absolute inset-x-0 top-0 z-10 h-4 touch-none cursor-grab active:cursor-grabbing"
            data-ui="content.design-review.popover-drag-handle"
            title={translate('content.designReview.movePopover')}
            onPointerDown={drag.onPointerDown}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerUp}
            onPointerCancel={drag.onPointerUp}
          />
          <PageStyleCommentField
            actions={{ ...props.actions.comment, close: props.actions.close }}
            disabled={false}
            footer={
              <DesignReviewActionMenu
                action={props.state.action}
                onSelect={props.actions.selectAction}
              />
            }
            state={props.state.comment}
          />
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <DesignReviewElementBar
            onCopyElement={() => void props.actions.copyElement()}
            onCopyPath={() => void props.actions.copyPath()}
            onDeleteRequest={() => setDeleteRequested(true)}
            onSettingsOpenChange={props.actions.setSettingsOpen}
            selection={props.state.selection}
            settingsOpen={props.state.settingsOpen}
          />
          {deleteRequested ? (
            <DeleteConfirmation
              onCancel={() => setDeleteRequested(false)}
              onConfirm={props.actions.delete}
            />
          ) : null}
          {props.state.settingsOpen ? (
            <div
              className={[
                'max-h-[min(52vh,32rem)] overflow-y-auto border-t',
                'border-[color:var(--sniptale-color-border-soft)]',
              ].join(' ')}
            >
              <DesignReviewSettings actions={props.actions} disabled={false} state={props.state} />
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
