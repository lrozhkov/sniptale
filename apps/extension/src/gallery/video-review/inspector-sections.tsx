import { InspectorDisclosurePreferences } from '../../composition/inspector-disclosures/state';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Ellipsis, Info, type LucideIcon } from 'lucide-react';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { translate } from '../../platform/i18n';
import { ReviewDetails } from './controls';

const PresentationContext = createContext<{
  value: 'all' | 'sections';
  remembered?: string | undefined;
  remember?: ((id: string) => void) | undefined;
}>({ value: 'all' });

/** Presentation stays outside the video document; disclosure choices survive editor sessions. */
export function ReviewInspectorPresentation(props: {
  value: 'all' | 'sections';
  section?:
    | 'scene'
    | 'selected'
    | 'comments'
    | 'export'
    | 'history'
    | 'preview'
    | 'speech'
    | 'text';
  selectionScope?: string | undefined;
  children: ReactNode;
}) {
  const family =
    props.section === 'selected'
      ? (props.selectionScope ?? 'selection')
      : (props.section ?? 'selection');
  const [choices, setChoices] = useState<Readonly<Record<string, string>>>({});
  return (
    <InspectorDisclosurePreferences scope={`gallery:${family}`}>
      <PresentationContext
        value={{
          value: props.value,
          remembered: choices[family],
          remember: (id) => setChoices((current) => ({ ...current, [family]: id })),
        }}
      >
        {props.children}
      </PresentationContext>
    </InspectorDisclosurePreferences>
  );
}

/** One parameter group supplied to the selected-object inspector. */
export type ReviewInspectorSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  content: ReactNode;
};

/** Selected-object commands share metadata and local geometry in either presentation mode. */
export function reviewInspectorActions(content: ReactNode): ReviewInspectorSection {
  return {
    id: 'actions',
    label: translate('gallery.videoReview.actionActions'),
    icon: Ellipsis,
    content: <div className="review-inspector-actions">{content}</div>,
  };
}

/** One section definition drives both the vertical navigation and the collapsible list. */
export function ReviewInspectorSections({
  sections,
}: {
  sections: readonly ReviewInspectorSection[];
}) {
  const context = useContext(PresentationContext);
  const presentation = context.value;
  const [local, setLocal] = useState<string>();
  const remembered = context.remembered ?? local;
  const remember = context.remember ?? setLocal;
  const initial = sections.find((section) => section.id === remembered)?.id ?? sections[0]?.id;
  if (!initial) return null;
  return (
    <div data-ui="gallery.videoReview.inspectorSections" data-presentation={presentation}>
      {presentation === 'sections' && sections.length > 1 ? (
        <CategorizedInspector
          dataUi="gallery.videoReview.inspectorCategories"
          ariaLabel={translate('scenario.editor.inspectorShowSections')}
          initialSection={initial}
          sections={sections}
          onSectionChange={remember}
          showSectionHeading
          renderSection={(id) => (
            <div key={id} className="review-inspector-section-body" data-section={id}>
              {sections.find((section) => section.id === id)?.content}
            </div>
          )}
        />
      ) : (
        [
          sections.slice(0, Math.ceil(sections.length / 2)),
          sections.slice(Math.ceil(sections.length / 2)),
        ]
          .filter((column) => column.length > 0)
          .map((column, index) => (
            <div className="review-inspector-section-column" key={index}>
              {column.map(({ id, label, icon, content }) => (
                <section key={id} data-section={id} className="review-inspector-section">
                  <ReviewDetails
                    preferenceId={`section:${id}`}
                    label={label}
                    icon={icon}
                    level="section"
                    initiallyOpen
                  >
                    {content}
                  </ReviewDetails>
                </section>
              ))}
            </div>
          ))
      )}
    </div>
  );
}

/** Each child stays one semantic unit as available inspector space changes. */
export function ReviewInspectorColumns({ children }: { children: ReactNode }) {
  return <div className="review-inspector-columns">{children}</div>;
}

export function reviewInformationSections(content: ReactNode): ReviewInspectorSection[] {
  return content
    ? [
        {
          id: 'information',
          label: translate('gallery.videoReview.actionInformation'),
          icon: Info,
          content,
        },
      ]
    : [];
}
