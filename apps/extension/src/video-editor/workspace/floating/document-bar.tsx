import type { ReactNode } from 'react';
import { Clapperboard, FolderKanban, PanelRight, Pencil, Redo2, Undo2 } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { EditorDivider, ValueBadge } from '@sniptale/ui/editor-chrome';
import { FloatingChromeToolbar, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import {
  useVideoEditorHeaderController,
  useVideoEditorHistoryController,
} from '../../runtime/controller/composition/hooks';
import type { VideoEditorHeaderController } from '../../runtime/controller/contracts/header';
import { VideoProjectStorageStatus } from './storage-status';
import { requestVideoEditorSaveRetry } from '../../runtime/session/save-retry';

const DOCUMENT_BAR_CLASS_NAME = floatingChromeClassNames(
  'relative z-50 flex min-w-0 w-full items-center'
);

const PROJECT_TITLE_CLASS_NAME = [
  'h-9 min-w-0 w-full rounded-[8px] border border-transparent bg-transparent',
  'px-2 text-sm font-semibold text-[var(--sniptale-color-text-primary)] outline-none transition',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
  'focus:border-[color:var(--sniptale-color-border-accent-strong)]',
  'focus:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_70%,transparent)]',
].join(' ');

type VideoEditorDocumentBarProps = {
  header: VideoEditorHeaderController;
  history: ReturnType<typeof useVideoEditorHistoryController>;
};

function VideoEditorProjectTitle({
  onRenameProject,
  projectName,
}: Pick<VideoEditorDocumentBarProps['header'], 'onRenameProject' | 'projectName'>) {
  return (
    <label className="flex min-w-[6rem] max-w-[16rem] flex-1 items-center gap-1.5">
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
  if (saveStateMeta.state !== 'error') return null;
  return (
    <span role="alert">
      <ValueBadge className={saveStateMeta.className}>
        {translate('videoEditor.app.saveChangesFailed')}
        <button
          type="button"
          className="ml-2 font-semibold underline underline-offset-2"
          onClick={requestVideoEditorSaveRetry}
        >
          {translate('common.actions.retry')}
        </button>
      </ValueBadge>
    </span>
  );
}

export function VideoEditorFloatingDocumentBar({
  inspector,
  children,
}: {
  children?: ReactNode;
  inspector?: { isOpen: boolean; onToggle: () => void };
} = {}) {
  const header = useVideoEditorHeaderController();
  const history = useVideoEditorHistoryController();
  if (!header) return null;
  return (
    <div data-ui="video-editor.floating.document-bar" className={DOCUMENT_BAR_CLASS_NAME}>
      <FloatingChromeToolbar
        dataUi="video-editor.floating.document-bar.surface"
        className="w-full flex-nowrap items-center gap-1"
      >
        <VideoEditorProjectTitle
          projectName={header.projectName}
          onRenameProject={header.onRenameProject}
        />
        <VideoEditorSaveStateBadge saveStateMeta={header.saveStateMeta} />
        <VideoProjectStorageStatus />
        <EditorDivider className="mx-1 h-7" />
        <ContentToolbarButton
          title={`${translate('videoEditor.app.undo')} (${translate('videoEditor.app.undoShortcut')})`}
          disabled={!history.canUndo}
          onClick={history.onUndo}
          dataUi="video-editor.floating.document-bar.undo"
        >
          <Undo2 size={17} strokeWidth={2.1} />
        </ContentToolbarButton>
        <ContentToolbarButton
          title={`${translate('videoEditor.app.redo')} (${translate('videoEditor.app.redoShortcut')})`}
          disabled={!history.canRedo}
          onClick={history.onRedo}
          dataUi="video-editor.floating.document-bar.redo"
        >
          <Redo2 size={17} strokeWidth={2.1} />
        </ContentToolbarButton>
        {history.error ? (
          <span role="alert">
            <ValueBadge className="text-[var(--sniptale-color-danger)]">
              {translate('videoEditor.app.historyError')}
            </ValueBadge>
          </span>
        ) : null}
        <EditorDivider className="mx-1 h-7" />
        {children}
        <EditorDivider className="mx-1 h-7" />
        <ContentToolbarButton
          title={translate(
            !(inspector?.isOpen ?? !header.leftSidebarCollapsed)
              ? 'videoEditor.app.expandInspector'
              : 'videoEditor.app.collapseInspector'
          )}
          active={inspector?.isOpen ?? !header.leftSidebarCollapsed}
          aria-pressed={inspector?.isOpen ?? !header.leftSidebarCollapsed}
          onClick={inspector?.onToggle ?? header.onToggleSidebar}
          dataUi="video-editor.floating.document-bar.inspector"
        >
          <PanelRight size={17} strokeWidth={2.1} />
        </ContentToolbarButton>
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
