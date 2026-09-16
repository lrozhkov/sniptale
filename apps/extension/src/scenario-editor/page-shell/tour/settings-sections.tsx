import { useState, type ReactNode } from 'react';
import {
  CategorizedInspector,
  type CategorizedInspectorSection,
} from '@sniptale/ui/categorized-inspector';
import type { Translate } from '../../../platform/i18n';

type SettingsSection = CategorizedInspectorSection<string> & { content: ReactNode };

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
        showSectionHeading={false}
        renderSection={(id) => sections.find((section) => section.id === id)?.content}
      />
    );
  };
}
