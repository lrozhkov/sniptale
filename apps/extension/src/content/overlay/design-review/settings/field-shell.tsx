import { RotateCcw } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { InspectorParameterRow } from '../../../../ui/compact-inspector-controls/layout';
import type { ReactNode } from 'react';
import { translate } from '../../../../platform/i18n';

export const PAGE_STYLE_CONTROL_CLASS_NAME =
  '!h-8 !rounded-[4px] !px-2 !text-[13px] !leading-[18px] !font-normal';
export const PAGE_STYLE_SELECT_CLASS_NAME = PAGE_STYLE_CONTROL_CLASS_NAME;

export function Field(props: {
  children: ReactNode;
  className?: string | undefined;
  defaultValue?: string | undefined;
  label: string;
  modified?: boolean | undefined;
  onReset?: (() => void) | undefined;
  stacked?: boolean | undefined;
}) {
  return (
    <div
      data-ui="content.design-review.field"
      data-field-label={props.label}
      className={['group/section-row', props.className].filter(Boolean).join(' ')}
    >
      <InspectorParameterRow
        label={props.label}
        labelModified={props.modified}
        labelAccessory={
          props.modified && props.onReset ? (
            <FieldResetButton label={props.label} onReset={props.onReset} />
          ) : undefined
        }
        valueMinimum={160}
        {...(props.stacked === undefined ? {} : { stacked: props.stacked })}
      >
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">{props.children}</div>
        </div>
      </InspectorParameterRow>
    </div>
  );
}

export function FieldResetButton(props: { label: string; onReset: () => void }) {
  return (
    <ContentToolbarButton
      tone="utility"
      type="button"
      aria-label={`${props.label}: ${translate('content.designReview.resetProperty')}`}
      title={translate('content.designReview.resetProperty')}
      className={[
        'inline-flex !h-6 !w-6 !p-0 shrink-0 items-center justify-center rounded-[4px] [&_svg]:!size-3',
        'text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      onClick={(event) => {
        event.preventDefault();
        props.onReset();
      }}
    >
      <RotateCcw size={12} />
    </ContentToolbarButton>
  );
}
