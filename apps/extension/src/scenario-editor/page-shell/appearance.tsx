import { GuideTemplateControls } from './template-controls';
import type { GuideTemplateApplication } from '../../composition/persistence/scenario/store/public';
import type {
  GuideProject,
  GuideStyleOverrides,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { useState } from 'react';
import { RotateCcw, LayoutTemplate, ListOrdered, Palette } from 'lucide-react';
import { resolveGuideStyle, applyGuideLayout } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { GuideNumberingControls } from './numbering-controls';
import { InspectorCategorizedContent } from './inspector';
import { GuideStyleFields, GuideLayoutFields } from './style-controls';

type AppearanceProps = {
  presentation?: 'all' | 'sections';
  project: GuideProject;
  selectedId: string | null;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  onSaveTemplate?: (stepId: string, name: string) => Promise<boolean>;
  onApplyTemplate?: (
    stepId: string,
    templateId: string,
    mode: GuideTemplateApplication
  ) => Promise<boolean>;
  t: Translate;
};

/** Only the selected item's settings live here; defaults live in the document context. */
export function GuideAppearance({
  project,
  presentation = 'all',
  selectedId,
  disabled,
  onChange,
  onSaveTemplate,
  onApplyTemplate,
  t,
}: AppearanceProps) {
  const [activeSection, setActiveSection] = useState('layout');
  const item = project.items.find((entry) => entry.id === selectedId);
  const change = (next: GuideProject['items'][number], group: string | null = null) =>
    onChange(
      { ...project, items: project.items.map((entry) => (entry.id === next.id ? next : entry)) },
      group
    );
  if (!item) return null;
  const customize = (patch: GuideStyleOverrides) => {
    if (item.kind === 'step')
      change({ ...item, styleOverrides: { ...item.styleOverrides, ...patch } });
  };
  const sections = [
    { id: 'layout', label: t('scenario.editor.appearanceLayout'), icon: LayoutTemplate },
    { id: 'numbering', label: t('scenario.editor.inspectorNumbering'), icon: ListOrdered },
    { id: 'appearance', label: t('scenario.editor.appearance'), icon: Palette },
  ];
  const renderSection = (section: string) => (
    <>
      {item.kind === 'step' && section === 'layout' && (
        <InspectorCategorizedContent flatten={presentation === 'sections'}>
          <GuideLayoutFields
            layout={item.layout}
            disabled={disabled}
            t={t}
            onChange={(layout) => change(applyGuideLayout(item, layout))}
          />
          {item.blocks.length > 0 && (
            <p className="guide-inspector-hint">{t('scenario.editor.appearanceLayoutHelp')}</p>
          )}
          {onSaveTemplate && onApplyTemplate && (
            <GuideTemplateControls
              key={item.id}
              step={item}
              disabled={disabled}
              t={t}
              onSave={(name) => onSaveTemplate(item.id, name)}
              onApply={(templateId, mode) => onApplyTemplate(item.id, templateId, mode)}
            />
          )}
        </InspectorCategorizedContent>
      )}
      {section === 'numbering' &&
        (item.kind === 'step' ? (
          <InspectorCategorizedContent flatten={presentation === 'sections'}>
            <GuideNumberingControls
              project={project}
              item={item}
              disabled={disabled}
              t={t}
              onChange={change}
            />
          </InspectorCategorizedContent>
        ) : (
          <GuideNumberingControls
            project={project}
            item={item}
            disabled={disabled}
            t={t}
            onChange={change}
          />
        ))}
      {item.kind === 'step' && section === 'appearance' && (
        <>
          {presentation !== 'sections' && (
            <div className="guide-appearance-heading">
              <h3>{t('scenario.editor.appearance')}</h3>
              <ContentToolbarButton
                title={t('scenario.editor.appearanceReset')}
                disabled={disabled || Object.keys(item.styleOverrides).length === 0}
                onClick={() => change({ ...item, styleOverrides: {} })}
              >
                <RotateCcw size={15} aria-hidden="true" />
              </ContentToolbarButton>
            </div>
          )}
          <GuideStyleFields
            style={resolveGuideStyle(project.style, item.styleOverrides)}
            disabled={disabled}
            t={t}
            onChange={customize}
          />
        </>
      )}
    </>
  );
  const resetControl =
    item.kind === 'step' ? (
      <ContentToolbarButton
        title={t('scenario.editor.appearanceReset')}
        disabled={disabled || Object.keys(item.styleOverrides).length === 0}
        onClick={() => change({ ...item, styleOverrides: {} })}
      >
        <RotateCcw size={15} aria-hidden="true" />
      </ContentToolbarButton>
    ) : null;
  return (
    <div className="guide-appearance">
      {item.kind !== 'step' ? (
        renderSection('numbering')
      ) : presentation === 'all' ? (
        sections.map(({ id }) => <div key={id}>{renderSection(id)}</div>)
      ) : (
        <CategorizedInspector
          ariaLabel={t('scenario.editor.guideStepSettings')}
          initialSection={activeSection}
          onSectionChange={setActiveSection}
          sections={sections}
          showSectionHeading
          renderSectionHeadingControl={(section) =>
            section === 'appearance' ? resetControl : null
          }
          renderSection={renderSection}
        />
      )}
    </div>
  );
}
