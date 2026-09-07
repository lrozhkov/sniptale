import { FolderOpen, Sparkles, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import { VideoEditorFloatingDocumentBar } from './document-bar';

export function VideoEditorWorkspaceHeader(props: {
  libraryOpen: boolean;
  onOpenLibraryPanel: () => void;
  onOpenEffectsPanel: () => void;
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
          <ContentToolbarButton
            className="!h-9 !w-9 !min-w-9 !px-0"
            dataUi="video-editor.viewer.open-effects"
            title={translate('videoEditor.effectsLibrary.button')}
            onClick={props.onOpenEffectsPanel}
          >
            <Sparkles size={18} aria-hidden="true" />
          </ContentToolbarButton>
        </div>
      )}
      <VideoEditorFloatingDocumentBar>{props.children}</VideoEditorFloatingDocumentBar>
    </div>
  );
}

export function VideoEditorLibraryNavigation(props: {
  active: 'materials' | 'effects';
  onChange: (active: 'materials' | 'effects') => void;
}) {
  return (
    <div
      role="group"
      aria-label={translate('videoEditor.app.materialsTitle')}
      className={[
        'relative grid min-w-0 max-w-[168px] flex-1 items-center gap-1',
        'transition-[grid-template-columns] duration-150 ease-out motion-reduce:transition-none',
      ].join(' ')}
      style={{
        gridTemplateColumns:
          props.active === 'materials' ? 'minmax(0, 1fr) 36px' : '36px minmax(0, 1fr)',
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
        style={{
          width: 'calc(100% - 40px)',
          transform: props.active === 'materials' ? 'translateX(0)' : 'translateX(40px)',
        }}
      />
      {(['materials', 'effects'] as const).map((id) => {
        const label = translate(
          id === 'materials'
            ? 'videoEditor.app.materialsTitle'
            : 'videoEditor.effectsLibrary.button'
        );
        return (
          <ContentToolbarButton
            key={id}
            title={label}
            aria-pressed={props.active === id}
            onClick={() => props.onChange(id)}
            dataUi={`video-editor.library-tab.${id}`}
            className={[
              'relative !h-9 !w-full !min-w-9 !gap-1.5 !border-transparent !bg-transparent !px-1.5 !shadow-none',
              'transition-[background-color,color] motion-reduce:transition-none',
              props.active === id ? '!text-[var(--sniptale-color-text-primary)]' : '',
            ].join(' ')}
          >
            {id === 'materials' ? <FolderOpen size={16} /> : <Sparkles size={16} />}
            {props.active === id && (
              <span className="truncate text-[13px] font-medium">{label}</span>
            )}
          </ContentToolbarButton>
        );
      })}
    </div>
  );
}

export function WorkspacePanelCloseButton(props: {
  onClose: () => void;
  dataUi: string;
  title: string;
}) {
  return (
    <ContentToolbarButton
      className="!h-7 !w-7 !min-w-7 !px-0"
      dataUi={props.dataUi}
      title={props.title}
      onClick={props.onClose}
    >
      <X size={15} />
    </ContentToolbarButton>
  );
}
