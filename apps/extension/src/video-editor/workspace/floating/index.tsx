import { WorkspacePanelButton } from './panel-header';
import { FolderOpen, Sparkles, WandSparkles, ArrowRightLeft, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import { VideoEditorFloatingDocumentBar } from './document-bar';

export function VideoEditorWorkspaceHeader(props: {
  libraryOpen: boolean;
  onOpenLibraryPanel: () => void;
  onOpenEffectsPanel: (kind: 'standalone' | 'targetEffect' | 'transition') => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {!props.libraryOpen && (
        <div className="flex shrink-0 items-center gap-1">
          <ContentToolbarButton
            className="!h-9 !w-9 !min-w-9 !px-0"
            dataUi="video-editor.viewer.open-materials"
            title={translate('videoEditor.app.materialsTitle')}
            onClick={props.onOpenLibraryPanel}
          >
            <FolderOpen size={18} aria-hidden="true" />
          </ContentToolbarButton>
          {getLibrarySections()
            .slice(1)
            .map(({ id, label, Icon }) => (
              <ContentToolbarButton
                key={id}
                className="!h-9 !w-9 !min-w-9 !px-0"
                dataUi={`video-editor.viewer.open-${id}`}
                title={label}
                onClick={() =>
                  props.onOpenEffectsPanel(
                    id === 'annotations'
                      ? 'standalone'
                      : id === 'transitions'
                        ? 'transition'
                        : 'targetEffect'
                  )
                }
              >
                <Icon size={18} aria-hidden="true" />
              </ContentToolbarButton>
            ))}
        </div>
      )}
      <VideoEditorFloatingDocumentBar>{props.children}</VideoEditorFloatingDocumentBar>
    </div>
  );
}

type LibrarySection = 'materials' | 'annotations' | 'effects' | 'transitions';

function getLibrarySections() {
  return [
    { id: 'materials', Icon: FolderOpen, label: translate('videoEditor.app.materialsTitle') },
    {
      id: 'annotations',
      Icon: Sparkles,
      label: translate('videoEditor.effectsLibrary.annotations'),
    },
    {
      id: 'effects',
      Icon: WandSparkles,
      label: translate('videoEditor.effectsLibrary.videoEffects'),
    },
    {
      id: 'transitions',
      Icon: ArrowRightLeft,
      label: translate('videoEditor.effectsLibrary.transitions'),
    },
  ] as const;
}

export function VideoEditorLibraryNavigation(props: {
  active: LibrarySection;
  onChange: (active: LibrarySection) => void;
}) {
  const sections = getLibrarySections();
  const activeIndex = sections.findIndex((section) => section.id === props.active);
  return (
    <div
      role="group"
      aria-label={translate('videoEditor.app.materialsTitle')}
      className={[
        '@container/library-nav relative grid min-w-[102px] flex-1 items-center gap-0.5',
        'transition-[grid-template-columns] duration-150 ease-out motion-reduce:transition-none',
      ].join(' ')}
      style={{
        gridTemplateColumns: sections
          .map((section) => (section.id === props.active ? 'minmax(24px, 1fr)' : '24px'))
          .join(' '),
      }}
    >
      <span
        aria-hidden="true"
        data-ui="video-editor.library-tab.indicator"
        className={[
          'pointer-events-none absolute inset-y-0 left-0 rounded-[8px]',
          'bg-[var(--sniptale-color-surface-hover)] transition-transform duration-150 ease-out',
          'motion-reduce:transition-none',
        ].join(' ')}
        style={{ width: 'calc(100% - 78px)', transform: `translateX(${activeIndex * 26}px)` }}
      />
      {sections.map(({ id, label, Icon }) => (
        <ContentToolbarButton
          key={id}
          title={label}
          aria-pressed={props.active === id}
          onClick={() => props.onChange(id)}
          dataUi={`video-editor.library-tab.${id}`}
          className={[
            'relative !h-9 !w-full !min-w-6 !gap-1 !border-transparent !bg-transparent !px-1 !shadow-none',
            props.active === id ? '!text-[var(--sniptale-color-accent)]' : '',
          ].join(' ')}
        >
          <Icon size={16} className="shrink-0" aria-hidden="true" />
          {props.active === id && (
            <span className="hidden truncate text-[12px] font-medium @[150px]/library-nav:block">
              {label}
            </span>
          )}
        </ContentToolbarButton>
      ))}
    </div>
  );
}

export function WorkspacePanelCloseButton(props: {
  onClose: () => void;
  dataUi: string;
  title: string;
}) {
  return (
    <WorkspacePanelButton dataUi={props.dataUi} title={props.title} onClick={props.onClose}>
      <X size={16} aria-hidden="true" />
    </WorkspacePanelButton>
  );
}
