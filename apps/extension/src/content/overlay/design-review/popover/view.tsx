import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFloatingSurfaceWheelContainment } from '@sniptale/ui/floating-interactions/wheel';
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
import { useContentUiScale } from '../../../platform/dom-host';

function DeleteConfirmation(props: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      className={[
        'min-w-0 border-t border-solid p-3',
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

function useDesignReviewPopoverViewModel(props: { open: boolean; state: DesignReviewViewState }) {
  const [deleteRequested, setDeleteRequested] = useState(false);
  const popoverRef = useRef<HTMLElement | null>(null);
  const containedPopoverRef = useFloatingSurfaceWheelContainment(popoverRef);
  const previousSelectionRef = useRef<Element | null>(null);
  const selectionElement = props.state.selection?.element ?? null;
  const uiScale = useContentUiScale();
  const active = Boolean(props.open && props.state.anchor && props.state.selection);
  const metrics = useDesignReviewPopoverMetrics({
    active,
    elementRef: popoverRef,
    measurementKey: `${props.state.selection?.domPath ?? ''}:${props.state.settingsOpen}:${deleteRequested}`,
    uiScale,
  });
  const anchor = props.state.anchor
    ? { x: props.state.anchor.x / uiScale, y: props.state.anchor.y / uiScale }
    : null;
  const basePosition = resolveDesignReviewPopoverPosition(
    anchor ?? {
      x: DESIGN_REVIEW_POPOVER_VIEWPORT_GAP,
      y: DESIGN_REVIEW_POPOVER_VIEWPORT_GAP,
    },
    readDesignReviewPopoverTargetRect(selectionElement, uiScale),
    props.state.settingsOpen,
    metrics
  );
  const drag = useDesignReviewPopoverDrag({
    active,
    basePosition,
    geometryKey: metrics?.height ?? 0,
    popoverRef,
    resetKey: selectionElement,
    uiScale,
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

  return {
    basePosition,
    containedPopoverRef,
    deleteRequested,
    drag,
    setDeleteRequested,
    uiScale,
  };
}

export function DesignReviewPopover(props: {
  actions: DesignReviewActions;
  open: boolean;
  state: DesignReviewViewState;
}) {
  const view = useDesignReviewPopoverViewModel(props);

  if (!props.open || !props.state.anchor || !props.state.selection) {
    return null;
  }

  return (
    <aside
      ref={view.containedPopoverRef}
      data-ui="content.design-review.popover"
      className={[
        'pointer-events-auto fixed z-[2147483646] cursor-default overflow-visible',
        'rounded-[12px] border shadow-2xl',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      style={{
        left: view.drag.position.left * view.uiScale,
        top: view.drag.position.top * view.uiScale,
        width: view.basePosition.width,
        maxHeight: 'calc(var(--sniptale-content-ui-viewport-height) - 24px)',
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
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
        style={{ maxHeight: view.basePosition.maxHeight }}
      >
        <div className="relative z-20 p-3 pb-2 pt-4" data-ui="content.design-review.comment-layer">
          <div
            className="absolute inset-x-0 top-0 z-10 h-4 touch-none cursor-grab active:cursor-grabbing"
            data-ui="content.design-review.popover-drag-handle"
            title={translate('content.designReview.movePopover')}
            onPointerDown={view.drag.onPointerDown}
            onPointerMove={view.drag.onPointerMove}
            onPointerUp={view.drag.onPointerUp}
            onPointerCancel={view.drag.onPointerUp}
          />
          <PageStyleCommentField
            actions={{
              ...props.actions.comment,
              close: props.actions.close,
              voice: props.actions.voice,
            }}
            disabled={false}
            footer={
              <DesignReviewActionMenu
                action={props.state.action}
                onSelect={props.actions.selectAction}
              />
            }
            state={props.state.comment}
            voice={props.state.voice}
          />
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <DesignReviewElementBar
            onCopyElement={() => void props.actions.copyElement()}
            onCopyPath={() => void props.actions.copyPath()}
            onDeleteRequest={() => view.setDeleteRequested(true)}
            onSettingsOpenChange={props.actions.setSettingsOpen}
            selection={props.state.selection}
            settingsOpen={props.state.settingsOpen}
          />
          {view.deleteRequested ? (
            <DeleteConfirmation
              onCancel={() => view.setDeleteRequested(false)}
              onConfirm={props.actions.delete}
            />
          ) : null}
          {props.state.settingsOpen ? (
            <div
              className={[
                'overflow-y-auto border-t border-solid',
                'border-[color:var(--sniptale-color-border-soft)]',
              ].join(' ')}
              style={{
                maxHeight: 'min(calc(var(--sniptale-content-ui-viewport-height) * 0.52), 32rem)',
              }}
            >
              <DesignReviewSettings actions={props.actions} disabled={false} state={props.state} />
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
