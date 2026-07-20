import { Clapperboard, FolderKanban, Pencil } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { EditorDivider, ValueBadge } from '@sniptale/ui/editor-chrome';
import { FloatingChromeToolbar, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';

const DOCUMENT_BAR_CLASS_NAME = floatingChromeClassNames(
  'absolute left-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center'
);

const PROJECT_TITLE_CLASS_NAME = [
  'h-9 min-w-[12rem] max-w-[18rem] rounded-[8px] border border-transparent bg-transparent',
  'px-2 text-sm font-semibold text-[var(--sniptale-color-text-primary)] outline-none transition',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
  'focus:border-[color:var(--sniptale-color-border-accent-strong)]',
  'focus:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_70%,transparent)]',
].join(' ');

type VideoEditorDocumentBarProps = {
  header: VideoEditorWorkspaceController['header'];
};

function VideoEditorProjectTitle({
  onRenameProject,
  projectName,
}: Pick<VideoEditorDocumentBarProps['header'], 'onRenameProject' | 'projectName'>) {
  return (
    <label className="flex min-w-0 items-center gap-1.5">
      <input
        aria-label={translate('videoEditor.app.title')}
        value={projectName}
        onChange={(event) => onRenameProject(event.currentTarget.value)}
        className={PROJECT_TITLE_CLASS_NAME}
      />
      <Pencil
        aria-hidden="true"
        className="shrink-0 text-[var(--sniptale-color-text-muted)]"
        size={14}
        strokeWidth={2}
      />
    </label>
  );
}

function VideoEditorSaveStateBadge({
  saveStateMeta,
}: Pick<VideoEditorDocumentBarProps['header'], 'saveStateMeta'>) {
  return (
    <ValueBadge className={saveStateMeta.className}>
      <span
        aria-hidden="true"
        className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[var(--sniptale-color-success)]"
      />
      {saveStateMeta.label}
    </ValueBadge>
  );
}

export function VideoEditorFloatingDocumentBar({ header }: VideoEditorDocumentBarProps) {
  return (
    <div data-ui="video-editor.floating.document-bar" className={DOCUMENT_BAR_CLASS_NAME}>
      <FloatingChromeToolbar
        dataUi="video-editor.floating.document-bar.surface"
        className="items-center gap-1.5"
      >
        <VideoEditorProjectTitle
          projectName={header.projectName}
          onRenameProject={header.onRenameProject}
        />
        <VideoEditorSaveStateBadge saveStateMeta={header.saveStateMeta} />
        <EditorDivider className="mx-1 h-7" />
        <ContentToolbarButton
          title={translate('videoEditor.app.libraryButton')}
          active={header.libraryPanelOpen}
          onClick={header.onToggleLibraryPanel}
          dataUi="video-editor.floating.document-bar.library"
        >
          <FolderKanban size={17} strokeWidth={2.1} />
        </ContentToolbarButton>
        <ContentToolbarButton
          title={translate('videoEditor.app.exportButton')}
          onClick={header.onOpenExportDialog}
          dataUi="video-editor.floating.document-bar.export"
        >
          <Clapperboard size={17} strokeWidth={2.1} />
        </ContentToolbarButton>
      </FloatingChromeToolbar>
    </div>
  );
}
