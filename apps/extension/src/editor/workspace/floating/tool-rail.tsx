import { Globe, Info, Redo2, RotateCcw, Undo2, Wallpaper } from 'lucide-react';
import type { EditorTool } from '../../../features/editor/document/types';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { CanvasToolPanel, type CanvasToolAction } from '@sniptale/ui/canvas-tools';
import {
  createCanvasToolAction,
  type CanvasToolDescriptorKind,
} from '@sniptale/ui/canvas-tools/descriptors';
import { FloatingChromeToolbar, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import { RASTER_TOOL_ORDER, TOOL_ORDER, getToolLabel } from '../../chrome/tool-icons';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import { getRedoButtonTitle, getUndoButtonTitle } from '../toolbar/history-titles';
import { getDocumentRequiredTitle } from '../toolbar/section-helpers';
import type { EditorToolbarContentProps, ToolbarInspector } from '../toolbar/types';

const TOOL_RAIL_STACK_CLASS_NAME = floatingChromeClassNames(
  'absolute left-3 top-1/2 z-40 flex -translate-y-1/2 flex-col items-start gap-3',
  'max-[720px]:bottom-3 max-[720px]:left-3 max-[720px]:right-3 max-[720px]:top-auto',
  'max-[720px]:translate-y-0'
);

const TOOL_RAIL_STACK_SHIFTED_CLASS_NAME = floatingChromeClassNames(
  TOOL_RAIL_STACK_CLASS_NAME,
  'min-[721px]:left-[23.75rem]'
);

const TOOL_RAIL_CLASS_NAME = floatingChromeClassNames(
  'flex max-h-[calc(100vh-13rem)] flex-col overflow-y-auto',
  'max-[720px]:max-h-none max-[720px]:w-full max-[720px]:flex-row max-[720px]:flex-wrap',
  'max-[720px]:content-start max-[720px]:gap-1 max-[720px]:overflow-visible'
);

const TOOL_HISTORY_CONTROLS_CLASS_NAME = floatingChromeClassNames(
  'flex-col items-center gap-1.5 p-1.5',
  'max-[720px]:!hidden'
);

const EDITOR_TOOL_DESCRIPTOR_KIND_BY_TOOL = {
  arrow: 'arrow',
  blur: 'blur',
  brush: 'brush',
  callout: 'callout',
  crop: 'shape',
  diamond: 'diamond',
  ellipse: 'ellipse',
  eraser: 'eraser',
  fill: 'fill',
  highlighter: 'highlighter',
  image: 'image',
  line: 'line',
  pencil: 'pencil',
  rectangle: 'rectangle',
  'rough-shape': 'rough-shape',
  select: 'select',
  selection: 'selection',
  'shape-library': 'shape-library',
  'shapes-and-lines': 'shapes-and-lines',
  step: 'step',
  text: 'text',
} satisfies Record<EditorTool, CanvasToolDescriptorKind>;

export function EditorFloatingToolRail(
  props: EditorToolbarContentProps & { leftDrawerOpen?: boolean }
) {
  const stackClassName = props.leftDrawerOpen
    ? TOOL_RAIL_STACK_SHIFTED_CLASS_NAME
    : TOOL_RAIL_STACK_CLASS_NAME;

  return (
    <div data-ui="editor.floating.tool-rail.stack" className={stackClassName}>
      <CanvasToolPanel
        actions={buildEditorToolRailActions(props)}
        className={TOOL_RAIL_CLASS_NAME}
        dataUi="editor.floating.tool-rail"
        dividerClassName="max-[720px]:hidden"
        label={translate('shared.ui.commandPaletteToolsSection')}
        orientation="vertical"
      />
      <EditorFloatingToolHistoryControls
        hasImage={props.hasImage}
        history={props.history}
        onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
      />
    </div>
  );
}

function buildEditorToolRailActions(props: EditorToolbarContentProps): CanvasToolAction[] {
  return [
    ...buildEditorToolActions({
      group: 'primary',
      hasImage: props.hasImage,
      isToolButtonActive: props.isToolButtonActive,
      onActivateTool: props.onActivateTool,
      tools: TOOL_ORDER,
    }),
    ...buildEditorToolActions({
      group: 'secondary',
      hasImage: props.hasImage,
      isToolButtonActive: props.isToolButtonActive,
      onActivateTool: props.onActivateTool,
      tools: RASTER_TOOL_ORDER,
    }),
    ...buildEditorInspectorActions({
      activeInspector: props.inspector,
      hasImage: props.hasImage,
      onToggleInspector: props.onToggleInspector,
    }),
  ];
}

function buildEditorToolActions(props: {
  group: NonNullable<CanvasToolAction['group']>;
  hasImage: boolean;
  isToolButtonActive: (tool: EditorTool) => boolean;
  onActivateTool: (tool: EditorTool) => void;
  tools: readonly EditorTool[];
}): CanvasToolAction[] {
  return props.tools.map((tool) =>
    createCanvasToolAction({
      active: props.isToolButtonActive(tool),
      disabled: !props.hasImage,
      group: props.group,
      id: tool,
      kind: EDITOR_TOOL_DESCRIPTOR_KIND_BY_TOOL[tool],
      label: getDocumentRequiredTitle(getToolLabel(tool), props.hasImage),
      onSelect: () => props.onActivateTool(tool),
    })
  );
}

function buildEditorInspectorActions(props: {
  activeInspector: ToolbarInspector | 'tool';
  hasImage: boolean;
  onToggleInspector: (value: ToolbarInspector) => void;
}): CanvasToolAction[] {
  return createEditorInspectorDescriptors(props.activeInspector).map((descriptor) =>
    createCanvasToolAction({
      active: descriptor.active,
      disabled: !props.hasImage,
      group: 'editor',
      icon: descriptor.icon,
      id: descriptor.id,
      kind: 'workspace',
      label: getDocumentRequiredTitle(descriptor.label, props.hasImage),
      onSelect: () => props.onToggleInspector(descriptor.inspector),
    })
  );
}

function createEditorInspectorDescriptors(activeInspector: ToolbarInspector | 'tool'): Array<{
  active: boolean;
  icon: CanvasToolAction['icon'];
  id: string;
  inspector: ToolbarInspector;
  label: string;
}> {
  return [
    {
      active: activeInspector === 'frame',
      icon: <Wallpaper size={18} strokeWidth={2} />,
      id: 'frame',
      inspector: 'frame',
      label: translate('editor.toolbar.frame'),
    },
    {
      active: activeInspector === 'browser-frame',
      icon: <Globe size={18} strokeWidth={2} />,
      id: 'browser-frame',
      inspector: 'browser-frame',
      label: translate('editor.toolbar.browserFrame'),
    },
    {
      active: activeInspector === 'meta',
      icon: <Info size={18} strokeWidth={2} />,
      id: 'meta',
      inspector: 'meta',
      label: translate('editor.toolbar.meta'),
    },
    {
      active: activeInspector === 'canvas-size' || activeInspector === 'image-size',
      icon: <TablerIcon icon="tabler:resize" size={18} />,
      id: 'canvas-size',
      inspector: 'canvas-size',
      label: translate('editor.toolbar.resize'),
    },
  ];
}

function EditorFloatingToolHistoryControls(props: {
  hasImage: boolean;
  history: { canUndo: boolean; canRedo: boolean };
  onBeforeSelectionAwareAction: () => void;
}) {
  const controller = useEditorController();
  const runSelectionAwareAction = (label: string, action: () => Promise<void> | void) =>
    fireAndReportEditorAction(label, async () => {
      props.onBeforeSelectionAwareAction();
      controller.clearSelection();
      await action();
    });

  return (
    <FloatingChromeToolbar
      dataUi="editor.floating.tool-rail.history"
      className={TOOL_HISTORY_CONTROLS_CLASS_NAME}
    >
      <ContentToolbarButton
        title={getUndoButtonTitle(props.history.canUndo)}
        disabled={!props.history.canUndo}
        onClick={() => runSelectionAwareAction('toolbar-undo', () => controller.undo())}
        dataUi="editor.floating.tool-rail.history.undo"
      >
        <Undo2 size={18} strokeWidth={2} />
      </ContentToolbarButton>
      <ContentToolbarButton
        title={getRedoButtonTitle(props.history.canRedo)}
        disabled={!props.history.canRedo}
        onClick={() => runSelectionAwareAction('toolbar-redo', () => controller.redo())}
        dataUi="editor.floating.tool-rail.history.redo"
      >
        <Redo2 size={18} strokeWidth={2} />
      </ContentToolbarButton>
      <ContentToolbarButton
        title={translate('editor.toolbar.resetOriginal')}
        disabled={!props.hasImage}
        onClick={() =>
          runSelectionAwareAction('toolbar-reset-to-original', () => controller.resetToOriginal())
        }
        dataUi="editor.floating.tool-rail.history.reset"
      >
        <RotateCcw size={18} strokeWidth={2} />
      </ContentToolbarButton>
    </FloatingChromeToolbar>
  );
}
