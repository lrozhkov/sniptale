import { Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { EditorTool } from '../../../features/editor/document/types';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { CanvasToolButtons, type CanvasToolAction } from '@sniptale/ui/canvas-tools';
import {
  createCanvasToolAction,
  type CanvasToolDescriptorKind,
} from '@sniptale/ui/canvas-tools/descriptors';
import {
  FloatingChromeDivider,
  FloatingChromeToolbar,
  floatingChromeClassNames,
} from '@sniptale/ui/floating-chrome';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { fireAndReportEditorAction, runAndReportEditorAction } from '../../runtime/async-actions';
import { getToolLabel } from '../../chrome/tool-icons';
import {
  initializeFrameAnnotationCreationDefaults,
  setFrameAnnotationCreationDefaults,
  useFrameAnnotationCreationDefaults,
} from '../../frame-annotation/creation-defaults';
import { FrameAnnotationCreationControls } from '../../../composition/frame-annotation-controls/creation-controls';
import { loadHighlighterSettings } from '../../../composition/persistence/highlighter';
import { getRedoButtonTitle, getUndoButtonTitle } from '../toolbar/history-titles';
import { getDocumentRequiredTitle } from '../toolbar/section-helpers';
import type { EditorToolbarContentProps } from '../toolbar/types';

const TOOL_RAIL_STACK_CLASS_NAME = floatingChromeClassNames(
  'absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-start gap-3',
  'max-[720px]:left-3 max-[720px]:right-3 max-[720px]:translate-x-0',
  'max-[720px]:flex-wrap'
);

const TOOL_RAIL_CLASS_NAME = floatingChromeClassNames(
  'flex-row overflow-visible',
  'max-[720px]:flex-wrap max-[720px]:content-start max-[720px]:gap-1'
);

const TOOL_HISTORY_CONTROLS_CLASS_NAME = floatingChromeClassNames(
  'flex-row items-center gap-1.5 p-1.5',
  'min-[721px]:absolute min-[721px]:left-[calc(100%+0.75rem)] min-[721px]:top-0'
);

const DRAWING_TOOL_ORDER: readonly EditorTool[] = [
  'pencil',
  'marker',
  'text',
  'shape',
  'arrow',
  'blur',
];

const EDITOR_TOOL_DESCRIPTOR_KIND_BY_TOOL = {
  arrow: 'arrow',
  blur: 'blur',
  crop: 'shape',
  marker: 'highlighter',
  'frame-annotation': 'rectangle',
  image: 'image',
  pencil: 'pencil',
  select: 'select',
  shape: 'shapes-and-lines',
  step: 'step',
  text: 'text',
} satisfies Record<EditorTool, CanvasToolDescriptorKind>;

type EditorFloatingToolRailProps = EditorToolbarContentProps & {
  leftDrawerOpen?: boolean;
  onToggleActiveToolOptions?: (tool: EditorTool) => void;
};

export function EditorFloatingToolRail(props: EditorFloatingToolRailProps) {
  const annotationDefaults = useFrameAnnotationCreationDefaults();
  useEffect(() => {
    void initializeFrameAnnotationCreationDefaults(loadHighlighterSettings);
  }, []);
  const selectActions = buildEditorToolActions({
    group: 'primary',
    hasImage: props.hasImage,
    isToolButtonActive: props.isToolButtonActive,
    onActivateTool: props.onActivateTool,
    tools: ['select'],
  });
  const drawingActions = buildEditorToolActions({
    group: 'primary',
    hasImage: props.hasImage,
    isToolButtonActive: props.isToolButtonActive,
    onActivateTool: props.onActivateTool,
    ...(props.onToggleActiveToolOptions
      ? { onToggleActiveToolOptions: props.onToggleActiveToolOptions }
      : {}),
    tools: DRAWING_TOOL_ORDER,
  });

  return (
    <div data-ui="editor.floating.tool-rail.stack" className={TOOL_RAIL_STACK_CLASS_NAME}>
      <FloatingChromeToolbar
        aria-label={translate('shared.ui.commandPaletteToolsSection')}
        className={TOOL_RAIL_CLASS_NAME}
        dataUi="editor.floating.tool-rail"
      >
        <CanvasToolButtons actions={selectActions} dataUi="editor.floating.tool-rail" />
        <FloatingChromeDivider vertical className="max-[720px]:hidden" />
        <div
          className="contents"
          onPointerDown={() => {
            if (!props.isToolButtonActive('frame-annotation')) {
              props.onActivateTool('frame-annotation');
            }
          }}
        >
          <FrameAnnotationCreationControls
            context="content"
            onChange={setFrameAnnotationCreationDefaults}
            settings={annotationDefaults}
          />
        </div>
        <FloatingChromeDivider vertical className="max-[720px]:hidden" />
        <CanvasToolButtons actions={drawingActions} dataUi="editor.floating.tool-rail" />
      </FloatingChromeToolbar>
      <EditorFloatingToolHistoryControls
        hasImage={props.hasImage}
        history={props.history}
        onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
      />
    </div>
  );
}

function buildEditorToolActions(props: {
  group: NonNullable<CanvasToolAction['group']>;
  hasImage: boolean;
  isToolButtonActive: (tool: EditorTool) => boolean;
  onActivateTool: (tool: EditorTool) => void;
  onToggleActiveToolOptions?: (tool: EditorTool) => void;
  tools: readonly EditorTool[];
}): CanvasToolAction[] {
  return props.tools.map((tool) =>
    createCanvasToolAction({
      active: props.isToolButtonActive(tool),
      disabled: !props.hasImage,
      group: props.group,
      id: tool,
      kind: EDITOR_TOOL_DESCRIPTOR_KIND_BY_TOOL[tool],
      label: getDocumentRequiredTitle(getEditorToolTitle(tool), props.hasImage),
      onSelect: () => {
        if (props.isToolButtonActive(tool) && isDrawingOptionsTool(tool)) {
          props.onToggleActiveToolOptions?.(tool);
          return;
        }
        props.onActivateTool(tool);
      },
    })
  );
}

function isDrawingOptionsTool(tool: EditorTool): boolean {
  return (
    tool === 'pencil' ||
    tool === 'marker' ||
    tool === 'shape' ||
    tool === 'arrow' ||
    tool === 'text'
  );
}

function getEditorToolTitle(tool: EditorTool): string {
  const label = getToolLabel(tool);
  const modifierKey =
    tool === 'pencil' || tool === 'marker'
      ? 'content.toolbar.drawingStrokeModifierHint'
      : tool === 'shape'
        ? 'content.toolbar.drawingShapeModifierHint'
        : tool === 'arrow'
          ? 'content.toolbar.drawingArrowModifierHint'
          : tool === 'text'
            ? 'content.toolbar.drawingTextModifierHint'
            : tool === 'select'
              ? 'content.toolbar.drawingSelectModifierHint'
              : null;
  return modifierKey ? `${label}\n${translate(modifierKey)}` : label;
}

function EditorFloatingToolHistoryControls(props: {
  hasImage: boolean;
  history: { canUndo: boolean; canRedo: boolean; index: number };
  onBeforeSelectionAwareAction: () => void;
}) {
  const controller = useEditorController();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const resetAvailable = props.hasImage && props.history.index > 0;
  const runSelectionAwareAction = (label: string, action: () => Promise<void> | void) =>
    fireAndReportEditorAction(label, async () => {
      props.onBeforeSelectionAwareAction();
      controller.clearSelection();
      await action();
    });

  const confirmReset = async () => {
    await runAndReportEditorAction('toolbar-reset-to-original', async () => {
      props.onBeforeSelectionAwareAction();
      controller.clearSelection();
      await controller.resetToOriginal();
    });
    setResetConfirmOpen(false);
  };

  return (
    <>
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
          title={translate('editor.toolbar.resetOriginalTooltip')}
          disabled={!resetAvailable}
          onClick={() => setResetConfirmOpen(true)}
          dataUi="editor.floating.tool-rail.history.reset"
        >
          <RotateCcw size={18} strokeWidth={2} />
        </ContentToolbarButton>
      </FloatingChromeToolbar>
      <ProductConfirmDialog
        isOpen={resetConfirmOpen}
        title={translate('editor.toolbar.resetOriginalTitle')}
        message={translate('editor.toolbar.resetOriginalMessage')}
        confirmText={translate('editor.toolbar.resetOriginal')}
        cancelText={translate('common.actions.cancel')}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={confirmReset}
      />
    </>
  );
}
