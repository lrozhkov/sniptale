import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { NumericValueField } from '../../ui/compact-inspector-controls/numeric';
import './inspector.css';

const InspectorCategorizedContentContext = createContext(false);

/**
 * Marks inspector content that renders inside one shared category heading:
 * groups drop their own duplicate heading and actions move to the heading control.
 */
export function InspectorCategorizedContent({
  flatten = true,
  children,
}: {
  flatten?: boolean;
  children: ReactNode;
}) {
  const content = <div className="guide-inspector-categorized">{children}</div>;
  if (!flatten) return content;
  return (
    <InspectorCategorizedContentContext.Provider value={true}>
      {content}
    </InspectorCategorizedContentContext.Provider>
  );
}

/** Consistent section hierarchy for document, step and block properties. */
export function GuideInspectorGroup({
  title,
  icon: Icon,
  action,
  collapsible = true,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const categorized = useContext(InspectorCategorizedContentContext);
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();
  return (
    <section className="guide-inspector-group" aria-label={title}>
      {!categorized && (
        <div className="guide-inspector-group-heading">
          <h3>
            {collapsible ? (
              <button
                type="button"
                className="guide-inspector-disclosure"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={() => setExpanded((value) => !value)}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{title}</span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>
            ) : (
              <span className="guide-inspector-static-heading">
                <Icon size={15} aria-hidden="true" />
                {title}
              </span>
            )}
          </h3>
          {action}
        </div>
      )}
      <div
        id={bodyId}
        className="guide-inspector-group-body"
        hidden={collapsible && !categorized && !expanded}
      >
        {children}
      </div>
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
        focusAppearance="quiet"
        normalizeValue={Math.round}
        onPreviewValue={() => {}}
        onCommitValue={onChange}
      />
    </div>
  );
}
