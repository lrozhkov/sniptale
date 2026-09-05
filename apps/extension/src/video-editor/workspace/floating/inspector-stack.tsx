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
import { INSPECTOR_MAX_WIDTH, INSPECTOR_MIN_WIDTH } from './inspector-resize';
import type { useInspectorResize } from './inspector-resize';

const INSPECTOR_STACK_CLASS_NAME = [
  'relative flex min-h-0 shrink-0',
  'flex-col overflow-hidden p-0',
].join(' ');

type VideoEditorInspectorStackProps = {
  diagnosticsContent: ReactNode;
  resize: ReturnType<typeof useInspectorResize>;
};

export function VideoEditorFloatingInspectorStack({
  diagnosticsContent,
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
    />
  );
}

type VideoEditorFloatingInspectorContentProps = {
  controller: NonNullable<ReturnType<typeof useVideoEditorSidebarController>>;
  leftSidebarCollapsed: boolean;
  resize: ReturnType<typeof useInspectorResize>;
};

function VideoEditorFloatingInspectorContent({
  controller,
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
      <div
        role="separator"
        aria-label={translate('videoEditor.sidebar.resizeInspector')}
        aria-orientation="vertical"
        aria-valuemin={INSPECTOR_MIN_WIDTH}
        aria-valuemax={INSPECTOR_MAX_WIDTH}
        aria-valuenow={resize.width}
        tabIndex={0}
        data-ui="video-editor.floating.context-inspector.resize"
        className={[
          'pointer-events-auto relative w-2 shrink-0 cursor-col-resize',
          'hover:bg-[var(--sniptale-color-accent)] focus-visible:bg-[var(--sniptale-color-accent)]',
          'focus-visible:outline-none',
        ].join(' ')}
        onKeyDown={resize.onKeyDown}
        onPointerDown={resize.onPointerDown}
      />
      <FloatingChromePanel
        dataUi="video-editor.floating.context-inspector"
        className={INSPECTOR_STACK_CLASS_NAME}
        style={{ width: `${resize.width}px` }}
      >
        <WorkspaceSidebarHeader
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
        />
      </FloatingChromePanel>
    </>
  );
}
