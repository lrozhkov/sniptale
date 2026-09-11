import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, FileText, Image, List, Plus, Settings2 } from 'lucide-react';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import './workspace.css';

type WorkspaceProps = {
  project: GuideProject;
  selectedId: string | null;
  images: Record<string, string | null>;
  disabled: boolean;
  onSelect: (id: string) => void;
  onAddStep: () => void;
  onAddSection: () => void;
  importResources: ReactNode;
  itemActions: ReactNode;
  projectActions: ReactNode;
  children: ReactNode;
  t: Translate;
};

/** Owns disposable panel visibility; document selection and edits remain in page state. */
export function GuideWorkspace(props: WorkspaceProps) {
  const { project, selectedId, onSelect, t } = props;
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mode, setMode] = useState<'structure' | 'resources'>('structure');
  const selected = project.items.find((item) => item.id === selectedId);
  return (
    <div className="guide-workspace" data-left-open={leftOpen} data-right-open={rightOpen}>
      <div className="guide-workspace-bar">
        <button
          type="button"
          aria-expanded={leftOpen}
          aria-controls="guide-library-panel"
          onClick={() => setLeftOpen(!leftOpen)}
        >
          <List size={16} aria-hidden="true" />
          {t('scenario.editor.outline')}
          {leftOpen ? (
            <ChevronLeft size={14} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} aria-hidden="true" />
          )}
        </button>
        <span className="guide-selection-label">
          {selected?.title || t('scenario.editor.guideDocument')}
        </span>
        <button
          type="button"
          aria-expanded={rightOpen}
          aria-controls="guide-inspector-panel"
          onClick={() => setRightOpen(!rightOpen)}
        >
          <Settings2 size={16} aria-hidden="true" />
          {t('scenario.editor.guideInspector')}
        </button>
      </div>
      <aside
        id="guide-library-panel"
        className="guide-library-panel"
        hidden={!leftOpen}
        aria-label={t('scenario.editor.guideNavigation')}
      >
        <SegmentedSwitch
          wrap
          activeId={mode}
          onChange={setMode}
          ariaLabel={t('scenario.editor.guideNavigation')}
          options={[
            { id: 'structure', label: t('scenario.editor.outline') },
            { id: 'resources', label: t('scenario.editor.guideResources') },
          ]}
        />
        <div className="guide-panel-scroll">
          <div hidden={mode !== 'structure'}>
            <GuideOutline project={project} selectedId={selectedId} onSelect={onSelect} t={t} />
          </div>
          <div hidden={mode !== 'resources'}>
            {props.importResources}
            {mode === 'resources' && <GuideResources {...props} />}
          </div>
        </div>
        <button
          type="button"
          className="guide-add-step"
          disabled={props.disabled}
          onClick={props.onAddStep}
        >
          <Plus size={16} aria-hidden="true" />
          {t('scenario.editor.guideAddStep')}
        </button>
        <button type="button" disabled={props.disabled} onClick={props.onAddSection}>
          {t('scenario.editor.guideAddSection')}
        </button>
      </aside>
      <div
        className="guide-document-scroll"
        tabIndex={0}
        aria-label={t('scenario.editor.guideDocument')}
      >
        {project.items.length === 0 && (
          <div className="guide-document-empty">
            <FileText size={32} aria-hidden="true" />
            <h2>{t('scenario.editor.guideFirstStep')}</h2>
            <p>{t('scenario.editor.guideFirstStepHint')}</p>
            <button type="button" disabled={props.disabled} onClick={props.onAddStep}>
              {t('scenario.editor.guideAddStep')}
            </button>
          </div>
        )}
        {props.children}
      </div>
      <aside
        id="guide-inspector-panel"
        className="guide-inspector-panel"
        hidden={!rightOpen}
        aria-label={t('scenario.editor.guideInspector')}
      >
        <div className="guide-panel-scroll">
          <h2>{t('scenario.editor.guideInspector')}</h2>
          {selected ? (
            <>
              <p className="guide-inspector-title">
                {selected.title || t('scenario.editor.untitledStep')}
              </p>
              <p>
                {selected.kind === 'section'
                  ? t('scenario.editor.guideSectionHint')
                  : t('scenario.editor.guideBlockCount').replace(
                      '{count}',
                      String(selected.blocks.length)
                    )}
              </p>
              <p>{t('scenario.editor.guideEditHint')}</p>
            </>
          ) : (
            <p>{t('scenario.editor.guideSelectHint')}</p>
          )}
          {props.itemActions}
          <div className="guide-project-actions">
            <h2>{t('scenario.editor.projectLabel')}</h2>
            {props.projectActions}
          </div>
        </div>
      </aside>
    </div>
  );
}

function GuideOutline({
  project,
  selectedId,
  onSelect,
  t,
}: Pick<WorkspaceProps, 'project' | 'selectedId' | 'onSelect' | 't'>) {
  let number = 0;
  return (
    <nav aria-label={t('scenario.editor.outline')} className="guide-outline">
      {project.items.map((item) => {
        if (item.kind === 'step') number += 1;
        return (
          <a
            key={item.id}
            href={`#${encodeURIComponent(item.id)}`}
            className={item.kind === 'section' ? 'guide-outline-section' : 'guide-outline-step'}
            aria-current={selectedId === item.id ? 'step' : undefined}
            onClick={(event) => {
              event.preventDefault();
              onSelect(item.id);
            }}
          >
            <span className="guide-outline-number" aria-hidden="true">
              {item.kind === 'step' ? number : <FileText size={14} />}
            </span>
            <span>{item.title || t('scenario.editor.untitledStep')}</span>
          </a>
        );
      })}
    </nav>
  );
}

function GuideResources({ project, images, onSelect, t }: WorkspaceProps) {
  const resources = project.items.flatMap((item) =>
    item.kind === 'step'
      ? item.blocks.flatMap((block) => (block.kind === 'image' ? [{ item, block }] : []))
      : []
  );
  return (
    <div className="guide-resources">
      <p>{t('scenario.editor.guideResourcesHint')}</p>
      {resources.length === 0 && <p>{t('scenario.editor.guideNoResources')}</p>}
      {resources.map(({ item, block }) => (
        <button
          key={block.id}
          type="button"
          className="guide-resource"
          onClick={() => onSelect(item.id)}
        >
          {images[block.assetId] ? (
            <img src={images[block.assetId] ?? undefined} alt="" loading="lazy" />
          ) : (
            <Image size={24} aria-hidden="true" />
          )}
          <span>
            {block.caption || block.alt || item.title || t('scenario.editor.untitledStep')}
          </span>
        </button>
      ))}
    </div>
  );
}
