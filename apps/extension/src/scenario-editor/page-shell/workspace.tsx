import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useState, type ReactNode } from 'react';
import { FileText, Image, PanelLeft, PanelRight, Plus, Settings2 } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { GuidePanelDivider, type useGuidePanels } from './panel-layout';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import './workspace.css';

type WorkspaceProps = {
  panels: ReturnType<typeof useGuidePanels>;
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
  const { leftOpen, rightOpen } = props.panels;
  const [mode, setMode] = useState<'structure' | 'resources'>('structure');
  return (
    <div
      className="guide-workspace"
      style={props.panels.style}
      data-left-open={leftOpen}
      data-right-open={rightOpen}
    >
      <FloatingChromePanel
        role="complementary"
        id="guide-library-panel"
        className="guide-library-panel"
        hidden={!leftOpen}
        aria-label={t('scenario.editor.guideNavigation')}
      >
        <div className="guide-panel-heading">
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
        </div>
        <div className="guide-panel-scroll">
          <div hidden={mode !== 'structure'}>
            <GuideOutline project={project} selectedId={selectedId} onSelect={onSelect} t={t} />
          </div>
          <div hidden={mode !== 'resources'}>
            {props.importResources}
            {mode === 'resources' && <GuideResources {...props} />}
          </div>
        </div>
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          className="guide-add-step"
          disabled={props.disabled}
          onClick={props.onAddStep}
        >
          <Plus size={16} aria-hidden="true" />
          {t('scenario.editor.guideAddStep')}
        </ProductActionButton>
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          disabled={props.disabled}
          onClick={props.onAddSection}
        >
          {t('scenario.editor.guideAddSection')}
        </ProductActionButton>
      </FloatingChromePanel>
      {leftOpen && (
        <GuidePanelDivider side="left" panels={props.panels} label={t('scenario.editor.outline')} />
      )}
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
            <ProductActionButton
              tone="secondary"
              compact
              type="button"
              disabled={props.disabled}
              onClick={props.onAddStep}
            >
              {t('scenario.editor.guideAddStep')}
            </ProductActionButton>
          </div>
        )}
        {props.children}
      </div>
      {rightOpen && (
        <GuidePanelDivider
          side="right"
          panels={props.panels}
          label={t('scenario.editor.guideInspector')}
        />
      )}
      <GuideInspector {...props} open={rightOpen} />
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
        <ProductActionButton
          tone="secondary"
          compact
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
        </ProductActionButton>
      ))}
    </div>
  );
}

/** Selected-item details and project tools use one scrollable app panel. */
function GuideInspector(props: WorkspaceProps & { open: boolean }) {
  const { t } = props;
  return (
    <FloatingChromePanel
      role="complementary"
      id="guide-inspector-panel"
      className="guide-inspector-panel"
      hidden={!props.open}
      aria-label={t('scenario.editor.guideInspector')}
    >
      <div className="guide-panel-heading">
        <Settings2 size={16} aria-hidden="true" />
        <h2>{t('scenario.editor.guideInspector')}</h2>
      </div>
      <div className="guide-panel-scroll">
        {props.itemActions}
        <div className="guide-project-actions">
          <h2>{t('scenario.editor.projectLabel')}</h2>
          {props.projectActions}
        </div>
      </div>
    </FloatingChromePanel>
  );
}

/** Header owns panel commands; panels contain only their working content. */
export function GuidePanelControls({
  panels,
  t,
}: {
  panels: ReturnType<typeof useGuidePanels>;
  t: Translate;
}) {
  return (
    <>
      <ContentToolbarButton
        type="button"
        title={t('scenario.editor.outline')}
        aria-expanded={panels.leftOpen}
        aria-controls="guide-library-panel"
        onClick={panels.toggleLeft}
      >
        <PanelLeft size={16} aria-hidden="true" />
      </ContentToolbarButton>
      <ContentToolbarButton
        type="button"
        title={t('scenario.editor.guideInspector')}
        aria-expanded={panels.rightOpen}
        aria-controls="guide-inspector-panel"
        onClick={panels.toggleRight}
      >
        <PanelRight size={16} aria-hidden="true" />
      </ContentToolbarButton>
    </>
  );
}
