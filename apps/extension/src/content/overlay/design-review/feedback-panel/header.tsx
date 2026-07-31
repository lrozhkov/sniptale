import { MessageCircle, X } from 'lucide-react';
import type { PointerEventHandler } from 'react';
import { translate } from '../../../../platform/i18n';

export function FeedbackPanelHeader(props: {
  count: number;
  onClose: () => void;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
}) {
  return (
    <header
      className="flex touch-none cursor-grab items-center gap-2 px-4 py-3 active:cursor-grabbing"
      data-ui="content.design-review.feedback-panel-drag-handle"
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerUp}
    >
      <MessageCircle size={19} />
      <strong className="text-sm">{translate('content.designReview.panelTitle')}</strong>
      <span className="text-xs text-[var(--sniptale-color-text-dim)]">{props.count}</span>
      <button
        type="button"
        className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-[8px]"
        aria-label={translate('content.designReview.panelClose')}
        title={translate('content.designReview.panelClose')}
        onClick={props.onClose}
      >
        <X size={17} />
      </button>
    </header>
  );
}
