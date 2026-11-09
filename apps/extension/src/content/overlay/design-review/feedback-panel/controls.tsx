import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ArrowLeft, Search } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { InspectorFieldClear } from '../../../../ui/compact-inspector-controls/text-field';
import { translate } from '../../../../platform/i18n';

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
      <label className="relative min-w-0 flex-1 cursor-text">
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
          onChange={(event) => props.onQueryChange(event.target.value)}
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
