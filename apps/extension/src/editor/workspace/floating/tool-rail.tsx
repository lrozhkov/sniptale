import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
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
import { TOOL_ICONS, getToolLabel } from '../../chrome/tool-icons';
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
import { useEditorController } from '../../application/controller-context';
import { EditorRasterTools } from './raster-tools';

const subscribeWithoutRuntime = () => () => undefined;
const snapshotWithoutRuntime = () => null;

const TOOL_RAIL_STACK_CLASS_NAME = floatingChromeClassNames(
  'absolute left-1/2 top-3 z-40 flex items-start gap-3',
  'max-[1439px]:!left-0 max-[1439px]:!right-0',
  'max-[1439px]:justify-center'
);

const TOOL_RAIL_CLASS_NAME = floatingChromeClassNames(
  'flex-row overflow-visible -translate-x-1/2 max-[1439px]:!translate-none'
);

function usePixelAlignedToolRail() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const toolbar = ref.current;
    if (!toolbar) return;
    let adjustment = 0;
    const update = () => {
      const baseLeft = toolbar.getBoundingClientRect().left - adjustment;
      const ratio = window.devicePixelRatio;
      adjustment = Math.round(baseLeft * ratio) / ratio - baseLeft;
      // Tailwind centers with the individual translate property; keep that separate from this correction.
      toolbar.style.transform = `translateX(${adjustment}px)`;
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(toolbar);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      toolbar.style.removeProperty('transform');
    };
  }, []);
  return ref;
}

const DRAWING_TOOL_ORDER: readonly EditorTool[] = [
  'pencil',
  'marker',
  'text',
  'shape',
  'arrow',
  'blur',
  'simplify',
];

const EDITOR_TOOL_DESCRIPTOR_KIND_BY_TOOL = {
  arrow: 'arrow',
  simplify: 'image',
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
  onOpenRasterAdjustments?: (targetId: string) => void;
  onToggleActiveToolOptions?: (tool: EditorTool) => void;
};

export function EditorFloatingToolRail(props: EditorFloatingToolRailProps) {
  const railRef = usePixelAlignedToolRail();
  const controller = useEditorController();
  const rasterRuntime = controller.getRasterRuntime();
  const rasterSnapshot = useSyncExternalStore(
    rasterRuntime?.subscribe ?? subscribeWithoutRuntime,
    rasterRuntime?.getSnapshot ?? snapshotWithoutRuntime
  );
  const annotationDefaults = useFrameAnnotationCreationDefaults();
  const creationKind = useEditorStore((state) => state.frameAnnotationCreationKind);
  const setCreationKind = useEditorStore((state) => state.setFrameAnnotationCreationKind);
  const annotationModeActive = props.isToolButtonActive('frame-annotation');
  const frameAnnotationActive = annotationModeActive && creationKind === null;
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
        ref={railRef}
        aria-label={translate('shared.ui.commandPaletteToolsSection')}
        className={TOOL_RAIL_CLASS_NAME}
        dataUi="editor.floating.tool-rail"
      >
        {rasterSnapshot?.editing && rasterRuntime ? (
          <EditorRasterTools
            runtime={rasterRuntime}
            {...(props.onOpenRasterAdjustments
              ? { onOpenAdjustments: props.onOpenRasterAdjustments }
              : {})}
          />
        ) : (
          <>
            <CanvasToolButtons actions={selectActions} dataUi="editor.floating.tool-rail" />
            <ContentToolbarDivider dataUi="editor.floating.tool-rail.divider.before-drawing" />
            <CanvasToolButtons actions={drawingActions} dataUi="editor.floating.tool-rail" />
            <ContentToolbarDivider dataUi="editor.floating.tool-rail.divider.before-frame" />
            <div className="contents">
              <FrameAnnotationCreationControls
                allowInactiveFrameMenu
                context="content"
                disabled={!props.hasImage}
                frameActive={frameAnnotationActive}
                allowElementPlacement={false}
                standaloneTool={annotationModeActive ? creationKind : null}
                onStandaloneCreationChange={(options) => {
                  props.onActivateTool(options ? 'frame-annotation' : 'select');
                  setCreationKind(options?.annotationKind ?? null);
                }}
                onFrameActiveChange={(active) => {
                  setCreationKind(null);
                  props.onActivateTool(active ? 'frame-annotation' : 'select');
                }}
                onChange={setFrameAnnotationCreationDefaults}
                settings={annotationDefaults}
              />
            </div>
          </>
        )}
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
      ...(tool === 'simplify' ? { icon: TOOL_ICONS.simplify } : {}),
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
    tool === 'simplify' ||
    tool === 'blur' ||
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
