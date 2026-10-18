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
        valueMinimum={160}
        {...(props.stacked === undefined ? {} : { stacked: props.stacked })}
      >
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">{props.children}</div>
          {props.modified && props.onReset ? (
            <FieldResetButton
              disabled={false}
              label={props.label}
              modified
              onReset={props.onReset}
            />
          ) : null}
        </div>
      </InspectorParameterRow>
    </div>
  );
}

function FieldResetButton(props: {
  disabled: boolean;
  label: string;
  modified: boolean;
  onReset: () => void;
}) {
  if (!props.modified) {
    return <span className="h-8 w-8 shrink-0" aria-hidden="true" />;
  }

  return (
    <ContentToolbarButton
      tone="utility"
      type="button"
      disabled={props.disabled}
      aria-label={`${props.label}: ${translate('content.designReview.resetProperty')}`}
      title={translate('content.designReview.resetProperty')}
      className={[
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px]',
        'text-[var(--sniptale-color-text-secondary)] opacity-0 transition-opacity',
        'hover:text-[var(--sniptale-color-text-primary)] group-hover/section-row:opacity-100 focus:opacity-100',
        'disabled:opacity-30',
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
