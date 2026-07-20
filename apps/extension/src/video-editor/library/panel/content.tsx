import { ProductModalBody } from '@sniptale/ui/product-modal';
import type { VideoEditorLibraryPanelBodyProps } from '../contracts/panel';
import { LibraryPanelSearch } from './search';
import type { buildLibraryPanelState } from './state';
import { ProjectsSection, RecordingsSection } from './lists';
import {
  CurrentProjectStrip,
  DiagnosticsSection,
  ImportSection,
  LibraryPanelTabs,
  type LibraryPanelTab,
} from './sections';
import type { useLibraryThumbnails } from './thumbnails/use-thumbnails';

type LibraryPanelContentProps = Pick<
  VideoEditorLibraryPanelBodyProps,
  | 'activeProjectId'
  | 'diagnosticsContent'
  | 'diagnosticsOpen'
  | 'inputRefs'
  | 'onAddRecording'
  | 'onClose'
  | 'onCreateProject'
  | 'onDeleteProject'
  | 'onOpenAudioRecordingDialog'
  | 'onOpenProject'
  | 'onToggleDiagnostics'
  | 'projects'
  | 'recordingId'
  | 'recordings'
> &
  ReturnType<typeof buildLibraryPanelState> & {
    activeTab: LibraryPanelTab;
    diagnosticsAvailable: boolean;
    onQueryChange: (query: string) => void;
    onTabChange: (tab: LibraryPanelTab) => void;
    query: string;
    thumbnails: ReturnType<typeof useLibraryThumbnails>;
  };

function createContentActions(props: LibraryPanelContentProps) {
  const onCreateProject = async () => {
    await props.onCreateProject();
    props.onClose();
  };

  const onOpenProject = async (projectId: string) => {
    await props.onOpenProject(projectId);
    props.onClose();
  };

  const onAddRecording = (recordingId: string) => {
    props.onAddRecording(recordingId);
    props.onClose();
  };

  return { onAddRecording, onCreateProject, onOpenProject };
}

function LibraryPanelColumns(props: LibraryPanelContentProps) {
  const actions = createContentActions(props);

  if (props.activeTab === 'projects') {
    return <LibraryPanelProjectsTab {...props} onOpenProject={actions.onOpenProject} />;
  }

  if (props.activeTab === 'import') {
    return <LibraryPanelImportTab {...props} onCreateProject={actions.onCreateProject} />;
  }

  if (props.activeTab === 'diagnostics') {
    return <LibraryPanelDiagnosticsTab {...props} />;
  }

  return <LibraryPanelMediaTab {...props} onAddRecording={actions.onAddRecording} />;
}

function LibraryPanelProjectsTab(
  props: LibraryPanelContentProps & {
    onOpenProject: (projectId: string) => Promise<void>;
  }
) {
  return (
    <ProjectsSection
      activeProjectId={props.activeProjectId}
      hasQuery={props.hasQuery}
      onDeleteProject={props.onDeleteProject}
      onOpenProject={props.onOpenProject}
      projects={props.visibleProjects}
      projectRemainder={props.projectRemainder}
      recentProjects={props.recentProjects}
      thumbnails={props.thumbnails}
    />
  );
}

function LibraryPanelImportTab(
  props: LibraryPanelContentProps & {
    onCreateProject: () => Promise<void>;
  }
) {
  return (
    <ImportSection
      onCreateProject={props.onCreateProject}
      onImportAudio={() => props.inputRefs.audioInputRef.current?.click()}
      onImportImage={() => props.inputRefs.imageInputRef.current?.click()}
      onImportVideo={() => props.inputRefs.videoInputRef.current?.click()}
      onRecordAudio={props.onOpenAudioRecordingDialog}
    />
  );
}

function LibraryPanelDiagnosticsTab(props: LibraryPanelContentProps) {
  return (
    <DiagnosticsSection
      diagnosticsContent={props.diagnosticsContent}
      diagnosticsOpen={props.diagnosticsOpen}
      onToggleDiagnostics={props.onToggleDiagnostics}
      recordingId={props.recordingId}
    />
  );
}

function LibraryPanelMediaTab(
  props: LibraryPanelContentProps & {
    onAddRecording: (recordingId: string) => void;
  }
) {
  return (
    <RecordingsSection
      recordings={props.visibleRecordings}
      recordingRemainder={props.recordingRemainder}
      recentRecordings={props.recentRecordings}
      thumbnails={props.thumbnails}
      hasQuery={props.hasQuery}
      onAddRecording={props.onAddRecording}
    />
  );
}

/**
 * Drawer body layout for resolved library panel state.
 */
export function LibraryPanelDrawerContent(props: LibraryPanelContentProps) {
  return (
    <ProductModalBody compact className="min-h-0 flex-1 !gap-0 !p-0 overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-[144px_minmax(0,1fr)] overflow-hidden">
        <LibraryPanelRail {...props} />
        <LibraryPanelMain {...props} />
      </div>
    </ProductModalBody>
  );
}

function LibraryPanelRail(props: LibraryPanelContentProps) {
  return (
    <aside
      className={[
        'grid min-h-0 grid-rows-[auto_1fr] gap-3 border-r p-3',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_58%,transparent)]',
      ].join(' ')}
    >
      <CurrentProjectStrip activeProjectId={props.activeProjectId} projects={props.projects} />
      <LibraryPanelTabs
        activeTab={props.activeTab}
        diagnosticsAvailable={props.diagnosticsAvailable}
        projectsCount={props.projects.length}
        recordingsCount={props.recordings.length}
        onTabChange={props.onTabChange}
      />
    </aside>
  );
}

function LibraryPanelMain(props: LibraryPanelContentProps) {
  return (
    <main className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden">
      <div className="border-b border-[color:var(--sniptale-color-border-soft)] p-3">
        <LibraryPanelSearch query={props.query} onQueryChange={props.onQueryChange} />
      </div>
      <div className="min-h-0 overflow-y-auto p-3" data-ui="video-editor.library.tab-body">
        <LibraryPanelColumns {...props} />
      </div>
    </main>
  );
}
