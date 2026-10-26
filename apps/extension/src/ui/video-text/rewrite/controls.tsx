import type { ButtonHTMLAttributes } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { DraftNumericRow } from '../../compact-inspector-controls/numeric-preview';
import { InspectorDisclosureView } from '../../compact-inspector-controls/disclosure';
import type {
  CompactInspectorUnit,
  InspectorDisclosureProps,
} from '../../compact-inspector-controls/shared';
import { useInspectorDisclosure } from '../../../composition/inspector-disclosures/state';

/** Shared rewrite commands use the ordinary inspector command family. */
export function TextRewriteButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <ProductActionButton
      {...props}
      type="button"
      compact
      tone="secondary"
      title={label}
      aria-label={label}
      className={`!h-auto min-h-8! whitespace-normal text-left !text-xs ${className}`}
    >
      {children ?? label}
    </ProductActionButton>
  );
}

/** Rewrite details retain the existing inspector preference authority. */
export function TextRewriteDetails({
  variant = 'structural',
  ...props
}: InspectorDisclosureProps & { variant?: 'structural' | 'information' }) {
  const [open, setOpen] = useInspectorDisclosure(props.preferenceId, props.initiallyOpen ?? false);
  return (
    <InspectorDisclosureView
      {...props}
      open={open}
      onOpenChange={setOpen}
      dataUi="video.text-rewrite.disclosure"
      variant={variant}
      bodyClassName={
        variant === 'information'
          ? 'sniptale-information-body'
          : 'sniptale-parameter-stack px-2 pt-2'
      }
    />
  );
}

/** Rewrite interval gestures commit once and preserve the accepted value on cancellation. */
export function TextRewriteNumberRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision?: number;
  unit?: CompactInspectorUnit;
  disabled?: boolean;
  onChange(value: number): void;
}) {
  return <DraftNumericRow {...props} />;
}
