import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Search, X } from 'lucide-react';
import type { ComponentProps, PointerEventHandler, RefObject } from 'react';
import { FeedbackCollectionIcon } from '../icons';
import { translate } from '../../../../platform/i18n';
import { FeedbackPanelSearch } from './controls';
import { FeedbackFilter } from './filter';

export function FeedbackPanelHeader(props: {
  count: number;
  onClose: () => void;
  searchOpen: boolean;
  searchTriggerRef: RefObject<HTMLButtonElement | null>;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onQueryChange: (query: string) => void;
  query: string;
  filterProps: ComponentProps<typeof FeedbackFilter>;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
  onLostPointerCapture: PointerEventHandler<HTMLElement>;
}) {
  return (
    <header
      className={[
        'flex h-11 shrink-0 cursor-default items-center gap-1 px-2',
        'border-b border-solid border-[color:var(--sniptale-color-border-soft)]',
      ].join(' ')}
    >
      {props.searchOpen ? (
        <div
          className="flex min-w-0 flex-1 cursor-default items-center gap-1"
          data-ui="content.design-review.feedback-search-controls"
        >
          <FeedbackPanelSearch
            query={props.query}
            onQueryChange={props.onQueryChange}
            onClose={props.onSearchClose}
          />
        </div>
      ) : (
        <>
          <div
            className="flex min-w-0 flex-1 touch-none cursor-grab items-center active:cursor-grabbing"
            data-ui="content.design-review.feedback-panel-drag-handle"
            onPointerDown={props.onPointerDown}
            onPointerMove={props.onPointerMove}
            onPointerUp={props.onPointerUp}
            onPointerCancel={props.onPointerCancel}
            onLostPointerCapture={props.onLostPointerCapture}
          >
            <FeedbackCollectionIcon size={17} />
            <strong className="ml-1 text-[14px] leading-5 font-medium">
              {translate('content.designReview.panelTitle')}
            </strong>
            <span className="ml-1 text-xs tabular-nums text-[var(--sniptale-color-text-dim)]">
              {props.count}
            </span>
          </div>
          <div
            className="sniptale-feedback-header-actions flex shrink-0 cursor-default items-center gap-1"
            data-ui="content.design-review.feedback-header-actions"
          >
            <ContentToolbarButton
              ref={props.searchTriggerRef}
              type="button"
              className="sniptale-feedback-icon-button"
              aria-label={translate('content.designReview.panelSearch')}
              title={translate('content.designReview.panelSearch')}
              onClick={props.onSearchOpen}
            >
              <Search size={16} />
            </ContentToolbarButton>
            <FeedbackFilter {...props.filterProps} />
            <ContentToolbarButton
              tone="close"
              type="button"
              className="sniptale-dismiss-button sniptale-feedback-icon-button"
              aria-label={translate('content.designReview.panelClose')}
              title={translate('content.designReview.panelClose')}
              onClick={props.onClose}
            >
              <X size={16} />
            </ContentToolbarButton>
          </div>
        </>
      )}
    </header>
  );
}
