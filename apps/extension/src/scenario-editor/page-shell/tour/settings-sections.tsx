import { useState, type ReactNode } from 'react';
import {
  CategorizedInspector,
  type CategorizedInspectorSection,
} from '@sniptale/ui/categorized-inspector';
import { InspectorCategorizedContent } from '../inspector';
import type { Translate } from '../../../platform/i18n';

type SettingsSection = CategorizedInspectorSection<string> & {
  content: ReactNode;
  /** Marks sections whose group heading duplicates the shared category heading. */
  categorized?: boolean;
  headingControl?: ReactNode;
};

/** Disposable category selection survives object drill-down and the All/Sections switch. */
export function useTourInspectorSections(presentation: 'all' | 'sections', t: Translate) {
  const [active, setActive] = useState<Record<string, string>>({});
  return (context: string, sections: SettingsSection[]) => {
    if (presentation === 'all')
      return sections.map(({ id, content }) => <div key={id}>{content}</div>);
    return (
      <CategorizedInspector
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
