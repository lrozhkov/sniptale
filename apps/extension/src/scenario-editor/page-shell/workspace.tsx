import { GuideImageUpload } from './image-upload';
import { resolveGuideNumbering } from '../../features/scenario/project/public';
import { GUIDE_IMAGE_DRAG_TYPE } from './image-drop';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { type ReactNode } from 'react';
import { FileText, Image, PanelRight, Settings2, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { GuidePanelDivider, type useGuidePanels } from './panel-layout';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import './workspace.css';
import './inspector.css';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';

type WorkspaceProps = {
  panels: ReturnType<typeof useGuidePanels>;
  project: GuideProject;
  selectedId: string | null;
  images: Record<string, string | null>;
  header: ReactNode;
  onUploadFile: (file: File, signal: AbortSignal) => Promise<boolean>;
  importResources: ReactNode;
  disabled: boolean;
  onSelect: (id: string) => void;
  onAddStep: () => void;
  itemActions: ReactNode;
  children: ReactNode;
  t: Translate;
};

/** Owns disposable panel visibility; document selection and edits remain in page state. */
export function GuideWorkspace(props: WorkspaceProps) {
  const { project, selectedId, onSelect, t } = props;
  const { leftOpen, rightOpen } = props.panels;
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
          <div
            className="guide-left-navigation"
            role="group"
            aria-label={t('scenario.editor.guideNavigation')}
          >
            {(
              [
                { id: 'structure', Icon: FileText, label: t('scenario.editor.outline') },
                { id: 'resources', Icon: Image, label: t('scenario.editor.guideResources') },
              ] as const
            ).map(({ id, Icon, label }) => (
              <ContentToolbarButton
                key={id}
                title={label}
                aria-pressed={props.panels.leftSection === id}
                className="guide-section-tab"
                onClick={() => props.panels.openLeft(id)}
              >
                <Icon size={16} aria-hidden="true" />
                {props.panels.leftSection === id && <span>{label}</span>}
              </ContentToolbarButton>
            ))}
          </div>
          <ContentToolbarButton
            title={t('scenario.editor.close')}
            aria-controls="guide-library-panel"
            aria-expanded={true}
            onClick={props.panels.toggleLeft}
          >
            <X size={16} aria-hidden="true" />
          </ContentToolbarButton>
        </div>
        <div className="guide-panel-scroll">
          {props.panels.leftSection === 'structure' ? (
            <GuideOutline project={project} selectedId={selectedId} onSelect={onSelect} t={t} />
          ) : (
            <>
              {props.importResources}
              <GuideResources {...props} />
            </>
          )}
        </div>
      </FloatingChromePanel>
      {leftOpen && (
        <GuidePanelDivider side="left" panels={props.panels} label={t('scenario.editor.outline')} />
      )}
      <div className="guide-center-panel">
        {props.header}
        <div
          className="guide-document-scroll"
          tabIndex={0}
          aria-label={t('scenario.editor.guideDocument')}
        >
          {project.items.length === 0 && (
            <div className="guide-document-empty">
              <FileText size={32} aria-hidden="true" />
              <h2>{t('scenario.editor.guideFirstStep')}</h2>
              <GuideImageUpload
                placement={{ kind: 'steps' }}
                disabled={props.disabled}
                onUpload={props.onUploadFile}
                t={t}
              />
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
  const numbers = resolveGuideNumbering(project.items);
  return (
    <nav aria-label={t('scenario.editor.outline')} className="guide-outline">
      {project.items.map((item) => {
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
              {item.kind === 'step' ? numbers.get(item.id)?.label : <FileText size={14} />}
            </span>
            <span>{item.title || t('scenario.editor.untitledStep')}</span>
          </a>
        );
      })}
    </nav>
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
        <ContentToolbarButton
          title={t('scenario.editor.close')}
          aria-controls="guide-inspector-panel"
          aria-expanded={true}
          onClick={props.panels.toggleRight}
        >
          <X size={16} aria-hidden="true" />
        </ContentToolbarButton>
      </div>
      <div className="guide-inspector-scope">
        <SegmentedSwitch
          density="compact"
          ariaLabel={t('scenario.editor.guideSettingsScope')}
          activeId={props.panels.rightScope}
          options={[
            { id: 'selection', label: t('scenario.editor.guideSelectedScope') },
            { id: 'document', label: t('scenario.editor.projectLabel') },
          ]}
          onChange={props.panels.selectRightScope}
        />
      </div>
      <div className="guide-panel-scroll">{props.itemActions}</div>
    </FloatingChromePanel>
  );
}

/** Collapsed sections reopen directly into the requested inspector content. */
export function GuidePanelControls({
  panels,
  t,
  side,
}: {
  panels: ReturnType<typeof useGuidePanels>;
  t: Translate;
  side: 'left' | 'right';
}) {
  if (side === 'right')
    return panels.rightOpen ? null : (
      <ContentToolbarButton
        title={t('scenario.editor.guideInspector')}
        aria-controls="guide-inspector-panel"
        onClick={panels.toggleRight}
      >
        <PanelRight size={16} aria-hidden="true" />
      </ContentToolbarButton>
    );
  if (panels.leftOpen) return null;
  return (
    <div className="guide-collapsed-sections">
      <ContentToolbarButton
        title={t('scenario.editor.outline')}
        aria-controls="guide-library-panel"
        onClick={() => panels.openLeft('structure')}
      >
        <FileText size={16} aria-hidden="true" />
      </ContentToolbarButton>
      <ContentToolbarButton
        title={t('scenario.editor.guideResources')}
        aria-controls="guide-library-panel"
        onClick={() => panels.openLeft('resources')}
      >
        <Image size={16} aria-hidden="true" />
      </ContentToolbarButton>
    </div>
  );
}

function GuideResources({ project, images, onSelect, disabled, t }: WorkspaceProps) {
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
          draggable={!disabled}
          onDragStart={(event) => {
            if (disabled) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData(
              GUIDE_IMAGE_DRAG_TYPE,
              JSON.stringify({ projectId: project.id, blockId: block.id })
            );
          }}
          onClick={() => onSelect(item.id)}
        >
          {images[block.assetId] ? (
            <img src={images[block.assetId] ?? undefined} alt="" loading="lazy" draggable={false} />
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
