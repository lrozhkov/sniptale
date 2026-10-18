import { useVideoProjectTextRewrite } from '../../runtime/session/text-rewrite';
import { ExportSettingsPanel } from '../../export/dialog';
import { useVideoProjectRecognition } from '../../runtime/session/recognition';
import { FileOutput, List, PanelLeft } from 'lucide-react';
import { WorkspacePanelButton, WorkspacePanelHeader } from './panel-header';
import { useWorkspacePreference } from '../../runtime/controller/workspace-preferences';
import { WorkspacePanelCloseButton } from './index';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import {
  useVideoEditorSidebarController,
  useVideoEditorOverlaysController,
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
  const { exportDialog } = useVideoEditorOverlaysController();
  const layout = useWorkspaceLayoutContext();
  if (!controller) return null;

  return (
    <VideoEditorFloatingInspectorContent
      onClose={onClose}
      controller={controller}
      exportDialog={exportDialog}
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
  exportDialog: ReturnType<typeof useVideoEditorOverlaysController>['exportDialog'];
  resize: WorkspacePanelResize;
};

function VideoEditorFloatingInspectorContent({
  controller,
  exportDialog,
  onClose,
  fullHeight,
  onToggleFullHeight,
  leftSidebarCollapsed,
  resize,
}: VideoEditorFloatingInspectorContentProps) {
  const sidebarProps = getWorkspaceSidebarProps(controller);
  const recognition = useVideoProjectRecognition(sidebarProps.project);
  const textRewrite = useVideoProjectTextRewrite(sidebarProps.project);
  const sidebarState = useWorkspaceSidebarState(
    sidebarProps.selection,
    sidebarProps.selectedClip,
    sidebarProps.selectedTrack,
    sidebarProps.project
  );

  const exportSettings =
    exportDialog.isOpen && exportDialog.settings && exportDialog.sourceDimensions
      ? { settings: exportDialog.settings, sourceDimensions: exportDialog.sourceDimensions }
      : null;

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
              {!exportSettings ? <InspectorPresentationToggle /> : null}
              {onToggleFullHeight && (
                <WorkspacePanelDockToggle
                  fullHeight={fullHeight}
                  onToggle={onToggleFullHeight}
                  dataUi="video-editor.inspector.dock-toggle"
                />
              )}
              <WorkspacePanelCloseButton
                onClose={() => {
                  if (exportSettings) exportDialog.onClose();
                  onClose();
                }}
                dataUi="video-editor.inspector.close"
                title={translate('videoEditor.app.collapseInspector')}
              />
            </>
          }
        >
          {exportSettings ? (
            <span
              className={[
                'inline-flex items-center gap-2 text-sm font-medium',
                'text-[var(--sniptale-color-text-primary)]',
              ].join(' ')}
            >
              <FileOutput size={16} aria-hidden="true" />
              {translate('videoEditor.exportDialog.title')}
            </span>
          ) : (
            <WorkspaceSidebarHeader
              inspectorMode={sidebarProps.inspectorMode}
              selectionIcon={sidebarState.selectionIcon}
              selectionTitle={sidebarState.selectionTitle}
              selectedTrack={sidebarProps.selectedTrack}
            />
          )}
        </WorkspacePanelHeader>
        <div
          hidden={Boolean(exportSettings)}
          inert={Boolean(exportSettings)}
          className={exportSettings ? 'hidden' : 'flex min-h-0 flex-1 flex-col overflow-hidden'}
        >
          <WorkspaceSidebarPanelContent
            {...sidebarProps}
            recognition={recognition}
            textRewrite={textRewrite}
            inputRefs={sidebarState.inputRefs}
            projectsOpen={sidebarState.projectsOpen}
            recordingsOpen={sidebarState.recordingsOpen}
            onToggleProjectsOpen={sidebarState.toggleProjectsOpen}
            onToggleRecordingsOpen={sidebarState.toggleRecordingsOpen}
          />
        </div>
        {exportSettings ? (
          <ExportSettingsPanel
            estimateContext={exportDialog.estimateContext}
            settings={exportSettings.settings}
            sourceDimensions={exportSettings.sourceDimensions}
            selectedClipAvailable={exportDialog.selectedClipId != null}
            selectedRangeAvailable={exportDialog.selectedRangeAvailable ?? false}
            onClose={exportDialog.onClose}
            onChange={exportDialog.onChange}
            onExport={exportDialog.onExport}
          />
        ) : null}
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
