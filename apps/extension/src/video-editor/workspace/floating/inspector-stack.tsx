import { useState } from 'react';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';
import { getWorkspaceSidebarProps } from '../surface/sidebar-props';
import { WorkspaceSidebarPanelContent } from '../sidebar/panel-content';
import { useWorkspaceSidebarState } from '../sidebar/state';
import { WorkspaceSidebarHeader } from '../sidebar/view';
import type { InspectorGroupHeaderSlot } from '../sidebar/selection/grouped-inspector';

const INSPECTOR_STACK_CLASS_NAME = [
  'absolute bottom-3 right-3 top-[4.75rem] z-40 flex w-[20rem] max-w-[calc(100vw-5.5rem)]',
  'flex-col overflow-hidden p-0 max-[1120px]:hidden',
].join(' ');

type VideoEditorInspectorStackProps = {
  controller: VideoEditorWorkspaceController;
};

export function VideoEditorFloatingInspectorStack({ controller }: VideoEditorInspectorStackProps) {
  const sidebarProps = getWorkspaceSidebarProps(controller);
  const sidebarState = useWorkspaceSidebarState(
    sidebarProps.selection,
    sidebarProps.selectedClip,
    sidebarProps.recordingId,
    sidebarProps.diagnosticsOpen,
    sidebarProps.onToggleDiagnostics
  );
  const [inspectorHeaderSlot, setInspectorHeaderSlot] = useState<InspectorGroupHeaderSlot | null>(
    null
  );

  if (controller.header.leftSidebarCollapsed) {
    return null;
  }

  return (
    <FloatingChromePanel
      dataUi="video-editor.floating.context-inspector"
      className={INSPECTOR_STACK_CLASS_NAME}
    >
      <WorkspaceSidebarHeader
        inspectorHeaderSlot={inspectorHeaderSlot}
        inspectorMode={sidebarProps.inspectorMode}
        selectionIcon={sidebarState.selectionIcon}
        selectionTitle={sidebarState.selectionTitle}
        selectedTrack={sidebarProps.selectedTrack}
      />
      <WorkspaceSidebarPanelContent
        {...sidebarProps}
        diagnosticsMeta={sidebarState.diagnosticsMeta}
        diagnosticsSectionOpen={sidebarState.diagnosticsSectionOpen}
        inputRefs={sidebarState.inputRefs}
        projectsOpen={sidebarState.projectsOpen}
        recordingsOpen={sidebarState.recordingsOpen}
        onToggleDiagnosticsSection={sidebarState.toggleDiagnosticsSection}
        onToggleProjectsOpen={sidebarState.toggleProjectsOpen}
        onToggleRecordingsOpen={sidebarState.toggleRecordingsOpen}
        onSetInspectorHeaderSlot={setInspectorHeaderSlot}
      />
    </FloatingChromePanel>
  );
}
