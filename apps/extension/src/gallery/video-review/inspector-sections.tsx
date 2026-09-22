import { createContext, useContext, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { translate } from '../../platform/i18n';
import { ReviewDetails } from './controls';

/** Transient presentation belongs to the quick editor, never to the video document. */
export const ReviewInspectorPresentation = createContext<'all' | 'sections'>('all');

type ReviewSection = { id: string; label: string; icon: LucideIcon; content: ReactNode };

/** One section definition drives both the vertical navigation and the collapsible list. */
export function ReviewInspectorSections({ sections }: { sections: readonly ReviewSection[] }) {
  const presentation = useContext(ReviewInspectorPresentation);
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
            <ReviewDetails label={label} icon={icon} level="section" initiallyOpen>
              {content}
            </ReviewDetails>
          </section>
        ))
      )}
    </div>
  );
}
