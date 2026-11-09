import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ArrowLeft, Search } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { InspectorFieldClear } from '../../../../ui/compact-inspector-controls/text-field';
import { translate } from '../../../../platform/i18n';
import { isTrustedDomEvent } from '../../../platform/trusted-events';
import { isBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';

export function FeedbackPanelSearch(props: {
  onClose: () => void;
  onQueryChange: (query: string) => void;
  query: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <>
      <ContentToolbarButton
        type="button"
        className="sniptale-feedback-icon-button"
        aria-label={translate('content.designReview.panelSearchClose')}
        title={translate('content.designReview.panelSearchClose')}
        onClick={props.onClose}
      >
        <ArrowLeft size={16} />
      </ContentToolbarButton>
      <label
        className="relative min-w-0 flex-1 cursor-text"
        onClickCapture={(event) => {
          // The shared clear emits synthetic input; its authorized click owns this transition.
          if (
            event.target instanceof Element &&
            event.target.closest('.sniptale-field-clear') &&
            (isTrustedDomEvent(event.nativeEvent) || isBridgedMouseEvent(event.nativeEvent))
          )
            props.onQueryChange('');
        }}
      >
        <Search className="absolute left-2 top-2 text-[var(--sniptale-color-text-dim)]" size={16} />
        <span className="sr-only">{translate('content.designReview.panelSearch')}</span>
        <input
          ref={input}
          className={[
            'sniptale-design-review-authored-text',
            'h-8 w-full rounded-[4px] border bg-transparent pl-8 pr-8 outline-none',
            'text-[13px] leading-[18px] font-normal',
            'border-[color:var(--sniptale-color-border-soft)]',
            'focus:border-[color:var(--sniptale-color-accent)]',
          ].join(' ')}
          placeholder={translate('content.designReview.panelSearch')}
          value={props.query}
          onChange={(event) => {
            if (!isTrustedDomEvent(event.nativeEvent)) {
              event.currentTarget.value = props.query;
              return;
            }
            props.onQueryChange(event.currentTarget.value);
          }}
        />
        {props.query ? (
          <InspectorFieldClear
            label={translate('content.designReview.panelSearch')}
            target={input}
          />
        ) : null}
      </label>
    </>
  );
}
