import type React from 'react';
import { useState } from 'react';
import {
  InspectorShellFrame,
  InspectorShellPanel,
  INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
} from '@sniptale/ui/inspector-shell';
import { VIDEO_EDITOR_PANEL_STYLE } from '../../chrome/styles';
import { WorkspaceSidebarCollapsedRail } from './libraries';
import { VideoEditorFileInputNodes, type VideoEditorFileInputRefs } from '../../chrome/file-inputs';
import type { WorkspaceSidebarProps } from './contracts/props';
import { WorkspaceSidebarHeader } from './view';
import { WorkspaceSidebarPanelContent } from './panel-content/index';
import type { InspectorGroupHeaderSlot } from './selection/grouped-inspector';

interface WorkspaceSidebarExpandedPanelProps extends WorkspaceSidebarProps {
  selectionIcon: React.ReactNode;
  selectionTitle: string;
  diagnosticsMeta: string;
  projectsOpen: boolean;
  recordingsOpen: boolean;
  diagnosticsSectionOpen: boolean;
  inputRefs: VideoEditorFileInputRefs;
  onToggleProjectsOpen: () => void;
  onToggleRecordingsOpen: () => void;
  onToggleDiagnosticsSection: () => void;
}

export function WorkspaceSidebarCollapsedShell({
  selectedClipLabel,
  selectedClipIcon,
  diagnosticsOpen,
  inputRefs,
  onToggleCollapsed,
  onCreateProject,
  onImportImage,
  onImportVideo,
  onImportAudio,
  onToggleDiagnostics,
}: Pick<
  WorkspaceSidebarProps,
  | 'diagnosticsOpen'
  | 'onToggleCollapsed'
  | 'onCreateProject'
  | 'onImportImage'
  | 'onImportVideo'
  | 'onImportAudio'
> & {
  selectedClipLabel: string;
  selectedClipIcon: React.ReactNode;
  inputRefs: VideoEditorFileInputRefs;
  onToggleDiagnostics: () => void;
}) {
  return (
    <>
      <VideoEditorFileInputNodes
        {...inputRefs}
        onImportImage={onImportImage}
        onImportVideo={onImportVideo}
        onImportAudio={onImportAudio}
      />
      <WorkspaceSidebarCollapsedRail
        selectedClipLabel={selectedClipLabel}
        selectedClipIcon={selectedClipIcon}
        diagnosticsOpen={diagnosticsOpen}
        onToggleCollapsed={onToggleCollapsed}
        onCreateProject={onCreateProject}
        onImportImage={() => inputRefs.imageInputRef.current?.click()}
        onImportVideo={() => inputRefs.videoInputRef.current?.click()}
        onImportAudio={() => inputRefs.audioInputRef.current?.click()}
        onToggleDiagnostics={onToggleDiagnostics}
      />
    </>
  );
}

export function WorkspaceSidebarExpandedPanel({
  selectionIcon,
  selectionTitle,
  selectedTrack,
  ...props
}: WorkspaceSidebarExpandedPanelProps) {
  const [inspectorHeaderSlot, setInspectorHeaderSlot] = useState<InspectorGroupHeaderSlot | null>(
    null
  );

  return (
    <InspectorShellFrame
      expandedWidthClassName={INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS}
      collapsedWidthClassName={INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS}
      dataUi="video-editor.workspace.sidebar-shell"
    >
      <VideoEditorFileInputNodes
        {...props.inputRefs}
        onImportImage={props.onImportImage}
        onImportVideo={props.onImportVideo}
        onImportAudio={props.onImportAudio}
      />
      <InspectorShellPanel
        style={VIDEO_EDITOR_PANEL_STYLE}
        className="border-r border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_82%,transparent)]"
        dataUi="video-editor.workspace.sidebar-panel"
      >
        <WorkspaceSidebarHeader
          inspectorHeaderSlot={inspectorHeaderSlot}
          inspectorMode={props.inspectorMode}
          selectionIcon={selectionIcon}
          selectionTitle={selectionTitle}
          selectedTrack={selectedTrack}
        />
        <WorkspaceSidebarPanelContent
          {...props}
          selectedTrack={selectedTrack}
          onSetInspectorHeaderSlot={setInspectorHeaderSlot}
        />
      </InspectorShellPanel>
    </InspectorShellFrame>
  );
}
