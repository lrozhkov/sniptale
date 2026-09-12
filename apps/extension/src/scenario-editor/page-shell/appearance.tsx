import type {
  GuideProject,
  GuideStyleOverrides,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { RotateCcw, FileText, Folder } from 'lucide-react';
import { resolveGuideStyle, applyGuideLayout } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { GuideNumberingControls } from './numbering-controls';
import { GuideStyleFields, GuideLayoutFields } from './style-controls';

type AppearanceProps = {
  project: GuideProject;
  selectedId: string | null;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  t: Translate;
};

/** Only the selected item's settings live here; defaults live in the document context. */
export function GuideAppearance({ project, selectedId, disabled, onChange, t }: AppearanceProps) {
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
  return (
    <div className="guide-appearance">
      <div className="guide-inspector-context">
        {item.kind === 'step' ? (
          <FileText size={16} aria-hidden="true" />
        ) : (
          <Folder size={16} aria-hidden="true" />
        )}
        <strong>{item.title || t('scenario.editor.untitledStep')}</strong>
      </div>
      {item.kind === 'step' && (
        <>
          <GuideLayoutFields
            layout={item.layout}
            disabled={disabled}
            t={t}
            onChange={(layout) => change(applyGuideLayout(item, layout))}
          />
          {item.blocks.length > 0 && (
            <p className="guide-inspector-hint">{t('scenario.editor.appearanceLayoutHelp')}</p>
          )}
        </>
      )}
      <GuideNumberingControls
        project={project}
        item={item}
        disabled={disabled}
        t={t}
        onChange={change}
      />
      {item.kind === 'step' && (
        <>
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
          <GuideStyleFields
            style={resolveGuideStyle(project.style, item.styleOverrides)}
            disabled={disabled}
            t={t}
            onChange={customize}
          />
        </>
      )}
    </div>
  );
}
