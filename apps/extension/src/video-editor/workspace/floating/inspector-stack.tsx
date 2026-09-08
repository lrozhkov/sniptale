import { List, PanelLeft } from 'lucide-react';
import { WorkspacePanelButton, WorkspacePanelHeader } from './panel-header';
import { useWorkspacePreference } from '../../runtime/controller/workspace-preferences';
import { WorkspacePanelCloseButton } from './index';
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
  onClose: () => void;
  fullHeight?: boolean;
  onToggleFullHeight?: () => void;
  resize: WorkspacePanelResize;
};

export function VideoEditorFloatingInspectorStack({
  onClose,
  fullHeight = false,
  onToggleFullHeight,
  resize,
}: VideoEditorInspectorStackProps) {
  const controller = useVideoEditorSidebarController();
  const layout = useWorkspaceLayoutContext();
  if (!controller) return null;

  return (
    <VideoEditorFloatingInspectorContent
      onClose={onClose}
      controller={controller}
      leftSidebarCollapsed={layout.leftSidebarCollapsed}
      resize={resize}
      fullHeight={fullHeight}
      {...(onToggleFullHeight ? { onToggleFullHeight } : {})}
    />
  );
}

type VideoEditorFloatingInspectorContentProps = {
  onClose: () => void;
  fullHeight: boolean;
  onToggleFullHeight?: () => void;
  controller: NonNullable<ReturnType<typeof useVideoEditorSidebarController>>;
  leftSidebarCollapsed: boolean;
  resize: WorkspacePanelResize;
};

function VideoEditorFloatingInspectorContent({
  controller,
  onClose,
  fullHeight,
  onToggleFullHeight,
  leftSidebarCollapsed,
  resize,
}: VideoEditorFloatingInspectorContentProps) {
  const sidebarProps = getWorkspaceSidebarProps(controller);
  const sidebarState = useWorkspaceSidebarState(
    sidebarProps.selection,
    sidebarProps.selectedClip,
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
        <WorkspacePanelHeader
          actions={
            <>
              {onToggleFullHeight && (
                <WorkspacePanelDockToggle
                  fullHeight={fullHeight}
                  onToggle={onToggleFullHeight}
                  dataUi="video-editor.inspector.dock-toggle"
                />
              )}
              <InspectorPresentationToggle />
              <WorkspacePanelCloseButton
                onClose={onClose}
                dataUi="video-editor.inspector.close"
                title={translate('videoEditor.app.collapseInspector')}
              />
            </>
          }
        >
          <WorkspaceSidebarHeader
            inspectorMode={sidebarProps.inspectorMode}
            selectionIcon={sidebarState.selectionIcon}
            selectionTitle={sidebarState.selectionTitle}
            selectedTrack={sidebarProps.selectedTrack}
          />
        </WorkspacePanelHeader>
        <WorkspaceSidebarPanelContent
          {...sidebarProps}
          inputRefs={sidebarState.inputRefs}
          projectsOpen={sidebarState.projectsOpen}
          recordingsOpen={sidebarState.recordingsOpen}
          onToggleProjectsOpen={sidebarState.toggleProjectsOpen}
          onToggleRecordingsOpen={sidebarState.toggleRecordingsOpen}
        />
      </FloatingChromePanel>
    </>
  );
}

function InspectorPresentationToggle() {
  const [mode, setMode] = useWorkspacePreference('inspectorPresentation');
  const all = mode === 'all';
  const Icon = all ? List : PanelLeft;
  const label = translate(
    all ? 'videoEditor.app.inspectorShowSelected' : 'videoEditor.app.inspectorShowAll'
  );
  return (
    <WorkspacePanelButton
      type="button"
      dataUi="video-editor.inspector.presentation-toggle"
      title={label}
      aria-label={label}
      aria-pressed={all}
      onClick={() => setMode(all ? 'sections' : 'all')}
    >
      <Icon size={14} aria-hidden="true" />
    </WorkspacePanelButton>
  );
}
