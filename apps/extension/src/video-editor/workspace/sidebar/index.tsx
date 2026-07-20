import React from 'react';

import { createSceneSelection } from '../../project/selection/model';
import { WorkspaceSidebarCollapsedShell, WorkspaceSidebarExpandedPanel } from './shell';
import { useWorkspaceSidebarState } from './state';
import type { WorkspaceSidebarProps } from './contracts/index';

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = (props) => {
  const state = useWorkspaceSidebarState(
    props.selection ?? createSceneSelection(),
    props.selectedClip,
    props.recordingId,
    props.diagnosticsOpen,
    props.onToggleDiagnostics
  );

  if (props.collapsed) {
    return (
      <WorkspaceSidebarCollapsedShell
        selectedClipLabel={state.selectionLabel}
        selectedClipIcon={state.selectionIcon}
        diagnosticsOpen={props.diagnosticsOpen}
        inputRefs={state.inputRefs}
        onToggleCollapsed={props.onToggleCollapsed}
        onCreateProject={props.onCreateProject}
        onImportAudio={props.onImportAudio}
        onImportImage={props.onImportImage}
        onImportVideo={props.onImportVideo}
        onToggleDiagnostics={() => props.onToggleDiagnostics(!props.diagnosticsOpen)}
      />
    );
  }

  return (
    <WorkspaceSidebarExpandedPanel
      {...props}
      selectionIcon={state.selectionIcon}
      selectionTitle={state.selectionTitle}
      diagnosticsMeta={state.diagnosticsMeta}
      projectsOpen={state.projectsOpen}
      recordingsOpen={state.recordingsOpen}
      diagnosticsSectionOpen={state.diagnosticsSectionOpen}
      inputRefs={state.inputRefs}
      onToggleProjectsOpen={state.toggleProjectsOpen}
      onToggleRecordingsOpen={state.toggleRecordingsOpen}
      onToggleDiagnosticsSection={state.toggleDiagnosticsSection}
    />
  );
};
