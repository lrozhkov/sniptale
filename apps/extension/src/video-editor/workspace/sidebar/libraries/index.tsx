import React from 'react';
import { Bug, FolderOpen, Library } from 'lucide-react';
import {
  InspectorShellFrame,
  InspectorShellPanel,
  INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS,
} from '@sniptale/ui/inspector-shell';
import { translate } from '../../../../platform/i18n';
import { VIDEO_EDITOR_PANEL_STYLE } from '../../../chrome/styles';
import {
  EmptyLibrarySection,
  WorkspaceSidebarProjectCard,
  WorkspaceSidebarRecordingCard,
} from './cards';
export { VideoEditorImportToolbar as WorkspaceSidebarImportToolbar } from '../../../chrome/import-toolbar';
import type { ProjectListItem, RecordingListItem } from '../../../library/contracts/items';
import { CollapsedSelectionCard, CollapsibleSection, renderCollapsedRailButtons } from './shared';

export function WorkspaceSidebarCollapsedRail(props: {
  selectedClipLabel: string;
  selectedClipIcon: React.ReactNode;
  diagnosticsOpen: boolean;
  onToggleCollapsed: () => void;
  onCreateProject: () => void | Promise<void>;
  onImportImage: () => void;
  onImportVideo: () => void;
  onImportAudio: () => void;
  onToggleDiagnostics: () => void;
}) {
  return (
    <InspectorShellFrame
      collapsed
      collapsedWidthClassName={INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS}
      expandedWidthClassName={INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS}
      className="border-r border-[color:var(--sniptale-color-border-soft)]"
      dataUi="video-editor.workspace.sidebar-shell"
    >
      <InspectorShellPanel
        style={VIDEO_EDITOR_PANEL_STYLE}
        className={[
          'items-center gap-2 border-r px-2 py-3',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_82%,transparent)]',
        ].join(' ')}
        dataUi="video-editor.workspace.sidebar-collapsed-panel"
      >
        {renderCollapsedRailButtons(props)}
        <CollapsedSelectionCard
          selectedClipIcon={props.selectedClipIcon}
          selectedClipLabel={props.selectedClipLabel}
        />
      </InspectorShellPanel>
    </InspectorShellFrame>
  );
}

export function WorkspaceSidebarLibraryPanels(props: {
  projects: ProjectListItem[];
  recordings: RecordingListItem[];
  activeProjectId: string;
  projectsOpen: boolean;
  recordingsOpen: boolean;
  diagnosticsSectionOpen: boolean;
  diagnosticsMeta: string;
  recordingId: string | null;
  diagnosticsContent: React.ReactNode;
  onToggleProjectsOpen: () => void;
  onToggleRecordingsOpen: () => void;
  onToggleDiagnosticsSection: () => void;
  onOpenProject: (projectId: string) => void | Promise<void>;
  onDeleteProject: (projectId: string) => void | Promise<void>;
  onAddRecording: (recordingId: string) => void;
}) {
  return (
    <>
      <WorkspaceSidebarProjectsSection {...props} />
      <WorkspaceSidebarRecordingsSection {...props} />
      <WorkspaceSidebarDiagnosticsSection {...props} />
    </>
  );
}

function WorkspaceSidebarProjectsSection(
  props: Pick<
    React.ComponentProps<typeof WorkspaceSidebarLibraryPanels>,
    | 'projects'
    | 'activeProjectId'
    | 'projectsOpen'
    | 'onToggleProjectsOpen'
    | 'onOpenProject'
    | 'onDeleteProject'
  >
) {
  return (
    <CollapsibleSection
      title={translate('videoEditor.sidebar.projectsTitle')}
      meta={`${props.projects.length} ${translate('videoEditor.sidebar.projectsSavedSuffix')}`}
      icon={<FolderOpen size={17} strokeWidth={2} />}
      expanded={props.projectsOpen}
      onToggle={props.onToggleProjectsOpen}
    >
      <div className="space-y-2 pt-3">
        {props.projects.length === 0 ? (
          <EmptyLibrarySection message={translate('videoEditor.sidebar.projectsEmpty')} />
        ) : (
          props.projects.map((item) => (
            <WorkspaceSidebarProjectCard
              key={item.id}
              item={item}
              isActive={item.id === props.activeProjectId}
              onOpenProject={props.onOpenProject}
              onDeleteProject={props.onDeleteProject}
            />
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}

function WorkspaceSidebarRecordingsSection(
  props: Pick<
    React.ComponentProps<typeof WorkspaceSidebarLibraryPanels>,
    'recordings' | 'recordingsOpen' | 'onToggleRecordingsOpen' | 'onAddRecording'
  >
) {
  return (
    <CollapsibleSection
      title={translate('videoEditor.sidebar.recordingsTitle')}
      meta={`${props.recordings.length} ${translate('videoEditor.sidebar.recordingsInDbSuffix')}`}
      icon={<Library size={17} strokeWidth={2} />}
      expanded={props.recordingsOpen}
      onToggle={props.onToggleRecordingsOpen}
    >
      <div className="space-y-2 pt-3">
        {props.recordings.length === 0 ? (
          <EmptyLibrarySection message={translate('videoEditor.sidebar.recordingsEmpty')} />
        ) : (
          props.recordings.map((recording) => (
            <WorkspaceSidebarRecordingCard
              key={recording.id}
              recording={recording}
              onAddRecording={props.onAddRecording}
            />
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}

function WorkspaceSidebarDiagnosticsSection(
  props: Pick<
    React.ComponentProps<typeof WorkspaceSidebarLibraryPanels>,
    | 'diagnosticsMeta'
    | 'diagnosticsSectionOpen'
    | 'onToggleDiagnosticsSection'
    | 'recordingId'
    | 'diagnosticsContent'
  >
) {
  return (
    <CollapsibleSection
      title={translate('videoEditor.sidebar.diagnosticsTitle')}
      meta={props.diagnosticsMeta}
      icon={<Bug size={17} strokeWidth={2} />}
      expanded={props.diagnosticsSectionOpen}
      onToggle={props.onToggleDiagnosticsSection}
    >
      <div className="pt-3">
        {props.recordingId ? (
          props.diagnosticsContent
        ) : (
          <EmptyLibrarySection message={translate('videoEditor.sidebar.diagnosticsNoRecording')} />
        )}
      </div>
    </CollapsibleSection>
  );
}
