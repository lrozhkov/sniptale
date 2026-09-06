import { FolderOpen, Sparkles, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import { VideoEditorFloatingDocumentBar } from './document-bar';

export function VideoEditorWorkspaceHeader(props: {
  libraryOpen: boolean;
  onOpenLibraryPanel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {!props.libraryOpen && (
        <ContentToolbarButton
          dataUi="video-editor.viewer.open-materials"
          title={translate('videoEditor.app.materialsTitle')}
          onClick={props.onOpenLibraryPanel}
        >
          <FolderOpen size={17} />
        </ContentToolbarButton>
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
      className="flex min-w-0 gap-1"
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
            active={props.active === id}
            aria-pressed={props.active === id}
            onClick={() => props.onChange(id)}
            dataUi={`video-editor.library-tab.${id}`}
            className="!w-auto !min-w-7 gap-1.5 !px-1.5"
          >
            {id === 'materials' ? <FolderOpen size={16} /> : <Sparkles size={16} />}
            <span className="hidden @min-[320px]/library:inline text-xs">{label}</span>
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
