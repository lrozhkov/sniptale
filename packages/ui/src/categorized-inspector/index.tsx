import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export type CategorizedInspectorSection<SectionId extends string> = {
  icon: ComponentType<{ size?: number }>;
  id: SectionId;
  label: string;
  status?: string;
};

function getNextSectionIndex(key: string, current: number, count: number): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown' || key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (current - 1 + count) % count;
  return null;
}

function InspectorSectionHeading(props: { control?: ReactNode; label: string }) {
  return (
    <div
      className={[
        'mb-2 flex min-h-7 items-center justify-between gap-2',
        'text-[13px] font-semibold leading-5 text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      data-ui="shared.categorized-inspector.section-heading"
    >
      <span>{props.label}</span>
      {props.control}
    </div>
  );
}

function InspectorSectionNavigationItem<SectionId extends string>(props: {
  active: boolean;
  buttonRef: (element: HTMLButtonElement | null) => void;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  section: CategorizedInspectorSection<SectionId>;
}) {
  const Icon = props.section.icon;
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5">
      <button
        aria-label={props.section.label}
        aria-pressed={props.active}
        className={[
          'inline-flex h-9 w-9 items-center justify-center rounded-[7px]',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
          props.active
            ? 'bg-[var(--sniptale-color-accent-soft)] text-[var(--sniptale-color-accent)]'
            : 'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-input)]',
        ].join(' ')}
        onClick={props.onClick}
        onKeyDown={props.onKeyDown}
        ref={props.buttonRef}
        title={props.section.label}
        type="button"
      >
        <Icon aria-hidden="true" size={17} />
      </button>
      {props.section.status ? (
        <span
          className={[
            'max-w-11 rounded-full px-1 text-center text-[8px] font-bold leading-[10px]',
            'break-words whitespace-normal text-[var(--sniptale-color-warning)]',
          ].join(' ')}
          data-ui="shared.categorized-inspector.section-status"
          title={props.section.status}
        >
          {props.section.status}
        </span>
      ) : null}
    </div>
  );
}

function useRequestedInspectorSection<SectionId extends string>(
  initialSection: SectionId,
  request: { id: SectionId; token: number } | undefined,
  sections: readonly CategorizedInspectorSection<SectionId>[]
) {
  const [activeSection, setActiveSection] = useState<SectionId>(initialSection);
  const activeExists = sections.some((section) => section.id === activeSection);
  const requestedId = request?.id;
  const requestedToken = request?.token;

  useEffect(() => {
    if (requestedId !== undefined && requestedToken !== undefined) setActiveSection(requestedId);
  }, [requestedId, requestedToken]);

  useEffect(() => {
    if (!activeExists && sections[0]) setActiveSection(sections[0].id);
  }, [activeExists, sections]);

  return {
    activeSection: activeExists ? activeSection : sections[0]?.id,
    setActiveSection,
  };
}

export function CategorizedInspector<SectionId extends string>(props: {
  activeSectionRequest?: { id: SectionId; token: number };
  ariaLabel: string;
  dataUi?: string;
  initialSection: SectionId;
  renderSection: (section: SectionId) => ReactNode;
  renderSectionHeadingControl?: (section: SectionId) => ReactNode;
  sections: readonly CategorizedInspectorSection<SectionId>[];
  showSectionHeading?: boolean;
}) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { activeSection: resolvedSection, setActiveSection } = useRequestedInspectorSection(
    props.initialSection,
    props.activeSectionRequest,
    props.sections
  );

  const handleNavigation = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = getNextSectionIndex(event.key, index, props.sections.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const next = props.sections[nextIndex];
    if (!next) return;
    setActiveSection(next.id);
    buttonRefs.current[nextIndex]?.focus();
  };

  if (!resolvedSection) return null;
  const resolvedSectionDefinition = props.sections.find(
    (section) => section.id === resolvedSection
  );

  return (
    <div className="grid min-h-48 grid-cols-[3rem_minmax(0,1fr)]" data-ui={props.dataUi}>
      <nav
        aria-label={props.ariaLabel}
        className="grid content-start gap-1 border-r border-[color:var(--sniptale-color-border-soft)] p-1.5"
      >
        {props.sections.map((section, index) => (
          <InspectorSectionNavigationItem
            active={section.id === resolvedSection}
            buttonRef={(element) => {
              buttonRefs.current[index] = element;
            }}
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            onKeyDown={(event) => handleNavigation(event, index)}
            section={section}
          />
        ))}
      </nav>
      <div className="min-w-0 p-2.5">
        {props.showSectionHeading && resolvedSectionDefinition ? (
          <InspectorSectionHeading
            control={props.renderSectionHeadingControl?.(resolvedSection)}
            label={resolvedSectionDefinition.label}
          />
        ) : null}
        {props.renderSection(resolvedSection)}
      </div>
    </div>
  );
}
