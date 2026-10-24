import { useInspectorDisclosure } from '../../composition/inspector-disclosures/state';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
  type ComponentType,
} from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { NumericRow } from '../../ui/compact-inspector-controls/numeric';
import type {
  CompactInspectorNumericScrub,
  CompactInspectorUnit,
} from '../../ui/compact-inspector-controls/shared';
import '../../ui/compact-inspector-controls/disclosure.css';
import './inspector.css';

const InspectorCategorizedContentContext = createContext(false);
type InspectorHeading = { title: string; icon: ComponentType<{ size?: number }> };
const InspectorSectionHeadingContext = createContext<InspectorHeading | null>(null);

/** Section metadata supplies the same heading in grouped and categorized presentations. */
export function InspectorSectionHeading({
  children,
  ...heading
}: InspectorHeading & { children: ReactNode }) {
  return (
    <InspectorSectionHeadingContext.Provider value={heading}>
      {children}
    </InspectorSectionHeadingContext.Provider>
  );
}

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
  return (
    <InspectorCategorizedContentContext.Provider value={flatten}>
      {content}
    </InspectorCategorizedContentContext.Provider>
  );
}

/** Consistent section hierarchy for document, step and block properties. */
export function GuideInspectorGroup({
  title,
  id,
  icon: Icon,
  action,
  collapsible = true,
  level = 'section',
  children,
}: {
  title: string;
  id: string;
  icon: LucideIcon;
  action?: ReactNode;
  collapsible?: boolean;
  level?: 'section' | 'group';
  children: ReactNode;
}) {
  const categorized = useContext(InspectorCategorizedContentContext) && level !== 'group';
  const definition = useContext(InspectorSectionHeadingContext);
  const heading = level === 'section' ? definition : null;
  const HeadingIcon = heading?.icon ?? Icon;
  const headingTitle = heading?.title ?? title;
  const canCollapse = Boolean(heading) || collapsible;
  const Heading = level === 'group' ? 'h4' : 'h3';
  const [expanded, setExpanded] = useInspectorDisclosure(id, true);
  const bodyId = useId();
  return (
    <section className="guide-inspector-group" data-level={level} aria-label={headingTitle}>
      {!categorized && (
        <div className="guide-inspector-group-heading">
          <Heading>
            {canCollapse ? (
              <button
                type="button"
                className="guide-inspector-disclosure sniptale-disclosure-trigger"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={() => setExpanded(!expanded)}
              >
                <HeadingIcon size={level === 'group' ? 14 : 16} aria-hidden="true" />
                <span>{headingTitle}</span>
                <ChevronDown size={level === 'group' ? 14 : 16} aria-hidden="true" />
              </button>
            ) : (
              <span className="guide-inspector-static-heading">
                <HeadingIcon size={level === 'group' ? 14 : 16} aria-hidden="true" />
                <span>{headingTitle}</span>
              </span>
            )}
          </Heading>
          {action}
        </div>
      )}
      <div
        id={bodyId}
        className="guide-inspector-group-body sniptale-parameter-stack"
        data-compact-select-menu-bounds=""
        hidden={canCollapse && !categorized && !expanded}
      >
        <InspectorSectionHeadingContext.Provider value={null}>
          {children}
        </InspectorSectionHeadingContext.Provider>
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
  unit,
  scrub,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: CompactInspectorUnit;
  scrub?: CompactInspectorNumericScrub;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  useEffect(() => setPreview(null), [value, disabled]);
  return (
    <NumericRow
      appearance="plain"
      label={label}
      value={preview ?? value}
      min={min}
      max={max}
      step={step}
      unit={unit}
      scrub={scrub}
      precision={0}
      disabled={disabled}
      focusAppearance="accent-box"
      normalizeValue={Math.round}
      onPreviewValue={setPreview}
      onCommitValue={(next) => {
        setPreview(null);
        onChange(next);
      }}
    />
  );
}
