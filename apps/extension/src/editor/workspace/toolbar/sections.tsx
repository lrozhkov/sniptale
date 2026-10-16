import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Grid2x2, Magnet, Map, Menu, Palette, ZoomIn, ZoomOut } from 'lucide-react';
import type { EditorTool } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { RASTER_TOOL_ORDER, TOOL_ICONS, getToolLabel } from '../../chrome/tool-icons';
import { EditorIconButton } from '../../chrome/ui';
import type { ToolbarInspector } from './types';
import {
  EditorToolbarInspectorButtons,
  EditorToolbarToolButtons,
  getDocumentRequiredTitle,
  toolbarSectionClassName,
} from './section-helpers';

export function EditorToolbarPrimarySection(props: {
  activeInspector: ToolbarInspector | 'tool';
  activeTool: EditorTool;
  hasImage: boolean;
  isToolButtonActive: (tool: EditorTool) => boolean;
  onActivateTool: (tool: EditorTool) => void;
  onToggleInspector: (value: ToolbarInspector) => void;
}) {
  return (
    <div className={toolbarSectionClassName}>
      <EditorIconButton
        title={getDocumentRequiredTitle(translate('editor.toolbar.file'), props.hasImage)}
        onClick={() => props.onToggleInspector('file')}
        active={props.activeInspector === 'file'}
        disabled={!props.hasImage}
      >
        <Menu size={18} strokeWidth={2} />
      </EditorIconButton>
      <EditorToolbarToolButtons
        hasImage={props.hasImage}
        isToolButtonActive={props.isToolButtonActive}
        onActivateTool={props.onActivateTool}
      />
      <EditorToolbarInspectorButtons
        activeInspector={props.activeInspector}
        hasImage={props.hasImage}
        onToggleInspector={props.onToggleInspector}
      />
    </div>
  );
}

export function EditorToolbarCanvasSection(props: {
  hasImage: boolean;
  isCropActive: boolean;
  onActivateCrop: () => void;
}) {
  return (
    <div className={toolbarSectionClassName}>
      <EditorIconButton
        title={getDocumentRequiredTitle(translate('editor.toolbar.crop'), props.hasImage)}
        onClick={props.onActivateCrop}
        active={props.isCropActive}
        disabled={!props.hasImage}
      >
        {TOOL_ICONS.crop}
      </EditorIconButton>
    </div>
  );
}

export function EditorToolbarRasterSection(props: {
  hasImage: boolean;
  isToolButtonActive: (tool: EditorTool) => boolean;
  onActivateTool: (tool: EditorTool) => void;
}) {
  return (
    <div className={toolbarSectionClassName}>
      {RASTER_TOOL_ORDER.map((tool) => (
        <EditorIconButton
          key={tool}
          title={getDocumentRequiredTitle(getToolLabel(tool), props.hasImage)}
          onClick={() => props.onActivateTool(tool)}
          active={props.isToolButtonActive(tool)}
          disabled={!props.hasImage}
        >
          {TOOL_ICONS[tool]}
        </EditorIconButton>
      ))}
    </div>
  );
}

export function EditorToolbarWorkspaceSection(props: {
  gridEnabled: boolean;
  hasImage: boolean;
  inspector: 'workspace' | 'grid' | string;
  magnetEnabled: boolean;
  viewportPreviewOpen: boolean;
  onToggleGrid: () => void;
  onToggleMagnet: () => void;
  onToggleViewportPreview: () => void;
  onToggleWorkspace: () => void;
}) {
  return (
    <div className={toolbarSectionClassName}>
      {buildWorkspaceToolbarButtons(props).map((button) => (
        <EditorIconButton
          key={button.key}
          title={getDocumentRequiredTitle(button.title, props.hasImage)}
          onClick={button.onClick}
          active={button.active}
          disabled={!props.hasImage}
        >
          {button.icon}
        </EditorIconButton>
      ))}
    </div>
  );
}

function buildWorkspaceToolbarButtons(props: {
  gridEnabled: boolean;
  inspector: 'workspace' | 'grid' | string;
  magnetEnabled: boolean;
  viewportPreviewOpen: boolean;
  onToggleGrid: () => void;
  onToggleMagnet: () => void;
  onToggleViewportPreview: () => void;
  onToggleWorkspace: () => void;
}) {
  return [
    {
      key: 'workspace',
      title: translate('editor.toolbar.workspace'),
      onClick: props.onToggleWorkspace,
      active: props.inspector === 'workspace',
      icon: <Palette size={18} strokeWidth={2} />,
    },
    {
      key: 'magnet',
      title: translate('editor.toolbar.magnetMode'),
      onClick: props.onToggleMagnet,
      active: props.magnetEnabled,
      icon: <Magnet size={18} strokeWidth={2} />,
    },
    {
      key: 'grid',
      title: translate('editor.toolbar.gridMode'),
      onClick: props.onToggleGrid,
      active: props.inspector === 'grid' || props.gridEnabled,
      icon: <Grid2x2 size={18} strokeWidth={2} />,
    },
    {
      key: 'viewport',
      title: translate('editor.toolbar.viewportNavigation'),
      onClick: props.onToggleViewportPreview,
      active: props.viewportPreviewOpen,
      icon: <Map size={18} strokeWidth={2} />,
    },
  ];
}

export function EditorToolbarZoomSection(props: { hasImage: boolean; zoomPercent: number }) {
  const controller = useEditorController();
  const shouldFitToWindow = props.zoomPercent === 100;
  const zoomToggleTitle = getZoomToggleTitle(props.hasImage, props.zoomPercent, shouldFitToWindow);

  return (
    <div className={`${toolbarSectionClassName} justify-end`}>
      <EditorIconButton
        title={getDocumentRequiredTitle(translate('editor.toolbar.zoomOut'), props.hasImage)}
        onClick={() => controller.zoomOut()}
        disabled={!props.hasImage}
      >
        <ZoomOut size={18} strokeWidth={2} />
      </EditorIconButton>
      <ContentToolbarButton
        tone="utility"
        title={zoomToggleTitle}
        aria-label={zoomToggleTitle}
        onClick={() => handleZoomToggleClick(controller, props.hasImage, shouldFitToWindow)}
        disabled={!props.hasImage}
        className="min-w-[4.5rem] tabular-nums"
      >
        {props.zoomPercent}%
      </ContentToolbarButton>
      <EditorIconButton
        title={getDocumentRequiredTitle(translate('editor.toolbar.zoomIn'), props.hasImage)}
        onClick={() => controller.zoomIn()}
        disabled={!props.hasImage}
      >
        <ZoomIn size={18} strokeWidth={2} />
      </EditorIconButton>
    </div>
  );
}

function getZoomToggleTitle(hasImage: boolean, zoomPercent: number, shouldFitToWindow: boolean) {
  const nextZoomActionLabel = shouldFitToWindow
    ? translate('editor.toolbar.fitToWindow')
    : translate('editor.toolbar.resetZoomPrefix');
  return getDocumentRequiredTitle(
    `${nextZoomActionLabel} · ${translate('editor.toolbar.zoomCurrentPrefix')} ${zoomPercent}%`,
    hasImage
  );
}

function handleZoomToggleClick(
  controller: Pick<ReturnType<typeof useEditorController>, 'resetZoom' | 'zoomToFit'>,
  hasImage: boolean,
  shouldFitToWindow: boolean
) {
  if (!hasImage) {
    return;
  }

  if (shouldFitToWindow) {
    controller.zoomToFit();
    return;
  }

  controller.resetZoom();
}
