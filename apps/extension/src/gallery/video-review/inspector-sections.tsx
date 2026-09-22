import { InspectorDisclosurePreferences } from '../../composition/inspector-disclosures/state';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { translate } from '../../platform/i18n';
import { ReviewDetails } from './controls';

const PresentationContext = createContext<'all' | 'sections'>('all');

/** Presentation stays outside the video document; disclosure choices survive editor sessions. */
export function ReviewInspectorPresentation(props: {
  value: 'all' | 'sections';
  section?: 'scene' | 'selected' | 'comments';
  selectionScope?: string | undefined;
  children: ReactNode;
}) {
  const family =
    props.section === 'selected'
      ? (props.selectionScope ?? 'selection')
      : (props.section ?? 'selection');
  return (
    <InspectorDisclosurePreferences scope={`gallery:${family}`}>
      <PresentationContext value={props.value}>{props.children}</PresentationContext>
    </InspectorDisclosurePreferences>
  );
}

type ReviewSection = { id: string; label: string; icon: LucideIcon; content: ReactNode };

/** One section definition drives both the vertical navigation and the collapsible list. */
export function ReviewInspectorSections({ sections }: { sections: readonly ReviewSection[] }) {
  const presentation = useContext(PresentationContext);
  const [remembered, remember] = useState<string>();
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
        sections.map(({ id, label, icon, content }) => (
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
        ))
      )}
    </div>
  );
}
