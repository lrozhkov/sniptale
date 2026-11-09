import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { BroomSparkles, Search, X } from 'lucide-react';
import type { ComponentProps, PointerEventHandler, RefObject } from 'react';
import { FeedbackCollectionIcon } from '../icons';
import { translate } from '../../../../platform/i18n';
import { FeedbackPanelSearch } from './controls';
import { FeedbackFilter } from './filter';

export function FeedbackPanelHeader(props: {
  count: number;
  onClose: () => void;
  onClear?: () => void;
  clearDisabled?: boolean;
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
        'flex h-11 shrink-0 touch-none cursor-grab items-center gap-1 px-2 active:cursor-grabbing',
        'border-b border-solid border-[color:var(--sniptale-color-border-soft)]',
      ].join(' ')}
      data-ui="content.design-review.feedback-panel-drag-handle"
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      onLostPointerCapture={props.onLostPointerCapture}
    >
      {props.searchOpen ? (
        <FeedbackPanelSearch
          query={props.query}
          onQueryChange={props.onQueryChange}
          onClose={props.onSearchClose}
        />
      ) : (
        <>
          <FeedbackCollectionIcon size={17} />
          <strong className="ml-1 text-[14px] leading-5 font-medium">
            {translate('content.designReview.panelTitle')}
          </strong>
          <span className="ml-1 text-xs tabular-nums text-[var(--sniptale-color-text-dim)]">
            {props.count}
          </span>
          <ContentToolbarButton
            ref={props.searchTriggerRef}
            type="button"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-[4px]"
            aria-label={translate('content.designReview.panelSearch')}
            title={translate('content.designReview.panelSearch')}
            onClick={props.onSearchOpen}
          >
            <Search size={16} />
          </ContentToolbarButton>
          <FeedbackFilter {...props.filterProps} />
          {props.onClear ? (
            <ContentToolbarButton
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[4px]"
              aria-label={translate('content.designReview.panelClearAll')}
              title={translate('content.designReview.panelClearAll')}
              onClick={props.onClear}
              disabled={props.clearDisabled}
            >
              <BroomSparkles size={16} />
            </ContentToolbarButton>
          ) : null}
          <ContentToolbarButton
            tone="close"
            type="button"
            className="sniptale-dismiss-button inline-flex h-8 w-8 items-center justify-center rounded-[4px]"
            aria-label={translate('content.designReview.panelClose')}
            title={translate('content.designReview.panelClose')}
            onClick={props.onClose}
          >
            <X size={16} />
          </ContentToolbarButton>
        </>
      )}
    </header>
  );
}
