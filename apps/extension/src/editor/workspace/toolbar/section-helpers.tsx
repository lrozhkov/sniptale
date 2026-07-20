import { Globe, Info, Wallpaper, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { EditorTool } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { EDITOR_TOOLBAR_SECTION_CLASS_NAME } from '@sniptale/ui/editor-chrome';
import { TOOL_ICONS, TOOL_ORDER, getToolLabel } from '../../chrome/tool-icons';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import { EditorIconButton } from '../../chrome/ui';
import type { ToolbarInspector } from './types';

export const toolbarSectionClassName = EDITOR_TOOLBAR_SECTION_CLASS_NAME;

export function getDocumentRequiredTitle(label: string, hasImage: boolean): string {
  return hasImage ? label : `${label} · ${translate('editor.toolbar.documentRequiredReason')}`;
}

function InspectorButton(props: {
  active: boolean;
  dataUi: string;
  hasImage: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <EditorIconButton
      title={getDocumentRequiredTitle(props.label, props.hasImage)}
      onClick={props.onClick}
      active={props.active}
      disabled={!props.hasImage}
      data-ui={props.dataUi}
    >
      {props.icon}
    </EditorIconButton>
  );
}

function createInspectorIcon(Icon: LucideIcon) {
  return <Icon size={18} strokeWidth={2} />;
}

export function EditorToolbarToolButtons(props: {
  hasImage: boolean;
  isToolButtonActive: (tool: EditorTool) => boolean;
  onActivateTool: (tool: EditorTool) => void;
}) {
  return TOOL_ORDER.map((tool) => (
    <EditorIconButton
      key={tool}
      title={getDocumentRequiredTitle(getToolLabel(tool), props.hasImage)}
      onClick={() => props.onActivateTool(tool)}
      active={props.isToolButtonActive(tool)}
      disabled={!props.hasImage}
    >
      {TOOL_ICONS[tool]}
    </EditorIconButton>
  ));
}

export function EditorToolbarInspectorButtons(props: {
  activeInspector: ToolbarInspector | 'tool';
  hasImage: boolean;
  onToggleInspector: (value: ToolbarInspector) => void;
}) {
  return (
    <>
      <InspectorButton
        active={props.activeInspector === 'frame'}
        dataUi="editor.toolbar.inspector.frame"
        hasImage={props.hasImage}
        icon={createInspectorIcon(Wallpaper)}
        label={translate('editor.toolbar.frame')}
        onClick={() => props.onToggleInspector('frame')}
      />
      <InspectorButton
        active={props.activeInspector === 'browser-frame'}
        dataUi="editor.toolbar.inspector.browser-frame"
        hasImage={props.hasImage}
        icon={createInspectorIcon(Globe)}
        label={translate('editor.toolbar.browserFrame')}
        onClick={() => props.onToggleInspector('browser-frame')}
      />
      <InspectorButton
        active={props.activeInspector === 'meta'}
        dataUi="editor.toolbar.inspector.meta"
        hasImage={props.hasImage}
        icon={createInspectorIcon(Info)}
        label={translate('editor.toolbar.meta')}
        onClick={() => props.onToggleInspector('meta')}
      />
      <InspectorButton
        active={props.activeInspector === 'canvas-size' || props.activeInspector === 'image-size'}
        dataUi="editor.toolbar.inspector.canvas-size"
        hasImage={props.hasImage}
        icon={<TablerIcon icon="tabler:resize" size={18} />}
        label={translate('editor.toolbar.resize')}
        onClick={() => props.onToggleInspector('canvas-size')}
      />
    </>
  );
}
