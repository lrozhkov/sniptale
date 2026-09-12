import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NumericValueField } from '../../ui/compact-inspector-controls/numeric';
import './inspector.css';

/** Consistent section hierarchy for document, step and block properties. */
export function GuideInspectorGroup({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="guide-inspector-group" aria-label={title}>
      <div className="guide-inspector-group-heading">
        <Icon size={15} aria-hidden="true" />
        <h3>{title}</h3>
        {action}
      </div>
      <div className="guide-inspector-group-body">{children}</div>
    </section>
  );
}

/** Numeric edits share the application's draft, keyboard and bounded commit behavior. */
export function GuideInspectorNumber({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="guide-inspector-number">
      <span>{label}</span>
      <NumericValueField
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        precision={0}
        disabled={disabled}
        normalizeValue={Math.round}
        onPreviewValue={() => {}}
        onCommitValue={onChange}
      />
    </div>
  );
}
