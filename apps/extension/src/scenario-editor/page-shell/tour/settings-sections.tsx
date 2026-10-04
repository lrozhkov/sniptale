import { InspectorDisclosurePreferences } from '../../../composition/inspector-disclosures/state';
import {
  getTourSlideObjects,
  type TourSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import type { TourSelection } from './selection';
import { useState, type ReactNode } from 'react';
import {
  CategorizedInspector,
  type CategorizedInspectorSection,
} from '@sniptale/ui/categorized-inspector';
import { InspectorCategorizedContent } from '../inspector';
import type { Translate } from '../../../platform/i18n';
import { Mic } from 'lucide-react';

type SettingsSection = CategorizedInspectorSection<string> & {
  content: ReactNode;
  /** Marks sections whose group heading duplicates the shared category heading. */
  categorized?: boolean;
  headingControl?: ReactNode;
};

/** Disposable category selection survives object drill-down and the All/Sections switch. */
export function useTourInspectorSections(
  presentation: 'all' | 'sections',
  t: Translate,
  narration?: ReactNode
) {
  const [active, setActive] = useState<Record<string, string>>({});
  return (context: string, sections: SettingsSection[]) => {
    if (narration)
      sections = [
        ...sections,
        {
          id: 'narration',
          icon: Mic,
          label: t('scenario.editor.tourNarration'),
          categorized: true,
          content: narration,
        },
      ];
    if (presentation === 'all')
      return sections.map(({ id, content }) => (
        <div key={id} className="guide-inspector-section">
          {content}
        </div>
      ));
    return (
      <CategorizedInspector
        dataUi="scenario-editor.inspector-categories"
        key={context}
        ariaLabel={t('scenario.editor.inspectorShowSections')}
        initialSection={active[context] ?? sections[0]!.id}
        onSectionChange={(id) => setActive((current) => ({ ...current, [context]: id }))}
        sections={sections}
        showSectionHeading
        renderSectionHeadingControl={(id) =>
          sections.find((section) => section.id === id)?.headingControl ?? null
        }
        renderSection={(id) => {
          const section = sections.find((entry) => entry.id === id);
          if (!section) return null;
          return (
            <InspectorCategorizedContent flatten={section.categorized === true}>
              {section.content}
            </InspectorCategorizedContent>
          );
        }}
      />
    );
  };
}

/** Selection families own disclosure choices, independently of object and project identity. */
export function TourInspectorPreferences(props: {
  scope: 'selection' | 'document';
  slide: TourSlide | null;
  selection: TourSelection | null;
  children: ReactNode;
}) {
  const objectId = props.selection?.kind === 'slide' ? props.selection.objectId : null;
  const objectKind =
    props.slide?.kind === 'image'
      ? getTourSlideObjects(props.slide).find((entry) => entry.object.id === objectId)?.type
      : objectId
        ? 'navigation-button'
        : undefined;
  const family =
    props.scope === 'document'
      ? 'document'
      : props.selection?.kind === 'end'
        ? 'end'
        : (objectKind ?? props.slide?.kind ?? props.selection?.kind ?? 'none');
  return (
    <InspectorDisclosurePreferences scope={`tour:${family}`}>
      {props.children}
    </InspectorDisclosurePreferences>
  );
}
