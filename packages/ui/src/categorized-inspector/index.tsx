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
};

function getNextSectionIndex(key: string, current: number, count: number): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown' || key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (current - 1 + count) % count;
  return null;
}

export function CategorizedInspector<SectionId extends string>(props: {
  ariaLabel: string;
  dataUi?: string;
  initialSection: SectionId;
  renderSection: (section: SectionId) => ReactNode;
  sections: readonly CategorizedInspectorSection<SectionId>[];
}) {
  const [activeSection, setActiveSection] = useState<SectionId>(props.initialSection);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeExists = props.sections.some((section) => section.id === activeSection);
  const resolvedSection = activeExists ? activeSection : props.sections[0]?.id;

  useEffect(() => {
    if (!activeExists && props.sections[0]) setActiveSection(props.sections[0].id);
  }, [activeExists, props.sections]);

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

  return (
    <div className="grid min-h-48 grid-cols-[3rem_minmax(0,1fr)]" data-ui={props.dataUi}>
      <nav
        aria-label={props.ariaLabel}
        className="grid content-start gap-1 border-r border-[color:var(--sniptale-color-border-soft)] p-1.5"
      >
        {props.sections.map((section, index) => {
          const Icon = section.icon;
          const active = section.id === resolvedSection;
          return (
            <button
              aria-label={section.label}
              aria-pressed={active}
              className={[
                'inline-flex h-9 w-9 items-center justify-center rounded-[7px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
                active
                  ? 'bg-[var(--sniptale-color-accent-soft)] text-[var(--sniptale-color-accent)]'
                  : 'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-input)]',
              ].join(' ')}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              onKeyDown={(event) => handleNavigation(event, index)}
              ref={(element) => {
                buttonRefs.current[index] = element;
              }}
              title={section.label}
              type="button"
            >
              <Icon aria-hidden="true" size={17} />
            </button>
          );
        })}
      </nav>
      <div className="min-w-0 p-2.5">{props.renderSection(resolvedSection)}</div>
    </div>
  );
}
