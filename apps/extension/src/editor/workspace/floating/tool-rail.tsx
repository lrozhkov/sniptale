import { useEffect } from 'react';
import type { EditorTool } from '../../../features/editor/document/types';
import { ContentToolbarDivider } from '@sniptale/ui/content-toolbar';
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
import { translate } from '../../../platform/i18n';
import { useEditorEmbedContext } from '../../application/embed-context/context';
import { useEditorStore } from '../../state/useEditorStore';
import { getToolLabel } from '../../chrome/tool-icons';
import {
  initializeFrameAnnotationCreationDefaults,
  setFrameAnnotationCreationDefaults,
  useFrameAnnotationCreationDefaults,
} from '../../frame-annotation/creation-defaults';
import { FrameAnnotationCreationControls } from '../../../composition/frame-annotation-controls/creation-controls';
import { loadHighlighterSettings } from '../../../composition/persistence/highlighter';
import { getDocumentRequiredTitle } from '../toolbar/section-helpers';
import type { EditorToolbarContentProps } from '../toolbar/types';
import { EditorFloatingToolHistoryControls } from './history-controls';
import { DocumentAutosaveStatus } from './document-autosave-status';

const TOOL_RAIL_STACK_CLASS_NAME = floatingChromeClassNames(
  'absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-start gap-3',
  'max-[720px]:left-3 max-[720px]:right-3 max-[720px]:translate-x-0',
  'max-[720px]:flex-wrap'
);

const TOOL_RAIL_CLASS_NAME = floatingChromeClassNames(
  'flex-row overflow-visible',
  'max-[720px]:flex-wrap max-[720px]:content-start max-[720px]:gap-1'
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
  const frameAnnotationActive = props.isToolButtonActive('frame-annotation');
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
    <div
      data-ui="editor.floating.tool-rail.stack"
      className={floatingChromeClassNames(
        TOOL_RAIL_STACK_CLASS_NAME,
        'min-[721px]:max-[1439px]:!top-[4.75rem] max-[720px]:!top-[8.5rem]'
      )}
    >
      <FloatingChromeToolbar
        aria-label={translate('shared.ui.commandPaletteToolsSection')}
        className={TOOL_RAIL_CLASS_NAME}
        dataUi="editor.floating.tool-rail"
      >
        <CanvasToolButtons actions={selectActions} dataUi="editor.floating.tool-rail" />
        <ContentToolbarDivider dataUi="editor.floating.tool-rail.divider.before-frame" />
        <div className="contents">
          <FrameAnnotationCreationControls
            allowInactiveFrameMenu
            context="content"
            disabled={!props.hasImage}
            frameActive={frameAnnotationActive}
            onFrameActiveChange={(active) =>
              props.onActivateTool(active ? 'frame-annotation' : 'select')
            }
            onChange={setFrameAnnotationCreationDefaults}
            settings={annotationDefaults}
            showCallout={frameAnnotationActive}
            showStepBadge={frameAnnotationActive}
          />
        </div>
        <ContentToolbarDivider dataUi="editor.floating.tool-rail.divider.after-frame" />
        <CanvasToolButtons actions={drawingActions} dataUi="editor.floating.tool-rail" />
      </FloatingChromeToolbar>
      <EditorFloatingToolHistoryControls
        autosaveControl={<ImageHistoryAutosave hasImage={props.hasImage} />}
        hasImage={props.hasImage}
        history={props.history}
        onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
      />
    </div>
  );
}

function ImageHistoryAutosave({ hasImage }: { hasImage: boolean }) {
  const standalone = useEditorEmbedContext().mode !== 'scenario';
  const sessionId = useEditorStore((state) => state.sessionId);
  if (!standalone || !hasImage) return null;
  return (
    <>
      <FloatingChromeDivider vertical />
      <DocumentAutosaveStatus key={sessionId} />
    </>
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
