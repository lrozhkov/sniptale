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
      className="flex min-w-0 items-center gap-1"
    >
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
              '!h-9 !min-w-9 !gap-1.5 !border-transparent !px-1.5 !shadow-none',
              'transition-[background-color,color] motion-reduce:transition-none',
              props.active === id
                ? '!w-auto !bg-[var(--sniptale-color-surface-hover)] !text-[var(--sniptale-color-text-primary)]'
                : '!w-9 !bg-transparent',
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
