import { useState, type ReactNode } from 'react';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import {
  useVideoEditorSidebarController,
  useWorkspaceLayoutContext,
} from '../../runtime/controller/composition/hooks';
import { getWorkspaceSidebarProps } from '../surface/sidebar-props';
import { WorkspaceSidebarPanelContent } from '../sidebar/panel-content';
import { useWorkspaceSidebarState } from '../sidebar/state';
import { WorkspaceSidebarHeader } from '../sidebar/view';
import type { InspectorGroupHeaderSlot } from '../sidebar/selection/grouped-inspector';
import { translate } from '../../../platform/i18n';
import { INSPECTOR_MAX_WIDTH, INSPECTOR_MIN_WIDTH, useInspectorResize } from './inspector-resize';

const INSPECTOR_STACK_CLASS_NAME = [
  'absolute bottom-3 right-3 top-[4.75rem] z-40 flex max-w-[calc(100vw-5.5rem)]',
  'flex-col overflow-hidden p-0 max-[1120px]:hidden',
].join(' ');

type VideoEditorInspectorStackProps = {
  diagnosticsContent: ReactNode;
};

export function VideoEditorFloatingInspectorStack({
  diagnosticsContent,
}: VideoEditorInspectorStackProps) {
  const controller = useVideoEditorSidebarController(diagnosticsContent);
  const layout = useWorkspaceLayoutContext();
  if (!controller) return null;
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
  const resize = useInspectorResize();

  if (layout.leftSidebarCollapsed) {
    return null;
  }

  return (
    <FloatingChromePanel
      dataUi="video-editor.floating.context-inspector"
      className={INSPECTOR_STACK_CLASS_NAME}
      style={{ width: `${resize.width}px` }}
    >
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
          'absolute bottom-2 left-0 top-2 z-10 w-1 -translate-x-1/2 cursor-col-resize rounded-full',
          'hover:bg-[var(--sniptale-color-accent)] focus-visible:bg-[var(--sniptale-color-accent)]',
          'focus-visible:outline-none',
        ].join(' ')}
        onKeyDown={resize.onKeyDown}
        onPointerDown={resize.onPointerDown}
      />
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
