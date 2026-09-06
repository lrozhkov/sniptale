import { type ReactNode } from 'react';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import {
  useVideoEditorSidebarController,
  useWorkspaceLayoutContext,
} from '../../runtime/controller/composition/hooks';
import { getWorkspaceSidebarProps } from '../surface/sidebar-props';
import { WorkspaceSidebarPanelContent } from '../sidebar/panel-content';
import { useWorkspaceSidebarState } from '../sidebar/state';
import { WorkspaceSidebarHeader } from '../sidebar/view';
import { translate } from '../../../platform/i18n';
import {
  WorkspacePanelDockToggle,
  WorkspacePanelResizeHandle,
  type WorkspacePanelResize,
} from './panel-layout';

const INSPECTOR_STACK_CLASS_NAME = [
  '@container/inspector relative flex min-h-0 shrink-0',
  'flex-col overflow-hidden p-0',
].join(' ');

type VideoEditorInspectorStackProps = {
  fullHeight?: boolean;
  onToggleFullHeight?: () => void;
  diagnosticsContent: ReactNode;
  resize: WorkspacePanelResize;
};

export function VideoEditorFloatingInspectorStack({
  diagnosticsContent,
  fullHeight = false,
  onToggleFullHeight,
  resize,
}: VideoEditorInspectorStackProps) {
  const controller = useVideoEditorSidebarController(diagnosticsContent);
  const layout = useWorkspaceLayoutContext();
  if (!controller) return null;

  return (
    <VideoEditorFloatingInspectorContent
      controller={controller}
      leftSidebarCollapsed={layout.leftSidebarCollapsed}
      resize={resize}
      fullHeight={fullHeight}
      {...(onToggleFullHeight ? { onToggleFullHeight } : {})}
    />
  );
}

type VideoEditorFloatingInspectorContentProps = {
  fullHeight: boolean;
  onToggleFullHeight?: () => void;
  controller: NonNullable<ReturnType<typeof useVideoEditorSidebarController>>;
  leftSidebarCollapsed: boolean;
  resize: WorkspacePanelResize;
};

function VideoEditorFloatingInspectorContent({
  controller,
  fullHeight,
  onToggleFullHeight,
  leftSidebarCollapsed,
  resize,
}: VideoEditorFloatingInspectorContentProps) {
  const sidebarProps = getWorkspaceSidebarProps(controller);
  const sidebarState = useWorkspaceSidebarState(
    sidebarProps.selection,
    sidebarProps.selectedClip,
    sidebarProps.recordingId,
    sidebarProps.diagnosticsOpen,
    sidebarProps.onToggleDiagnostics,
    sidebarProps.selectedTrack
  );

  if (leftSidebarCollapsed) {
    return null;
  }

  return (
    <>
      <WorkspacePanelResizeHandle
        resize={resize}
        label={translate('videoEditor.sidebar.resizeInspector')}
        dataUi="video-editor.floating.context-inspector.resize"
      />
      <FloatingChromePanel
        dataUi="video-editor.floating.context-inspector"
        className={INSPECTOR_STACK_CLASS_NAME}
        style={{ width: `${resize.width}px` }}
      >
        <div className="flex min-w-0 items-center border-b border-[color:var(--sniptale-color-border-soft)]">
          <div className="min-w-0 flex-1">
            <WorkspaceSidebarHeader
              inspectorMode={sidebarProps.inspectorMode}
              selectionIcon={sidebarState.selectionIcon}
              selectionTitle={sidebarState.selectionTitle}
              selectedTrack={sidebarProps.selectedTrack}
            />
          </div>
          {onToggleFullHeight && (
            <div className="mr-2">
              <WorkspacePanelDockToggle
                fullHeight={fullHeight}
                onToggle={onToggleFullHeight}
                dataUi="video-editor.inspector.dock-toggle"
              />
            </div>
          )}
        </div>
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
        />
      </FloatingChromePanel>
    </>
  );
}
